import React, { useState } from "react";
import { View, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles, Play, Coffee, Flame, CloudRain, Dumbbell, Car, Shuffle } from "lucide-react-native";

import { Color, Gradient, Radius, Space } from "@/theme";
import { Song } from "@/types/music";
import { usePlayerStore } from "@/store/usePlayerStore";
import { MusicApi } from "@/services/api/musicApi";
import {
  AuraBadge,
  AuraCanvas,
  AuraHairline,
  AuraKicker,
  AuraSection,
  AuraSurface,
  AuraText,
  AuraTouch,
  AuraPageTransition,
  useDockClearance,
} from "@/ui";
import { SongItem } from "@/components/SongItem";

const absFill = StyleSheet.absoluteFill as any;

interface Mood {
  id: string;
  label: string;
  desc: string;
  icon: React.ComponentType<any>;
}

const MOODS: Mood[] = [
  { id: "روقان", label: "صباح هادئ", desc: "إيقاع خفيف يبدأ به يومك", icon: Coffee },
  { id: "شعبي", label: "شعبي", desc: "إيقاعات عالية من الشارع", icon: Flame },
  { id: "حزين", label: "حزين", desc: "أغانٍ هادئة للحظات التأمل", icon: CloudRain },
  { id: "چيم", label: "تدريب", desc: "إيقاع سريع للتمارين", icon: Dumbbell },
  { id: "سفر", label: "على الطريق", desc: "موسيقى مناسبة للسفر", icon: Car },
];

export default function AiDjScreen() {
  const playSong = usePlayerStore((s) => s.playSong);
  const [loadingMood, setLoadingMood] = useState<string | null>(null);
  const [mix, setMix] = useState<{ label: string; tracks: Song[] } | null>(null);

  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, 16);
  const dockClearance = useDockClearance();

  const startMix = async (mood: Mood) => {
    if (loadingMood) return;
    setLoadingMood(mood.id);
    try {
      const tracks = await MusicApi.getAiDj(mood.id);
      if (tracks && tracks.length > 0) {
        setMix({ label: mood.label, tracks });
        playSong(tracks[0], tracks, 0);
      } else {
        const fallback = await MusicApi.getTrending();
        if (fallback.length > 0) {
          setMix({ label: "الأكثر استماعًا", tracks: fallback });
          playSong(fallback[0], fallback, 0);
        } else {
          Alert.alert("تنبيه", "تعذّر العثور على خلطة مناسبة الآن. حاول مرة أخرى.");
        }
      }
    } catch {
      Alert.alert("خطأ", "تعذّر جلب الأغاني لهذا المزاج.");
    } finally {
      setLoadingMood(null);
    }
  };

  const startSurprise = () => {
    const pick = MOODS[Math.floor(Math.random() * MOODS.length)];
    startMix(pick);
  };

  return (
    <AuraPageTransition style={styles.root}>
      <AuraCanvas intensity="ember" />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: dockClearance + Space.s5 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HEADER ── */}
        <View style={[styles.header, { paddingTop: topInset + Space.s1 }]}>
          <AuraKicker>AI Mix</AuraKicker>
          <AuraText role="display">اختر المزاج</AuraText>
          <AuraText role="caption" color={Color.text_secondary} style={styles.intro}>
            اختر مزاجًا لتبدأ خلطة فورية من مكتبة Aura Music.
          </AuraText>
        </View>

        {/* ── SURPRISE SLAB ── */}
        <AuraTouch onPress={startSurprise} feedback="medium" pressedScale={0.985} style={styles.surprise}>
          <LinearGradient colors={Gradient.signature} start={{ x: 0.05, y: 0 }} end={{ x: 0.95, y: 1 }} style={absFill} />
          <View style={styles.surpriseIcon}>
            <Shuffle size={20} color={Color.text_onBrand} />
          </View>
          <View style={styles.surpriseCopy}>
            <AuraText role="bodyStrong" color={Color.text_onBrand}>
              مزج عشوائي
            </AuraText>
            <AuraText role="tiny" color={Color.text_onBrand} style={{ opacity: 0.82 }}>
              اختر مزاجًا عشوائيًا من القائمة
            </AuraText>
          </View>
          <View style={styles.surprisePlay}>
            <Play size={14} color={Color.text_onBrand} fill={Color.text_onBrand} />
          </View>
        </AuraTouch>

        {/* ── MOODS ── */}
        <View style={styles.moodList}>
          {MOODS.map((mood) => {
            const isLoading = loadingMood === mood.id;
            const Icon = mood.icon;
            const isLastMix = mix?.label === mood.label;
            return (
              <AuraSurface
                key={mood.id}
                tone={isLastMix ? "gold" : "base"}
                radius={Radius.lg}
                padding={Space.s3}
              >
                <View style={styles.moodRow}>
                  <View style={styles.moodIcon}>
                    <Icon size={17} color={Color.gold500} />
                  </View>
                  <View style={styles.moodCopy}>
                    <View style={styles.moodTitleRow}>
                      <AuraText role="bodyStrong" lines={1}>
                        {mood.label}
                      </AuraText>
                      {isLastMix && <AuraBadge label="آخر خلطة" tone="gold" />}
                    </View>
                    <AuraText role="caption" color={Color.text_muted} lines={1}>
                      {mood.desc}
                    </AuraText>
                  </View>
                  <AuraTouch
                    onPress={() => startMix(mood)}
                    feedback="medium"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.moodPlay}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color={Color.gold500} />
                    ) : (
                      <Play size={14} color={Color.gold300} fill={Color.gold300} />
                    )}
                  </AuraTouch>
                </View>
              </AuraSurface>
            );
          })}
        </View>

        <AuraHairline intensity="gold" />

        {/* ── GENERATED MIX ── */}
        {mix ? (
          <View style={styles.mixBlock}>
            <AuraSection kicker="الآن" title={`خلطة ${mix.label}`} align="start" />
            <View style={styles.mixList}>
              {mix.tracks.slice(0, 24).map((song, i) => (
                <SongItem key={`${song.id}-${i}`} song={song} queue={mix.tracks} index={i} />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.mixHint}>
            <Sparkles size={16} color={Color.gold700} />
            <AuraText role="caption" color={Color.text_muted} style={{ flex: 1 }}>
              اختر مزاجًا من القائمة لتظهر الخلطة المولّدة هنا.
            </AuraText>
          </View>
        )}
      </ScrollView>
    </AuraPageTransition>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.ink0 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: Space.s4,
    paddingTop: Space.s5,
    gap: Space.s4,
  },

  header: { gap: Space.s1 },
  intro: { lineHeight: 21, marginTop: Space.s1 },

  surprise: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    padding: Space.s4,
    borderRadius: Radius.lg,
    overflow: "hidden",
  },
  surpriseIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10, 9, 8, 0.22)",
  },
  surpriseCopy: { flex: 1, flexShrink: 1, gap: 2 },
  surprisePlay: {
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10, 9, 8, 0.22)",
  },

  moodList: { gap: Space.s2 },
  moodRow: { flexDirection: "row", alignItems: "center", gap: Space.s3 },
  moodIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.veil_goldTintStrong,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  moodCopy: { flex: 1, flexShrink: 1, gap: 2 },
  moodTitleRow: { flexDirection: "row", alignItems: "center", gap: Space.s2 },
  moodPlay: {
    width: 40,
    height: 40,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Color.veil_hairlineStrong,
    backgroundColor: Color.ink2,
  },

  mixBlock: { gap: Space.s2 },
  mixList: { gap: Space.s1 },
  mixHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    paddingHorizontal: Space.s1,
  },
});
