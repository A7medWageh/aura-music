import React from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSafeTopInset } from "@/utils/safeArea";
import { LinearGradient } from "expo-linear-gradient";
import { Heart, Play, Music2, Trash2 } from "lucide-react-native";

import { Color, Gradient, Radius, Space } from "@/theme";
import { useLibraryStore } from "@/store/useLibraryStore";
import { usePlayerStore } from "@/store/usePlayerStore";
import { resolveArtworkUri } from "@/utils/media";
import { PLACEHOLDER_SONG } from "@/constants/placeholders";
import {
  AuraArtwork,
  AuraBadge,
  AuraCanvas,
  AuraHairline,
  AuraKicker,
  AuraPlayPulse,
  AuraText,
  AuraTouch,
  useDockClearance,
} from "@/ui";

const absFill = StyleSheet.absoluteFill as any;

export default function FavoritesScreen() {
  const favorites = useLibraryStore((s) => s.favorites);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const clearFavorites = useLibraryStore((s) => s.clearFavorites);
  const playSong = usePlayerStore((s) => s.playSong);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);

  const dockClearance = useDockClearance();
  const insets = useSafeAreaInsets();
  const topInset = getSafeTopInset(insets.top);

  const handlePlayAll = () => {
    if (favorites.length === 0) return;
    playSong(favorites[0], favorites, 0);
  };

  const handleClearFavorites = () => {
    Alert.alert("إفراغ المفضلة", "هل تريد إزالة جميع الأغاني من قائمة المفضلة؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "إفراغ", style: "destructive", onPress: () => clearFavorites() },
    ]);
  };

  return (
    <View style={styles.root}>
      <AuraCanvas intensity="ember" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: topInset + Space.s2, paddingBottom: dockClearance + Space.s5 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── COVER ── */}
        <View style={styles.hero}>
          <LinearGradient
            colors={Gradient.signature}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.cover}
          >
            <Heart size={44} color={Color.text_onBrand} fill={Color.text_onBrand} />
          </LinearGradient>

          <View style={styles.heroCopy}>
            <AuraKicker>قائمة مخصصة</AuraKicker>
            <AuraText role="displaySm" lines={1}>
              المفضلة
            </AuraText>
            <View style={styles.heroMeta}>
              <AuraText role="caption" color={Color.text_secondary}>
                {favorites.length} أغنية
              </AuraText>
              {favorites.some((s) => s.isDownloaded) && (
                <AuraBadge label="دون اتصال" tone="live" />
              )}
            </View>
          </View>
        </View>

        {favorites.length > 0 ? (
          <>
            <View style={styles.actions}>
              <AuraTouch onPress={handlePlayAll} feedback="medium" style={styles.playBtn}>
                <LinearGradient colors={Gradient.signature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={absFill} />
                <Play size={15} color={Color.text_onBrand} fill={Color.text_onBrand} />
                <AuraText role="bodyStrong" color={Color.text_onBrand}>
                  تشغيل المفضلة
                </AuraText>
              </AuraTouch>
              <AuraTouch onPress={handleClearFavorites} feedback="impact" style={styles.clearBtn}>
                <Trash2 size={15} color={Color.state_danger} />
              </AuraTouch>
            </View>

            <AuraHairline intensity="gold" />

            <View style={styles.list}>
              {favorites.map((song, index) => {
                const isCurrent = currentSong?.id === song.id;
                return (
                  <AuraTouch
                    key={`fav-${song.id}-${index}`}
                    onPress={() => playSong(song, favorites, index)}
                    feedback="impact"
                    style={[styles.row, isCurrent && styles.rowCurrent]}
                  >
                    <AuraText role="numeric" color={isCurrent ? Color.gold500 : Color.gold700} style={styles.rowIndex}>
                      {index + 1}
                    </AuraText>
                    <AuraArtwork
                      uri={resolveArtworkUri(song.localArtworkPath, song.thumbnailUrl, song.youtubeVideoId, "song")}
                      placeholder={PLACEHOLDER_SONG}
                      size={44}
                      shape="tile"
                      ring={isCurrent ? "gold" : "hairline"}
                    >
                      {isCurrent && (
                        <View style={styles.rowOverlay}>
                          <AuraPlayPulse playing={isPlaying} size={12} />
                        </View>
                      )}
                    </AuraArtwork>
                    <View style={styles.rowInfo}>
                      <AuraText role="bodyStrong" lines={1} color={isCurrent ? Color.gold100 : Color.text_primary}>
                        {song.title}
                      </AuraText>
                      <AuraText role="caption" color={Color.text_muted} lines={1}>
                        {song.artist}
                      </AuraText>
                    </View>
                    <AuraTouch
                      onPress={() => toggleFavorite(song)}
                      feedback="selection"
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.heartBtn}
                    >
                      <Heart size={17} color={Color.gold500} fill={Color.gold500} />
                    </AuraTouch>
                  </AuraTouch>
                );
              })}
            </View>
          </>
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Music2 size={24} color={Color.gold700} />
            </View>
            <AuraText role="titleSm" align="center">
              لا أغانٍ في المفضلة بعد
            </AuraText>
            <AuraText role="caption" color={Color.text_secondary} align="center" style={styles.emptyBody}>
              اضغط على أيقونة القلب في المشغل أو نتائج البحث لإضافة الأغنية هنا.
            </AuraText>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const absGradient: [string, string] = [Color.gold300, Color.gold700];

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.ink0 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Space.s4,
    paddingTop: Space.s5,
    gap: Space.s4,
  },

  hero: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Space.s4,
  },
  cover: {
    width: 116,
    height: 116,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    borderBottomLeftRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCopy: { flex: 1, flexShrink: 1 },
  heroMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    marginTop: Space.s1,
  },

  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
  },
  playBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    height: 48,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  clearBtn: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(224, 96, 60, 0.32)",
    backgroundColor: Color.veil_dangerGlow,
  },

  list: { gap: Space.s2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    paddingVertical: Space.s2,
    paddingHorizontal: Space.s3,
    borderRadius: Radius.md,
    backgroundColor: Color.ink1,
    borderWidth: 1,
    borderColor: Color.veil_hairlineSoft,
  },
  rowCurrent: {
    borderColor: Color.veil_goldHairline,
    backgroundColor: Color.veil_goldTint,
  },
  rowIndex: { width: 16, textAlign: "center" },
  rowInfo: { flex: 1, flexShrink: 1, gap: 2 },
  rowOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.veil_inkGlow,
  },
  heartBtn: { padding: 6 },

  empty: {
    alignItems: "center",
    gap: Space.s2,
    paddingVertical: Space.s7,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.veil_goldTintStrong,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    marginBottom: Space.s2,
  },
  emptyBody: { lineHeight: 21, maxWidth: 280, marginTop: Space.s1 },
});
