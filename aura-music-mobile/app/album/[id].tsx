import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, Dimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSafeTopInset } from "@/utils/safeArea";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, Play, Shuffle, DownloadCloud } from "lucide-react-native";

import { Color, Gradient, Radius, Space } from "@/theme";
import { Song } from "@/types/music";
import { MusicApi } from "@/services/api/musicApi";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useDownloadStore } from "@/store/useDownloadStore";
import { SongItem } from "@/components/SongItem";
import { AuraCreativeLoader } from "@/components/AuraCreativeLoader";
import { resolveArtworkUri } from "@/utils/media";
import { PLACEHOLDER_ALBUM } from "@/constants/placeholders";
import {
  AuraArtGlow,
  AuraArtwork,
  AuraBadge,
  AuraCanvas,
  AuraFadeIn,
  AuraHairline,
  AuraKicker,
  AuraPageTransition,
  AuraSection,
  AuraSurface,
  AuraText,
  AuraTouch,
  useDockClearance,
} from "@/ui";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const COVER_W = Math.round(SCREEN_WIDTH * 0.5);
const absFill = StyleSheet.absoluteFill as any;

export default function AlbumDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = getSafeTopInset(insets.top);
  const dockClearance = useDockClearance();
  const { id, title, artist, coverUrl } = useLocalSearchParams<{
    id: string;
    title?: string;
    artist?: string;
    coverUrl?: string;
  }>();

  const [albumDetails, setAlbumDetails] = useState<any>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  const playSong = usePlayerStore((s) => s.playSong);
  const downloadSong = useDownloadStore((s) => s.downloadSong);

  useEffect(() => {
    async function loadAlbum() {
      if (!id) return;
      setLoading(true);
      try {
        const data = await MusicApi.getAlbum(id);
        if (data) {
          setAlbumDetails(data);
          setSongs(data.songs || []);
        } else {
          const searchRes = await MusicApi.search(title || id);
          setSongs(searchRes.songs || []);
        }
      } catch (err) {
        console.warn("[AlbumDetailScreen] Error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadAlbum();
  }, [id, title]);

  const albumTitle = albumDetails?.title || title || "ألبوم";
  const albumArtist = albumDetails?.artist || artist || "فنان";
  const albumCover = resolveArtworkUri(
    null,
    albumDetails?.thumbnailUrl || albumDetails?.coverUrl || coverUrl,
    undefined,
    "album",
  );
  const pending = songs.filter((s) => !s.isDownloaded).length;
  // YouTube shelf labels arrive as e.g. "Album • 2009"; keep only the year.
  const albumYear = /(?:19|20)\d{2}/.exec(String(albumDetails?.year || ""))?.[0];

  const playFrom = (shuffleMode: boolean) => {
    if (songs.length === 0) return;
    const queue = shuffleMode
      ? [...songs].sort(() => Math.random() - 0.5)
      : [...songs];
    playSong(queue[0], queue, 0);
  };

  const handleDownloadAll = () => {
    for (const song of songs) {
      if (!song.isDownloaded) downloadSong(song);
    }
  };

  if (loading && songs.length === 0) {
    return (
      <View style={styles.root}>
        <AuraCanvas intensity="ember" />
        <View style={[styles.loadingBackWrap, { top: insets.top + Space.s2, right: Space.s4 }]}>
          <AuraTouch
            feedback="selection"
            pressedScale={0.9}
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.backBtn}
          >
            <ChevronRight size={20} color={Color.text_primary} />
          </AuraTouch>
        </View>
        <AuraCreativeLoader
          fullscreen
          message={`جارٍ استدعاء مسارات ألبوم ${albumTitle}… 🎵`}
        />
      </View>
    );
  }

  return (
    <AuraPageTransition style={styles.root}>
      <AuraCanvas intensity="ember" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInset + Space.s2, paddingBottom: dockClearance + Space.s5 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <AuraTouch
          feedback="selection"
          pressedScale={0.9}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
        >
          <ChevronRight size={20} color={Color.text_primary} />
        </AuraTouch>

        {/* ── HERO ── */}
        <AuraFadeIn delay={40} slideDistance={14}>
          <View style={styles.hero}>
          <View>
            <AuraArtGlow size={COVER_W} style={styles.coverGlow} />
            <AuraArtwork
              uri={albumCover}
              placeholder={PLACEHOLDER_ALBUM}
              size={COVER_W}
              shape="slab"
              ring="hairline"
            />
          </View>

          <View style={styles.heroCopy}>
            <AuraKicker>الألبوم</AuraKicker>
            <AuraText role="displaySm" lines={2}>
              {albumTitle}
            </AuraText>
            <AuraTouch
              feedback="selection"
              pressedScale={1}
              onPress={() =>
                router.push({
                  pathname: "/artist/[id]",
                  params: { id: albumArtist, name: albumArtist },
                })
              }
            >
              <AuraText role="caption" color={Color.gold300}>
                {albumArtist}
              </AuraText>
            </AuraTouch>
            <View style={styles.metaRow}>
              <AuraText role="tiny" color={Color.text_muted}>
                {songs.length} أغنية
              </AuraText>
              {!!albumYear && <AuraBadge label={albumYear} tone="quiet" />}
              {pending > 0 && <AuraBadge label={`${pending} قيد التنزيل`} tone="gold" />}
            </View>
          </View>
        </View>

        {songs.length > 0 && (
          <View style={styles.actions}>
            <AuraTouch
              feedback="medium"
              pressedScale={0.97}
              onPress={() => playFrom(false)}
              style={styles.playPill}
            >
              <LinearGradient
                colors={Gradient.signature}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={absFill}
              />
              <Play size={15} color={Color.text_onBrand} fill={Color.text_onBrand} />
              <AuraText role="bodyStrong" color={Color.text_onBrand}>
                تشغيل الألبوم
              </AuraText>
            </AuraTouch>

            <AuraTouch
              feedback="impact"
              pressedScale={0.9}
              onPress={() => playFrom(true)}
              style={styles.iconBtn}
            >
              <Shuffle size={17} color={Color.text_secondary} />
            </AuraTouch>

            <AuraTouch
              feedback="impact"
              pressedScale={0.9}
              onPress={handleDownloadAll}
              disabled={pending === 0}
              style={styles.iconBtn}
            >
              <DownloadCloud
                size={17}
                color={pending === 0 ? Color.state_success : Color.text_secondary}
              />
            </AuraTouch>
          </View>
        )}
        </AuraFadeIn>

        <AuraHairline intensity="gold" style={styles.divider} />

        {/* ── TRACKLIST ── */}
        <AuraFadeIn delay={120} slideDistance={16}>
          <AuraSection kicker="الأغاني" title="قائمة الأغاني" />

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={Color.gold500} />
              <AuraText role="caption" color={Color.text_secondary}>
                جارٍ تحميل أغاني الألبوم…
              </AuraText>
            </View>
          ) : songs.length === 0 ? (
            <AuraSurface tone="gold" style={styles.emptySurface}>
              <AuraText role="titleSm">لا توجد أغانٍ مسجّلة في هذا الألبوم</AuraText>
              <AuraText role="caption" align="center">
                الألبوم متاح، لكن قائمة أغانيه فارغة حاليًا. جرّب صفحة الفنان.
              </AuraText>
            </AuraSurface>
          ) : (
            <View style={styles.trackList}>
              {songs.map((song, idx) => (
                <SongItem
                  key={`album-track-${song.id}-${idx}`}
                  song={song}
                  queue={songs}
                  index={idx}
                  rank={idx + 1}
                />
              ))}
            </View>
          )}
        </AuraFadeIn>
      </ScrollView>
    </AuraPageTransition>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Color.ink0,
  },
  loadingBackWrap: {
    position: "absolute",
    zIndex: 100,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Space.s4,
  },
  backBtn: {
    alignSelf: "flex-start",
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink2,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.s5,
  },
  hero: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Space.s4,
  },
  coverGlow: {
    bottom: -Space.s2,
  },
  heroCopy: {
    flex: 1,
    gap: Space.s2,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    flexWrap: "wrap",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    marginTop: Space.s6,
  },
  playPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    paddingHorizontal: Space.s5,
    paddingVertical: Space.s3,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink2,
    borderWidth: 1,
    borderColor: Color.veil_hairlineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    marginTop: Space.s6,
  },
  trackList: {
    gap: Space.s1,
    marginHorizontal: -Space.s2,
  },
  loadingBox: {
    paddingVertical: Space.s7,
    alignItems: "center",
    gap: Space.s3,
  },
  emptySurface: {
    alignItems: "center",
    gap: Space.s2,
    padding: Space.s6,
  },
});
