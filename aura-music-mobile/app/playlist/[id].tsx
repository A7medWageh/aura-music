import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert, Dimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronRight, Play, Shuffle, Trash2, ListMusic } from "lucide-react-native";

import { Color, Gradient, Radius, Space } from "@/theme";
import { Song, Playlist } from "@/types/music";
import {
  getPlaylistWithSongs,
  removeSongFromPlaylist,
  deletePlaylist as dbDeletePlaylist,
} from "@/database/db";
import { useLibraryStore } from "@/store/useLibraryStore";
import { usePlayerStore } from "@/store/usePlayerStore";
import { SongItem } from "@/components/SongItem";
import { AuraCreativeLoader } from "@/components/AuraCreativeLoader";
import {
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
const TILE_W = Math.round(SCREEN_WIDTH * 0.5);
const absFill = StyleSheet.absoluteFill as any;

export default function PlaylistDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockClearance = useDockClearance();
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  const playSong = usePlayerStore((s) => s.playSong);
  const loadLibrary = useLibraryStore((s) => s.loadLibrary);

  const fetchPlaylist = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getPlaylistWithSongs(id);
      if (data) {
        setPlaylist(data.playlist);
        setSongs(data.songs);
      }
    } catch (err) {
      console.warn("[PlaylistDetailScreen] Error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaylist();
  }, [id]);

  const playFrom = (shuffleMode: boolean) => {
    if (songs.length === 0) return;
    const queue = shuffleMode
      ? [...songs].sort(() => Math.random() - 0.5)
      : [...songs];
    playSong(queue[0], queue, 0);
  };

  const handleRemoveSong = (song: Song) => {
    Alert.alert("إزالة الأغنية", `هل تريد إزالة "${song.title}" من هذه القائمة؟`, [
      { text: "إلغاء", style: "cancel" },
      {
        text: "إزالة",
        style: "destructive",
        onPress: async () => {
          if (id) {
            await removeSongFromPlaylist(id, song.id);
            await fetchPlaylist();
            await loadLibrary();
          }
        },
      },
    ]);
  };

  const handleDeletePlaylist = () => {
    Alert.alert("حذف قائمة التشغيل", "هل تريد حذف هذه القائمة نهائيًا؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "حذف",
        style: "destructive",
        onPress: async () => {
          if (id) {
            await dbDeletePlaylist(id);
            await loadLibrary();
            router.back();
          }
        },
      },
    ]);
  };

  const totalSeconds = songs.reduce((acc, s) => acc + (s.duration || 0), 0);
  const totalTime =
    totalSeconds > 0 ? `${Math.round(totalSeconds / 60)} دقيقة` : "المدة غير معروفة";

  const playlistTitle = playlist?.name || name || "قائمة التشغيل";

  if (loading && !playlist) {
    return (
      <View style={styles.root}>
        <AuraCanvas intensity="ember" />
        <View style={[styles.loadingBackWrap, { top: insets.top + Space.s2, right: Space.s4 }]}>
          <AuraTouch
            feedback="selection"
            pressedScale={0.9}
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.roundBtn}
          >
            <ChevronRight size={20} color={Color.text_primary} />
          </AuraTouch>
        </View>
        <AuraCreativeLoader
          fullscreen
          message={`جارٍ تجهيز قائمة ${playlistTitle}… 🎵`}
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
          { paddingTop: insets.top + Space.s2, paddingBottom: dockClearance + Space.s5 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <AuraTouch
            feedback="selection"
            pressedScale={0.9}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.roundBtn}
          >
            <ChevronRight size={20} color={Color.text_primary} />
          </AuraTouch>
          <AuraTouch
            feedback="impact"
            pressedScale={0.9}
            onPress={handleDeletePlaylist}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.roundBtn}
          >
            <Trash2 size={18} color={Color.state_danger} />
          </AuraTouch>
        </View>

        {/* ── HERO ── */}
        <AuraFadeIn delay={40} slideDistance={14}>
        <View style={styles.hero}>
          <LinearGradient
            colors={Gradient.signature}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.tile}
          >
            <ListMusic size={38} color={Color.text_onBrand} strokeWidth={1.6} />
          </LinearGradient>

          <View style={styles.heroCopy}>
            <AuraKicker>قائمة من إنشائك</AuraKicker>
            <AuraText role="displaySm" lines={2}>
              {playlist?.name || name || "قائمة التشغيل"}
            </AuraText>
            <View style={styles.metaRow}>
              <AuraText role="caption" color={Color.text_secondary}>
                {songs.length} أغنية · {totalTime}
              </AuraText>
            </View>
            {!!playlist?.description && (
              <AuraText role="tiny" color={Color.text_muted} lines={2}>
                {playlist.description}
              </AuraText>
            )}
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
                تشغيل القائمة
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
            <View style={styles.countBadge}>
              <AuraBadge label={`${songs.length}`} tone="quiet" />
            </View>
          </View>
        )}
        </AuraFadeIn>

        <AuraHairline intensity="gold" style={styles.divider} />

        <AuraFadeIn delay={120} slideDistance={16}>
          <AuraSection kicker="قائمة التشغيل" title="الأغاني" />

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={Color.gold500} />
              <AuraText role="caption" color={Color.text_secondary}>
                جارٍ فتح القائمة…
              </AuraText>
            </View>
          ) : songs.length === 0 ? (
            <AuraSurface tone="gold" style={styles.emptySurface}>
              <AuraText role="titleSm">القائمة فارغة</AuraText>
              <AuraText role="caption" align="center">
                أضف أغاني من المشغل أو من نتائج البحث لتظهر هنا.
              </AuraText>
            </AuraSurface>
          ) : (
            <View style={styles.songList}>
              {songs.map((song, idx) => (
                <SongItem
                  key={`pl-song-${song.id}-${idx}`}
                  song={song}
                  queue={songs}
                  index={idx}
                  rank={idx + 1}
                  onOptionsPress={handleRemoveSong}
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
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Space.s5,
  },
  roundBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink2,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Space.s4,
  },
  tile: {
    width: TILE_W,
    height: TILE_W,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
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
  countBadge: {
    marginStart: "auto",
  },
  divider: {
    marginTop: Space.s6,
  },
  songList: {
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
