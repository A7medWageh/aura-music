import React, { memo, useEffect } from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Play, Pause, SkipForward, SkipBack, Heart, X } from "lucide-react-native";
import { Color, Gradient, Radius, Space } from "@/theme";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useLibraryStore } from "@/store/useLibraryStore";
import { AuraArtwork, AuraBadge, AuraPlayPulse, AuraText, AuraTouch } from "@/ui";
import { resolveArtworkUri } from "@/utils/media";
import { NAV_ROW_HEIGHT } from "./MobileTabBar";

const RING_SIZE = 54;
const RING_STROKE = 2.5;
const ART_SIZE = 44;

// The cover turns like a small record while playing, with a gold progress ring around it.
const SpinningArt = memo(function SpinningArt({
  uri,
  title,
  artist,
  playing,
  progress,
}: {
  uri: string | null;
  title: string;
  artist: string;
  playing: boolean;
  progress: number;
}) {
  const angle = useSharedValue(0);

  useEffect(() => {
    if (!playing) {
      cancelAnimation(angle);
      return;
    }
    const from = angle.value % 360;
    angle.value = from;
    angle.value = withRepeat(withTiming(from + 360, { duration: 9000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(angle);
  }, [playing, angle]);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${angle.value}deg` }],
  }));

  const center = RING_SIZE / 2;
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={styles.ringSlot}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={StyleSheet.absoluteFill}>
        <Circle cx={center} cy={center} r={radius} fill="none" stroke={Color.veil_hairlineStrong} strokeWidth={RING_STROKE} />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={Color.gold500}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <Animated.View style={spinStyle}>
        <AuraArtwork uri={uri} title={title} artist={artist} size={ART_SIZE} shape="coin" ring="none" />
      </Animated.View>
    </View>
  );
});

// A soft gold line along the top edge that breathes while music plays.
const BreathingFilament = memo(function BreathingFilament({ playing }: { playing: boolean }) {
  const glow = useSharedValue(0.45);

  useEffect(() => {
    if (!playing) {
      cancelAnimation(glow);
      glow.value = withTiming(0.45, { duration: 300 });
      return;
    }
    glow.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(glow);
  }, [playing, glow]);

  const style = useAnimatedStyle(() => ({ opacity: glow.value }));

  return (
    <Animated.View pointerEvents="none" style={[styles.topFilament, style]}>
      <LinearGradient
        colors={["rgba(226,177,60,0)", Color.gold300, "rgba(226,177,60,0)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
});

export const MiniPlayer: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const currentSong = usePlayerStore((s) => s.currentSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const setFullPlayerVisible = usePlayerStore((s) => s.setFullPlayerVisible);
  const closePlayer = usePlayerStore((s) => s.closePlayer);
  const isFav = useLibraryStore((s) => (currentSong ? s.isFavorite(currentSong.id) : false));
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);

  const artwork = currentSong
    ? resolveArtworkUri(
        currentSong.localArtworkPath,
        currentSong.thumbnailUrl,
        currentSong.youtubeVideoId,
        "song",
        currentSong.artist
      )
    : "";

  if (!currentSong) return null;

  const validDuration = duration && isFinite(duration) && duration > 0 ? duration : 0;
  const validPosition = position && isFinite(position) && position > 0 ? position : 0;
  const progress = validDuration > 0 ? Math.min(1, Math.max(0, validPosition / validDuration)) : 0;
  const preparing = isBuffering && validPosition === 0;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.dock, { bottom: NAV_ROW_HEIGHT + Math.max(insets.bottom, 8) + 14 }]}
    >
      <View style={styles.strip}>
        <BreathingFilament playing={isPlaying && !isBuffering} />

        <AuraTouch
          feedback="none"
          pressedScale={1}
          onPress={() => setFullPlayerVisible(true)}
          style={styles.row}
        >
          <SpinningArt
            uri={artwork}
            title={currentSong.title}
            artist={currentSong.artist}
            playing={isPlaying && !isBuffering}
            progress={progress}
          />

          <View style={styles.info}>
            <AuraText role="label" lines={1} color={Color.text_primary}>
              {preparing ? "جاري التجهيز…" : currentSong.title}
            </AuraText>
            <View style={styles.metaRow}>
              <AuraPlayPulse playing={isPlaying && !isBuffering} size={10} />
              <AuraText role="caption" lines={1} style={styles.artist}>
                {preparing ? "يتم جلب أفضل جودة" : currentSong.artist}
              </AuraText>
              {!!currentSong.isDownloaded && <AuraBadge label="أوفلاين" tone="live" />}
            </View>
          </View>

          <View style={styles.transport}>
            {/* Narrow phones keep the title readable; previous stays in the full player */}
            {width >= 400 && (
              <AuraTouch
                feedback="selection"
                pressedScale={0.9}
                onPress={(e) => {
                  e.stopPropagation();
                  prevTrack();
                }}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                style={styles.iconBtn}
              >
                <SkipBack size={17} color={Color.text_secondary} fill={Color.text_secondary} style={styles.skipGlyph} />
              </AuraTouch>
            )}

            <AuraTouch
              feedback="impact"
              pressedScale={0.92}
              onPress={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              style={styles.playShell}
            >
              <LinearGradient
                colors={Gradient.signature}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={styles.playFace}
              >
                {isPlaying ? (
                  <Pause size={17} color={Color.text_onBrand} fill={Color.text_onBrand} />
                ) : (
                  <Play size={17} color={Color.text_onBrand} fill={Color.text_onBrand} style={styles.playNudge} />
                )}
              </LinearGradient>
            </AuraTouch>

            <AuraTouch
              feedback="selection"
              pressedScale={0.9}
              onPress={(e) => {
                e.stopPropagation();
                nextTrack();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              style={styles.iconBtn}
            >
              <SkipForward size={17} color={Color.text_secondary} fill={Color.text_secondary} style={styles.skipGlyph} />
            </AuraTouch>

            <AuraTouch
              feedback="impact"
              pressedScale={0.88}
              onPress={(e) => {
                e.stopPropagation();
                toggleFavorite(currentSong);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
              style={styles.miniAction}
            >
              <Heart
                size={16}
                color={isFav ? Color.gold500 : Color.text_muted}
                fill={isFav ? Color.gold500 : "transparent"}
              />
            </AuraTouch>

            <AuraTouch
              feedback="selection"
              pressedScale={0.88}
              onPress={(e) => {
                e.stopPropagation();
                closePlayer();
              }}
              hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
              style={styles.miniAction}
            >
              <X size={16} color={Color.text_muted} />
            </AuraTouch>
          </View>
        </AuraTouch>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 44,
    paddingHorizontal: Space.s2,
  },
  strip: {
    width: "100%",
    maxWidth: 620,
    backgroundColor: "rgba(20, 17, 11, 0.97)",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.75,
    shadowRadius: 20,
    elevation: 20,
    overflow: "hidden",
  },
  topFilament: {
    position: "absolute",
    top: 0,
    left: 40,
    right: 40,
    height: 1.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    paddingStart: Space.s2,
    paddingEnd: Space.s2,
    paddingVertical: 6,
    minHeight: 66,
  },
  ringSlot: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    marginTop: 2,
  },
  artist: {
    flexShrink: 1,
  },
  transport: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  iconBtn: {
    padding: Space.s2,
  },
  miniAction: {
    paddingVertical: Space.s2,
    paddingHorizontal: 4,
  },
  playShell: {
    width: 42,
    height: 42,
    borderRadius: Radius.pill,
  },
  playFace: {
    width: "100%",
    height: "100%",
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  playNudge: {
    marginLeft: 2,
  },
  skipGlyph: { transform: [{ scaleX: -1 }] },
});
