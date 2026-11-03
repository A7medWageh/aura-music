import React, { useEffect, useMemo, useState } from "react";
import { View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Music } from "lucide-react-native";
import { Color, Radius } from "@/theme";
import { getArtworkFallbackChain } from "@/utils/media";
import { fetchRealtimeArtwork } from "@/utils/artworkResolver";
import { PLACEHOLDER_SONG } from "@/constants/placeholders";

export type ArtShape = "arch" | "slab" | "coin" | "tile";

const SHAPE_STYLE: Record<ArtShape, ViewStyle> = {
  arch: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderBottomLeftRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
  },
  slab: { borderRadius: Radius.lg },
  coin: { borderRadius: Radius.pill },
  tile: { borderRadius: Radius.md },
};

const fill: ViewStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

const imageFill: ImageStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
};

interface AuraArtworkProps {
  uri?: string | null;
  title?: string | null;
  artist?: string | null;
  placeholder?: number;
  size: number;
  shape?: ArtShape;
  ratio?: number;
  ring?: "none" | "hairline" | "gold";
  glow?: boolean;
  scrim?: boolean;
  fillParent?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export const AuraArtwork: React.FC<AuraArtworkProps> = ({
  uri,
  title,
  artist,
  placeholder,
  size,
  shape = "slab",
  ratio = 1,
  ring = "hairline",
  glow = false,
  scrim = false,
  fillParent = false,
  style,
  children,
}) => {
  const [resolvedUri, setResolvedUri] = useState<string | null>(null);

  useEffect(() => {
    setResolvedUri(null);
  }, [uri]);

  const targetUri = resolvedUri || uri;
  const chain = useMemo(() => getArtworkFallbackChain(targetUri, artist), [targetUri, artist]);
  const [attempt, setAttempt] = useState(0);

  const [rejectedUris, setRejectedUris] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setAttempt(0);
  }, [chain]);

  // When image is missing or failed, dynamically resolve live official artwork
  useEffect(() => {
    if ((!targetUri || attempt >= chain.length) && (title || artist)) {
      let isMounted = true;
      fetchRealtimeArtwork(title, artist).then((res) => {
        if (isMounted && res && res !== targetUri) {
          setResolvedUri(res);
          setAttempt(0);
        }
      });
      return () => {
        isMounted = false;
      };
    }
  }, [targetUri, attempt, chain.length, title, artist]);

  const activeUri = chain[attempt] ?? null;
  const isRejected = activeUri ? !!rejectedUris[activeUri] : false;

  return (
    <View
      style={[
        fillParent
          ? { flex: 1 }
          : { width: size, height: Math.round(size * ratio) },
        SHAPE_STYLE[shape],
        {
          backgroundColor: Color.ink1,
          overflow: "hidden",
          borderWidth: ring === "none" ? 0 : 1,
          borderColor:
            ring === "gold" ? Color.veil_goldHairline : Color.veil_hairline,
        },
        style,
      ]}
    >
      {(!activeUri || isRejected || attempt >= chain.length) ? (
        <View style={[imageFill, { backgroundColor: Color.ink2, alignItems: "center", justifyContent: "center" }]}>
          <LinearGradient
            colors={["rgba(226,177,60,0.12)", "rgba(16,13,11,0.95)"]}
            style={imageFill}
          />
          <Music size={Math.max(16, Math.min(32, Math.round(size * 0.36)))} color={Color.gold500} opacity={0.65} />
        </View>
      ) : (
        <Image
          key={`${activeUri}-${attempt}`}
          source={{ uri: activeUri }}
          style={imageFill}
          contentFit="cover"
          transition={220}
          cachePolicy="memory-disk"
          onLoad={(e: any) => {
            const nw = e?.source?.width ?? e?.target?.naturalWidth;
            const nh = e?.source?.height ?? e?.target?.naturalHeight;
            // 120x90 is YouTube's 404/deleted video placeholder image
            if (activeUri && activeUri.includes("ytimg") && nw === 120 && nh === 90) {
              setRejectedUris((prev) => ({ ...prev, [activeUri]: true }));
              setAttempt((i) => i + 1);
            }
          }}
          onError={() => {
            if (activeUri) {
              setRejectedUris((prev) => ({ ...prev, [activeUri]: true }));
            }
            setAttempt((i) => i + 1);
          }}
        />
      )}
      {scrim && (
        <LinearGradient
          colors={["rgba(10,9,8,0)", "rgba(10,9,8,0.42)", "rgba(10,9,8,0.94)"]}
          locations={[0, 0.5, 1]}
          style={fill}
        />
      )}
      {children}
    </View>
  );
};

export const AuraArtGlow: React.FC<{ size: number; style?: StyleProp<ViewStyle> }> = ({
  size,
  style,
}) => (
  <View
    pointerEvents="none"
    style={[
      {
        position: "absolute",
        width: size,
        height: size * 0.35,
        borderRadius: Radius.pill,
        backgroundColor: Color.veil_goldGlowSoft,
      },
      style,
    ]}
  />
);
