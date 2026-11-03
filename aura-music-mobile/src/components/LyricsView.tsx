import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Platform,
  LayoutChangeEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Minus, Plus, AlignLeft } from "lucide-react-native";
import { Song, SyncedLyricLine } from "@/types/music";
import { MusicApi } from "@/services/api/musicApi";
import { getCachedLyrics, saveLyrics } from "@/database/db";
import { getOfflineLyrics } from "@/database/webOfflineStorage";
import { usePlayerStore } from "@/store/usePlayerStore";
import { Color, Radius, Space } from "@/theme";
import { AuraBadge, AuraKicker, AuraSurface, AuraText, AuraTouch } from "@/ui";

interface LyricsViewProps {
  song: Song;
}

// 180ms perceptual vocal lead matches speech articulation and audio pipeline delay
const VOCAL_LEAD_MS = 180;

export const LyricsView: React.FC<LyricsViewProps> = ({ song }) => {
  const position = usePlayerStore((s) => s.position);
  const seekTo = usePlayerStore((s) => s.seekTo);

  const [loading, setLoading] = useState(true);
  const [syncedLines, setSyncedLines] = useState<SyncedLyricLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [lyricOffset, setLyricOffset] = useState(0);

  const [containerHeight, setContainerHeight] = useState(() =>
    Math.round(Dimensions.get("window").height * 0.52)
  );

  const scrollViewRef = useRef<any>(null);
  const manualScrollUntilRef = useRef(0);
  const lineLayouts = useRef<{ [idx: number]: { y: number; height: number } }>({});

  const pauseAutoScroll = useCallback(() => {
    manualScrollUntilRef.current = Date.now() + 4500;
  }, []);

  const bumpLyricOffset = (delta: number) => {
    setLyricOffset((prev) => Math.max(-20000, Math.min(20000, prev + delta)));
  };

  useEffect(() => {
    let isMounted = true;
    setLyricOffset(0);
    setActiveIndex(-1);
    lineLayouts.current = {};

    async function fetchLyrics() {
      setLoading(true);
      setSyncedLines([]);
      setPlainLyrics(null);

      // 1. Try persistent SQLite database cache
      const cached = await getCachedLyrics(song.id);
      if (cached && (cached.syncedLyrics || cached.plainLyrics)) {
        if (isMounted) {
          processLyrics(cached.syncedLyrics, cached.plainLyrics);
          setLoading(false);
          return;
        }
      }

      // 2. Try Web IndexedDB offline storage
      try {
        const offlineData = await getOfflineLyrics(song.id);
        if (offlineData && (offlineData.syncedLyrics || offlineData.plainLyrics)) {
          if (isMounted) {
            processLyrics(offlineData.syncedLyrics || null, offlineData.plainLyrics || null);
            setLoading(false);
            return;
          }
        }
      } catch {}

      // 3. Fetch from backend API / direct LRCLIB
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
      // 1. Try true synced LRC lyrics
      if (synced) {
        const parsed = parseLrc(synced);
        if (parsed.length > 0) {
          setSyncedLines(parsed);
          setPlainLyrics(null);
          return;
        }
      }

      // 2. Check if plain lyrics text happens to embed LRC timestamps
      if (plain && /\[\d{1,2}:\d{2}/.test(plain)) {
        const parsed = parseLrc(plain);
        if (parsed.length > 0) {
          setSyncedLines(parsed);
          setPlainLyrics(null);
          return;
        }
      }

      // 3. Clean and display genuine plain lyrics without artificial/fake timestamps
      if (plain) {
        const cleaned = plain
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/p>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/\[\d+:\d+(?:\.\d+)?\]/g, "")
          .trim();
        setPlainLyrics(cleaned);
        setSyncedLines([]);
        return;
      }

      setPlainLyrics(null);
      setSyncedLines([]);
    }

    fetchLyrics();

    return () => {
      isMounted = false;
    };
  }, [song.id]);

  // Track active synced lyric line with 180ms vocal lead offset
  useEffect(() => {
    if (syncedLines.length === 0) return;

    const currentMs = position * 1000 + VOCAL_LEAD_MS - lyricOffset;
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

      // Dead-center scrolling: center of active line sits at the vertical middle of container
      if (Date.now() > manualScrollUntilRef.current) {
        const layout = lineLayouts.current[idx];
        if (layout && containerHeight > 0) {
          const targetY = Math.max(
            0,
            layout.y - containerHeight / 2 + layout.height / 2
          );
          scrollViewRef.current?.scrollTo({
            y: targetY,
            animated: true,
          });
        }
      }
    }
  }, [position, syncedLines, lyricOffset, containerHeight]);

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
          const ms = m[3] ? parseInt(m[3].padEnd(3, "0").slice(0, 3), 10) : 0;
          const totalMs = min * 60 * 1000 + sec * 1000 + ms;
          result.push({ timeMs: totalMs, text });
        }
      }
    }

    return result.sort((a, b) => a.timeMs - b.timeMs);
  }

  const handleLinePress = (timeMs: number) => {
    if (Platform.OS !== "web") {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
    }
    seekTo(timeMs / 1000);
  };

  const handleLineLayout = (idx: number, e: LayoutChangeEvent) => {
    lineLayouts.current[idx] = e.nativeEvent.layout;
    if (idx === activeIndex && Date.now() > manualScrollUntilRef.current) {
      const layout = e.nativeEvent.layout;
      const targetY = Math.max(
        0,
        layout.y - containerHeight / 2 + layout.height / 2
      );
      scrollViewRef.current?.scrollTo({
        y: targetY,
        animated: true,
      });
    }
  };

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
          <AuraText role="titleSm" align="center">
            لا توجد كلمات مسجلة لهذا العمل حالياً
          </AuraText>
          <AuraText role="caption" align="center">
            يقوم نظام أورا الذكي بالبحث التلقائي عن الكلمات فور تشغيل كل أغنية.
          </AuraText>
        </AuraSurface>
      </View>
    );
  }

  const isSynced = syncedLines.length > 0;
  const verticalPadding = Math.round(containerHeight * 0.44);

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const h = e.nativeEvent.layout.height;
        if (h > 100) setContainerHeight(h);
      }}
    >
      {/* Sleek Minimal Header */}
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <AuraKicker>كلمات الأغنية</AuraKicker>
          <AuraText role="label" lines={1} color={Color.text_primary}>
            {song.title}
          </AuraText>
        </View>

        {isSynced ? (
          <View style={styles.nudgeRow}>
            <AuraBadge label="متزامنة ✓" tone="live" />
            <AuraTouch
              feedback="selection"
              pressedScale={0.9}
              onPress={() => bumpLyricOffset(-2000)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.nudgeBtn}
            >
              <Minus size={13} color={Color.text_secondary} />
            </AuraTouch>
            <AuraTouch feedback="selection" onPress={() => setLyricOffset(0)}>
              <AuraText role="numeric" style={styles.offsetLabel}>
                {lyricOffset === 0
                  ? "توقيت"
                  : `${lyricOffset > 0 ? "+" : ""}${(lyricOffset / 1000).toFixed(0)}s`}
              </AuraText>
            </AuraTouch>
            <AuraTouch
              feedback="selection"
              pressedScale={0.9}
              onPress={() => bumpLyricOffset(2000)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.nudgeBtn}
            >
              <Plus size={13} color={Color.text_secondary} />
            </AuraTouch>
          </View>
        ) : (
          <AuraBadge label="كلمات غير موقوتة" tone="quiet" />
        )}
      </View>

      {/* Viewport with Top and Bottom Gradient Vignettes */}
      <View style={styles.viewport}>
        {/* Top Vignette Blur Mask */}
        <LinearGradient
          colors={[
            "rgba(10, 9, 8, 0.98)",
            "rgba(10, 9, 8, 0.85)",
            "rgba(10, 9, 8, 0.35)",
            "transparent",
          ]}
          locations={[0, 0.35, 0.7, 1]}
          pointerEvents="none"
          style={styles.topVignette}
        />

        {/* Bottom Vignette Blur Mask */}
        <LinearGradient
          colors={[
            "transparent",
            "rgba(10, 9, 8, 0.35)",
            "rgba(10, 9, 8, 0.85)",
            "rgba(10, 9, 8, 0.98)",
          ]}
          locations={[0, 0.3, 0.65, 1]}
          pointerEvents="none"
          style={styles.bottomVignette}
        />

        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollArea}
          contentContainerStyle={[
            styles.contentContainer,
            {
              paddingTop: verticalPadding,
              paddingBottom: verticalPadding,
            },
          ]}
          showsVerticalScrollIndicator={false}
          onTouchStart={pauseAutoScroll}
          onScrollBeginDrag={pauseAutoScroll}
        >
          {isSynced ? (
            syncedLines.map((line, idx) => {
              const isActive = idx === activeIndex;
              const dist = activeIndex === -1 ? 0 : Math.abs(idx - activeIndex);

              // Apple Music style graduated opacity & typography hierarchy
              let textStyle = styles.lineTextDistance3;
              let webBlur = "blur(5px)";

              if (isActive) {
                textStyle = styles.lineTextActive;
                webBlur = "blur(0px)";
              } else if (dist === 1) {
                textStyle = styles.lineTextDistance1;
                webBlur = "blur(1.5px)";
              } else if (dist === 2) {
                textStyle = styles.lineTextDistance2;
                webBlur = "blur(3.5px)";
              }

              return (
                <AuraTouch
                  key={`${idx}-${line.timeMs}`}
                  feedback="selection"
                  pressedScale={1.02}
                  onPress={() => handleLinePress(line.timeMs)}
                  onLayout={(e) => handleLineLayout(idx, e)}
                  style={[styles.lineContainer, isActive && styles.lineContainerActive]}
                >
                  <AuraText
                    role="body"
                    align="center"
                    style={[
                      styles.lineBase,
                      textStyle,
                      Platform.OS === "web" ? ({ filter: webBlur } as any) : undefined,
                    ]}
                  >
                    {line.text}
                  </AuraText>
                </AuraTouch>
              );
            })
          ) : (
            <View style={styles.plainContainer}>
              {plainLyrics?.split("\n").map((chunk, i) => {
                const trimmed = chunk.trim();
                if (!trimmed) {
                  return <View key={i} style={styles.plainSpacer} />;
                }
                return (
                  <AuraText
                    key={i}
                    role="body"
                    align="center"
                    style={styles.plainLine}
                  >
                    {trimmed}
                  </AuraText>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
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
    paddingHorizontal: Space.s5,
    paddingVertical: Space.s2,
    gap: Space.s3,
    zIndex: 10,
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
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink2,
    borderWidth: 1,
    borderColor: Color.veil_hairlineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  offsetLabel: {
    minWidth: 32,
    textAlign: "center",
    fontSize: 11,
    color: Color.gold300,
  },
  viewport: {
    flex: 1,
    width: "100%",
    position: "relative",
  },
  topVignette: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 115,
    zIndex: 5,
  },
  bottomVignette: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
    zIndex: 5,
  },
  scrollArea: {
    flex: 1,
    width: "100%",
  },
  contentContainer: {
    paddingHorizontal: Space.s4,
    alignItems: "center",
  },
  lineContainer: {
    width: "100%",
    paddingVertical: Space.s3,
    paddingHorizontal: Space.s2,
    alignItems: "center",
    justifyContent: "center",
  },
  lineContainerActive: {
    transform: [{ scale: 1.04 }],
  },
  lineBase: {
    textAlign: "center",
  },
  lineTextActive: {
    fontFamily: "Almarai_700",
    fontSize: 25,
    lineHeight: 38,
    color: "#FFFFFF",
    opacity: 1,
    textShadowColor: "rgba(226, 177, 60, 0.45)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  lineTextDistance1: {
    fontFamily: "Almarai_700",
    fontSize: 19,
    lineHeight: 30,
    color: "rgba(255, 255, 255, 0.55)",
    opacity: 0.42,
  },
  lineTextDistance2: {
    fontSize: 17,
    lineHeight: 28,
    color: "rgba(255, 255, 255, 0.35)",
    opacity: 0.2,
  },
  lineTextDistance3: {
    fontSize: 15,
    lineHeight: 24,
    color: "rgba(255, 255, 255, 0.15)",
    opacity: 0.08,
  },
  plainContainer: {
    width: "100%",
    paddingHorizontal: Space.s4,
    paddingVertical: Space.s4,
    alignItems: "center",
  },
  plainLine: {
    fontSize: 18,
    lineHeight: 32,
    color: "rgba(255, 255, 255, 0.8)",
    paddingVertical: Space.s1,
    textAlign: "center",
  },
  plainSpacer: {
    height: Space.s4,
  },
});
