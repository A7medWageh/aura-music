import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Minus, Plus, AlignLeft } from "lucide-react-native";
import { Song, SyncedLyricLine } from "@/types/music";
import { MusicApi } from "@/services/api/musicApi";
import { getCachedLyrics, saveLyrics } from "@/database/db";
import { usePlayerStore } from "@/store/usePlayerStore";
import { Color, Radius, Space } from "@/theme";
import { AuraBadge, AuraKicker, AuraSurface, AuraText, AuraTouch } from "@/ui";

interface LyricsViewProps {
  song: Song;
}

const LINE_PITCH = 58;
const FOCUS_Y = Math.round(Dimensions.get("window").height * 0.28);

const stampOf = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

// Gold line that fills under the sung lyric for as long as that line lasts.
const LineProgress: React.FC<{ durationMs: number; playing: boolean }> = ({ durationMs, playing }) => {
  const filled = useSharedValue(0);

  useEffect(() => {
    if (!playing) {
      cancelAnimation(filled);
      return;
    }
    filled.value = withTiming(1, { duration: durationMs * (1 - filled.value), easing: Easing.linear });
  }, [playing, durationMs, filled]);

  const style = useAnimatedStyle(() => ({ width: `${filled.value * 100}%` }));

  return (
    <View pointerEvents="none" style={styles.lineProgressTrack}>
      <Animated.View style={[styles.lineProgressFill, style]} />
    </View>
  );
};

export const LyricsView: React.FC<LyricsViewProps> = ({ song }) => {
  const position = usePlayerStore((s) => s.position);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const seekTo = usePlayerStore((s) => s.seekTo);

  const [loading, setLoading] = useState(true);
  const [syncedLines, setSyncedLines] = useState<SyncedLyricLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lyricOffset, setLyricOffset] = useState(0);

  const scrollViewRef = useRef<any>(null);
  const manualScrollUntilRef = useRef(0);

  const pauseAutoScroll = useCallback(() => {
    manualScrollUntilRef.current = Date.now() + 8000;
  }, []);

  const bumpLyricOffset = (delta: number) => {
    setLyricOffset((prev) => Math.max(-20000, Math.min(20000, prev + delta)));
  };

  useEffect(() => {
    let isMounted = true;
    setLyricOffset(0);

    async function fetchLyrics() {
      setLoading(true);
      setSyncedLines([]);
      setPlainLyrics(null);

      // 1. Try persistent database cache
      const cached = await getCachedLyrics(song.id);
      if (cached && (cached.syncedLyrics || cached.plainLyrics)) {
        if (isMounted) {
          processLyrics(cached.syncedLyrics, cached.plainLyrics);
          setLoading(false);
          return;
        }
      }

      // 2. Fetch from backend API
      const remote = await MusicApi.getLyrics(song);
      if (isMounted) {
        processLyrics(remote.syncedLyrics, remote.plainLyrics);
        setLoading(false);
        if (remote.syncedLyrics || remote.plainLyrics) {
          saveLyrics(remote).catch(() => {});
        }
      }
    }

    function processLyrics(synced: string | null, plain: string | null) {
      if (synced) {
        const parsed = parseLrc(synced);
        if (parsed.length > 0) {
          setSyncedLines(parsed);
          return;
        }
      }
      setPlainLyrics(plain);
    }

    fetchLyrics();

    return () => {
      isMounted = false;
    };
  }, [song.id]);

  // Track active synced lyric line with offset
  useEffect(() => {
    if (syncedLines.length === 0) return;

    const currentMs = position * 1000 - lyricOffset;
    let idx = -1;

    for (let i = 0; i < syncedLines.length; i++) {
      if (currentMs >= syncedLines[i].timeMs) {
        idx = i;
      } else {
        break;
      }
    }

    if (idx !== activeIndex && idx !== -1) {
      setActiveIndex(idx);
      // Auto-scroll unless user recently scrolled manually
      if (Date.now() > manualScrollUntilRef.current) {
        scrollViewRef.current?.scrollTo({
          y: Math.max(0, idx * LINE_PITCH - FOCUS_Y),
          animated: true,
        });
      }
    }
  }, [position, syncedLines, lyricOffset]);

  function parseLrc(lrcText: string): SyncedLyricLine[] {
    const lines = lrcText.split("\n");
    const result: SyncedLyricLine[] = [];
    const timeReg = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

    for (const line of lines) {
      const matches = [...line.matchAll(timeReg)];
      const text = line.replace(timeReg, "").trim();
      if (matches.length > 0 && text) {
        for (const m of matches) {
          const min = parseInt(m[1], 10);
          const sec = parseInt(m[2], 10);
          const ms = m[3] ? parseInt(m[3].padEnd(3, "0"), 10) : 0;
          const totalMs = min * 60 * 1000 + sec * 1000 + ms;
          result.push({ timeMs: totalMs, text });
        }
      }
    }

    return result.sort((a, b) => a.timeMs - b.timeMs);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color={Color.gold500} />
        <AuraText role="caption" color={Color.text_secondary}>
          جاري جلب كلمات الأغنية المتزامنة…
        </AuraText>
      </View>
    );
  }

  if (syncedLines.length === 0 && !plainLyrics) {
    return (
      <View style={styles.center}>
        <AuraSurface tone="gold" style={styles.emptySurface}>
          <AlignLeft size={24} color={Color.gold500} />
          <AuraText role="titleSm" align="center">لا توجد كلمات مسجلة لهذا العمل حالياً</AuraText>
          <AuraText role="caption" align="center">
            يقوم نظام أورا الذكي بالبحث التلقائي عن الكلمات فور تشغيل كل أغنية.
          </AuraText>
        </AuraSurface>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AuraKicker>كلمات الأغنية</AuraKicker>
          <AuraText role="label" lines={1}>
            {song.title}
          </AuraText>
        </View>

        {syncedLines.length > 0 && (
          <View style={styles.nudgeRow}>
            <AuraBadge label="متزامنة ✓" tone="live" />
            <AuraTouch
              feedback="selection"
              pressedScale={0.9}
              onPress={() => bumpLyricOffset(-2000)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.nudgeBtn}
            >
              <Minus size={14} color={Color.text_secondary} />
            </AuraTouch>
            <AuraTouch feedback="selection" onPress={() => setLyricOffset(0)}>
              <AuraText role="numeric" style={styles.offsetLabel}>
                {lyricOffset === 0 ? "توقيت" : `${lyricOffset > 0 ? "+" : ""}${(lyricOffset / 1000).toFixed(0)}s`}
              </AuraText>
            </AuraTouch>
            <AuraTouch
              feedback="selection"
              pressedScale={0.9}
              onPress={() => bumpLyricOffset(2000)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.nudgeBtn}
            >
              <Plus size={14} color={Color.text_secondary} />
            </AuraTouch>
          </View>
        )}
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollArea}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        onTouchStart={pauseAutoScroll}
        onScrollBeginDrag={pauseAutoScroll}
      >
        {syncedLines.length > 0 ? (
          syncedLines.map((line, idx) => {
            const isActive = idx === activeIndex;
            const isPassed = idx < activeIndex;
            return (
              <AuraTouch
                key={`${idx}-${line.timeMs}`}
                feedback="selection"
                pressedScale={1}
                onPress={() => seekTo(line.timeMs / 1000)}
                style={[styles.lineRow, isActive && styles.lineRowActive]}
              >
                <View style={styles.stampWrap}>
                  {isActive ? (
                    <View style={styles.activeFilament} />
                  ) : (
                    <AuraText role="numeric" style={styles.stamp}>
                      {stampOf(line.timeMs)}
                    </AuraText>
                  )}
                </View>
                <AuraText
                  role="label"
                  style={[
                    styles.lineText,
                    isActive && styles.lineTextActive,
                    isPassed && styles.lineTextPassed,
                  ]}
                >
                  {line.text}
                </AuraText>
                {isActive && (
                  <LineProgress
                    key={line.timeMs}
                    durationMs={Math.max(800, Math.min(12000, (syncedLines[idx + 1]?.timeMs ?? line.timeMs + 4000) - line.timeMs))}
                    playing={isPlaying}
                  />
                )}
              </AuraTouch>
            );
          })
        ) : (
          <AuraText role="body" style={styles.plainText} align="center">
            {plainLyrics}
          </AuraText>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
  },
  center: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: Space.s4,
    gap: Space.s3,
  },
  emptySurface: {
    alignItems: "center",
    gap: Space.s2,
    padding: Space.s6,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.s4,
    paddingVertical: Space.s3,
    gap: Space.s3,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nudgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
  },
  nudgeBtn: {
    width: 30,
    height: 30,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink2,
    borderWidth: 1,
    borderColor: Color.veil_hairlineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  offsetLabel: {
    minWidth: 34,
    textAlign: "center",
    color: Color.gold300,
  },
  scrollArea: {
    flex: 1,
    width: "100%",
  },
  contentContainer: {
    paddingTop: Space.s5,
    paddingBottom: 220,
    paddingHorizontal: Space.s4,
  },
  lineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    minHeight: LINE_PITCH,
    paddingStart: Space.s3,
    paddingEnd: Space.s3,
    borderRadius: Radius.md,
  },
  lineRowActive: {
    backgroundColor: Color.veil_goldTint,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  stampWrap: {
    width: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  stamp: {
    fontSize: 11,
    color: Color.text_muted,
  },
  activeFilament: {
    width: 16,
    height: 2,
    borderRadius: Radius.pill,
    backgroundColor: Color.gold500,
  },
  lineText: {
    flex: 1,
    fontSize: 17,
    lineHeight: 26,
    color: "rgba(245, 240, 230, 0.42)",
  },
  lineTextActive: {
    fontFamily: "Almarai_700",
    fontSize: 20,
    lineHeight: 30,
    color: Color.gold300,
    textShadowColor: Color.veil_goldHairline,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  lineProgressTrack: {
    position: "absolute",
    bottom: 0,
    start: Space.s3,
    end: Space.s3,
    height: 2,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  lineProgressFill: {
    height: "100%",
    borderRadius: Radius.pill,
    backgroundColor: Color.gold500,
  },
  lineTextPassed: {
    color: "rgba(245, 240, 230, 0.62)",
  },
  plainText: {
    lineHeight: 32,
    color: Color.text_primary,
  },
});
