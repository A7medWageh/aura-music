import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Animated,
  PanResponder,
  type ViewStyle,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  DownloadCloud,
  CheckCircle2,
  X,
  Trash2,
  RotateCcw,
  Pause,
  Play,
  Sparkles,
  AlertCircle,
} from "lucide-react-native";
import { Color, Radius, Size, Space, Type } from "@/theme";
import {
  AuraArtwork,
  AuraBadge,
  AuraHairline,
  AuraKicker,
  AuraSurface,
  AuraText,
  AuraTouch,
} from "@/ui";
import { PLACEHOLDER_SONG } from "@/constants/placeholders";
import { useDownloadStore } from "@/store/useDownloadStore";
import { usePlayerStore } from "@/store/usePlayerStore";
import { DownloadProgress, Song } from "@/types/music";

const BUBBLE = 60;
const RING_R = 27;
const RING_C = 2 * Math.PI * RING_R;

const absoluteFill: ViewStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

const STATUS_META: Record<
  DownloadProgress["status"],
  { label: string; tone: "gold" | "live" | "quiet" | "danger" }
> = {
  pending: { label: "في الطابور", tone: "quiet" },
  downloading: { label: "جارٍ التنزيل", tone: "gold" },
  completed: { label: "محفوظ بالأوفلاين", tone: "live" },
  paused: { label: "موقوف مؤقتاً", tone: "quiet" },
  failed: { label: "تعذّر التنزيل", tone: "danger" },
};

function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || bytes <= 0) return "0 م.ب";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} م.ب`;
  return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
}

type FilterTab = "all" | "active" | "completed";

export const DownloadProgressPanel: React.FC = () => {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const isFullPlayerVisible = usePlayerStore((s) => s.isFullPlayerVisible);
  const playSong = usePlayerStore((s) => s.playSong);

  const progressMap = useDownloadStore((s) => s.progressMap);
  const isPanelOpen = useDownloadStore((s) => s.isPanelOpen);
  const setIsPanelOpen = useDownloadStore((s) => s.setIsPanelOpen);
  const cancelDownload = useDownloadStore((s) => s.cancelDownload);
  const pauseDownload = useDownloadStore((s) => s.pauseDownload);
  const resumeDownload = useDownloadStore((s) => s.resumeDownload);
  const retryDownload = useDownloadStore((s) => s.retryDownload);
  const deleteDownloadedSong = useDownloadStore((s) => s.deleteDownloadedSong);
  const clearCompleted = useDownloadStore((s) => s.clearCompleted);
  const clearAll = useDownloadStore((s) => s.clearAll);
  const removeJob = useDownloadStore((s) => s.removeJob);

  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<FilterTab>("all");

  const [isDismissed, setIsDismissed] = useState(false);
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6;
      },
      onPanResponderGrant: () => {
        pan.extractOffset();
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gestureState) => {
        pan.flattenOffset();
        // If swiped down hard (> 120px), dismiss bubble
        if (gestureState.dy > 120) {
          setIsDismissed(true);
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
          return;
        }
        // Smoothly snap horizontally towards edge
        Animated.spring(pan.x, {
          toValue: gestureState.dx < 0 ? -16 : 16,
          friction: 6,
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  const jobs = Object.values(progressMap);

  const activeJobs = jobs.filter((j) => j.status === "downloading" || j.status === "pending");
  const completedJobs = jobs.filter((j) => j.status === "completed");
  const failedJobs = jobs.filter((j) => j.status === "failed");
  const activeCount = activeJobs.length;
  const allDone = activeCount === 0 && completedJobs.length > 0;

  // Auto reappear when any new download starts
  useEffect(() => {
    if (activeCount > 0) {
      setIsDismissed(false);
    }
  }, [activeCount]);

  // When all active downloads finish, auto-dismiss bubble after 2.5 seconds and clear completed
  useEffect(() => {
    if (activeCount === 0 && completedJobs.length > 0 && !isPanelOpen) {
      const timer = setTimeout(() => {
        setIsDismissed(true);
        clearCompleted();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [activeCount, completedJobs.length, isPanelOpen, clearCompleted]);

  // If completely empty or dismissed (and panel closed), don't obstruct screen
  if ((jobs.length === 0 || isDismissed) && !isPanelOpen) return null;

  const totalProgress = jobs.reduce((sum, j) => sum + (j.progress || 0), 0);
  const overallPct = jobs.length > 0 ? Math.round((totalProgress / jobs.length) * 100) : 0;

  const filteredJobs = jobs.filter((j) => {
    if (filter === "active") return j.status === "downloading" || j.status === "pending" || j.status === "paused";
    if (filter === "completed") return j.status === "completed";
    return true;
  });

  const stackBelow = isFullPlayerVisible
    ? 90
    : currentSong
    ? Size.miniPlayer + Size.tabBar + Space.s5
    : Size.tabBar + Space.s3;
  const bubbleBottom = stackBelow + insets.bottom;
  const ringOffset = RING_C - (RING_C * Math.min(100, Math.max(0, overallPct))) / 100;

  const handlePlayDownloaded = (job: DownloadProgress) => {
    const songToPlay: Song = {
      id: job.songId,
      youtubeVideoId: job.songId,
      title: job.title || "مقطع صوتي",
      artist: job.artist || "فنان غير معروف",
      thumbnailUrl: job.thumbnailUrl,
      duration: 210,
      isDownloaded: true,
    };
    playSong(songToPlay);
  };

  const handleRetry = (job: DownloadProgress) => {
    const song: Song = {
      id: job.songId,
      youtubeVideoId: job.songId,
      title: job.title || "مقطع صوتي",
      artist: job.artist || "فنان غير معروف",
      thumbnailUrl: job.thumbnailUrl,
      duration: 210,
    };
    retryDownload(song);
  };

  return (
    <>
      {/* ─── FLOATING DOWNLOAD MANAGER BUBBLE (Messenger draggable & dismissible) ─── */}
      <Animated.View
        style={[
          styles.bubbleHost,
          { bottom: bubbleBottom },
          { transform: pan.getTranslateTransform() },
        ]}
        {...panResponder.panHandlers}
      >
        <AuraTouch
          onPress={() => setIsPanelOpen(!isPanelOpen)}
          feedback="medium"
          pressedScale={0.92}
          style={styles.bubble}
          accessibilityLabel="مدير التحميلات"
        >
          {activeCount > 0 && <View style={styles.bubbleGlow} />}
          <View
            style={[
              styles.bubbleShell,
              activeCount > 0 && { borderColor: Color.gold500, backgroundColor: Color.ink2 },
            ]}
          >
            {/* Circular Progress Ring */}
            <View style={styles.ringHost}>
              <Svg width={BUBBLE} height={BUBBLE} viewBox={`0 0 ${BUBBLE} ${BUBBLE}`}>
                <Circle
                  cx={BUBBLE / 2}
                  cy={BUBBLE / 2}
                  r={RING_R}
                  stroke={Color.veil_hairlineStrong}
                  strokeWidth={2.5}
                  fill="transparent"
                />
                {activeCount > 0 && (
                  <Circle
                    cx={BUBBLE / 2}
                    cy={BUBBLE / 2}
                    r={RING_R}
                    stroke={Color.gold500}
                    strokeWidth={3}
                    strokeDasharray={RING_C}
                    strokeDashoffset={ringOffset}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                )}
              </Svg>
            </View>

            {/* Icon */}
            <View style={styles.bubbleIcon}>
              {activeCount > 0 ? (
                <DownloadCloud size={22} color={Color.gold300} />
              ) : allDone ? (
                <CheckCircle2 size={22} color={Color.state_success} />
              ) : (
                <DownloadCloud size={22} color={Color.text_muted} />
              )}
            </View>
          </View>

          {/* Active Count / Done Badge */}
          {activeCount > 0 ? (
            <View style={styles.bubbleCount}>
              <AuraText
                role="tiny"
                color={Color.text_onBrand}
                style={{ ...Type.tiny, fontSize: 10, fontWeight: "700" }}
              >
                {overallPct > 0 ? `${overallPct}%` : `${activeCount}`}
              </AuraText>
            </View>
          ) : allDone ? (
            <View style={[styles.bubbleCount, { backgroundColor: Color.state_success }]}>
              <CheckCircle2 size={12} color="#FFFFFF" />
            </View>
          ) : null}
        </AuraTouch>
      </Animated.View>

      {/* ─── EXPANDABLE DOWNLOAD MANAGER MODAL ─── */}
      <Modal
        visible={isPanelOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPanelOpen(false)}
      >
        <View style={styles.backdrop}>
          <AuraTouch
            onPress={() => setIsPanelOpen(false)}
            feedback="none"
            pressedScale={1}
            style={StyleSheet.absoluteFill}
          />

          <AuraSurface
            tone="base"
            padding={Space.s0}
            radius={Radius.xl}
            style={[styles.sheet, { marginBottom: insets.bottom + Space.s3 }]}
          >
            <AuraHairline intensity="gold" thickness={2} style={styles.sheetFilament} />

            {/* Header */}
            <View style={styles.head}>
              <View style={styles.headTitleRow}>
                <View style={styles.pulseDot} />
                <View>
                  <AuraKicker>خزانة أورا</AuraKicker>
                  <AuraText role="titleSm">مدير التحميلات</AuraText>
                </View>
                {activeCount > 0 && (
                  <View style={styles.activePillBadge}>
                    <AuraText role="tiny" color={Color.gold300} style={{ fontWeight: "700" }}>
                      {activeCount} جارٍ
                    </AuraText>
                  </View>
                )}
              </View>

              <View style={styles.headActions}>
                {completedJobs.length > 0 && (
                  <AuraTouch
                    onPress={clearCompleted}
                    feedback="selection"
                    style={styles.headBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="مسح المكتملة"
                  >
                    <View style={styles.headBtnLabel}>
                      <AuraText role="tiny" color={Color.text_secondary}>
                        مسح المكتمل
                      </AuraText>
                    </View>
                  </AuraTouch>
                )}
                <AuraTouch
                  onPress={clearAll}
                  feedback="selection"
                  style={styles.headBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="مسح الكل"
                >
                  <View style={styles.headBtnLabel}>
                    <AuraText role="tiny" color={Color.text_secondary}>
                      مسح الكل
                    </AuraText>
                  </View>
                </AuraTouch>
                <AuraTouch
                  onPress={() => setIsPanelOpen(false)}
                  feedback="selection"
                  style={styles.closeCoin}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="إغلاق"
                >
                  <X size={17} color={Color.text_primary} />
                </AuraTouch>
              </View>
            </View>

            {/* Filter Tabs */}
            <View style={styles.filterRow}>
              <AuraTouch
                onPress={() => setFilter("all")}
                feedback="selection"
                style={[styles.filterChip, filter === "all" && styles.filterChipActive]}
              >
                <AuraText
                  role="tiny"
                  color={filter === "all" ? Color.gold100 : Color.text_muted}
                  style={{ fontWeight: filter === "all" ? "700" : "500" }}
                >
                  الكل ({jobs.length})
                </AuraText>
              </AuraTouch>

              <AuraTouch
                onPress={() => setFilter("active")}
                feedback="selection"
                style={[styles.filterChip, filter === "active" && styles.filterChipActive]}
              >
                <AuraText
                  role="tiny"
                  color={filter === "active" ? Color.gold100 : Color.text_muted}
                  style={{ fontWeight: filter === "active" ? "700" : "500" }}
                >
                  النشطة ({activeCount})
                </AuraText>
              </AuraTouch>

              <AuraTouch
                onPress={() => setFilter("completed")}
                feedback="selection"
                style={[styles.filterChip, filter === "completed" && styles.filterChipActive]}
              >
                <AuraText
                  role="tiny"
                  color={filter === "completed" ? Color.gold100 : Color.text_muted}
                  style={{ fontWeight: filter === "completed" ? "700" : "500" }}
                >
                  المكتملة ({completedJobs.length})
                </AuraText>
              </AuraTouch>
            </View>

            {/* Overall Progress Bar */}
            <View style={styles.summary}>
              {activeCount > 0 && (
                <View style={styles.overall}>
                  <View style={styles.overallLabels}>
                    <AuraText role="caption" color={Color.text_muted}>
                      التقدّم الإجمالي للتحميلات
                    </AuraText>
                    <AuraText role="numeric" color={Color.gold300}>
                      %{overallPct}
                    </AuraText>
                  </View>
                  <View style={styles.overallTrack}>
                    <View style={[styles.overallFill, { width: `${overallPct}%` }]}>
                      <View style={styles.overallShine} />
                    </View>
                  </View>
                </View>
              )}
            </View>

            {/* Jobs List */}
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {filteredJobs.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <DownloadCloud size={40} color={Color.text_muted} style={{ opacity: 0.4 }} />
                  <AuraText role="caption" color={Color.text_muted} style={{ marginTop: Space.s2 }}>
                    لا توجد ملفات في هذا القسم
                  </AuraText>
                </View>
              ) : (
                filteredJobs.map((job) => {
                  const pct = Math.round((job.progress || 0) * 100);
                  const meta = STATUS_META[job.status] || STATUS_META.downloading;
                  const isActive = job.status === "downloading" || job.status === "pending";
                  const isPaused = job.status === "paused";
                  const isDone = job.status === "completed";
                  const isFailed = job.status === "failed";
                  const hasSize = job.totalBytes > 0;

                  return (
                    <AuraSurface
                      key={`dl-${job.songId}`}
                      tone="raised"
                      radius={Radius.lg}
                      padding={Space.s3}
                    >
                      <View style={styles.jobRow}>
                        <AuraArtwork
                          uri={job.thumbnailUrl}
                          placeholder={PLACEHOLDER_SONG}
                          title={job.title}
                          artist={job.artist}
                          size={Size.artworkXs}
                          shape="tile"
                          ring={isActive ? "gold" : isDone ? "none" : "hairline"}
                        />

                        <View style={styles.jobInfo}>
                          <View style={styles.jobHeader}>
                            <AuraText role="label" lines={1} style={{ flex: 1 }}>
                              {job.title || "مقطع صوتي"}
                            </AuraText>
                            <AuraText
                              role="tiny"
                              color={
                                isDone
                                  ? Color.state_success
                                  : isFailed
                                  ? Color.state_danger
                                  : Color.gold300
                              }
                              style={{ fontWeight: "700" }}
                            >
                              {isDone ? "اكتمل" : `%${pct}`}
                            </AuraText>
                          </View>

                          <AuraText
                            role="caption"
                            color={Color.text_secondary}
                            lines={1}
                            style={styles.jobArtist}
                          >
                            {job.artist || "فنان غير معروف"}
                          </AuraText>

                          {/* Progress Track */}
                          <View style={styles.jobBarRow}>
                            <View style={styles.jobTrack}>
                              <View
                                style={[
                                  styles.jobFill,
                                  {
                                    width: `${isDone ? 100 : pct}%`,
                                    backgroundColor: isDone
                                      ? Color.state_success
                                      : isFailed
                                      ? Color.state_danger
                                      : Color.gold500,
                                  },
                                ]}
                              >
                                {isActive && <View style={styles.jobShine} />}
                              </View>
                            </View>
                            <AuraBadge label={meta.label} tone={meta.tone} />
                          </View>

                          {/* Meta & Speed info */}
                          <View style={styles.jobMetaRow}>
                            <AuraText role="tiny" color={Color.text_muted}>
                              {hasSize
                                ? `${formatBytes(job.bytesWritten)} من ${formatBytes(job.totalBytes)}`
                                : `${pct}%`}
                            </AuraText>
                            {isActive && (
                              <AuraText role="tiny" color={Color.gold300} style={{ fontWeight: "600" }}>
                                1.8 م.ب/ث
                              </AuraText>
                            )}
                            {!!job.error && isFailed && (
                              <AuraText
                                role="tiny"
                                color={Color.state_danger}
                                lines={1}
                                style={styles.jobError}
                              >
                                {job.error}
                              </AuraText>
                            )}
                          </View>
                        </View>

                        {/* Interactive Actions Per Row */}
                        <View style={styles.jobActionsCol}>
                          {isActive && (
                            <>
                              <AuraTouch
                                onPress={() => pauseDownload(job.songId)}
                                feedback="impact"
                                style={styles.actionBtnSmall}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                accessibilityLabel="إيقاف مؤقت"
                              >
                                <Pause size={13} color={Color.text_secondary} />
                              </AuraTouch>
                              <AuraTouch
                                onPress={() => cancelDownload(job.songId)}
                                feedback="impact"
                                style={[styles.actionBtnSmall, styles.actionCancel]}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                accessibilityLabel="إلغاء"
                              >
                                <X size={13} color={Color.state_danger} />
                              </AuraTouch>
                            </>
                          )}

                          {isPaused && (
                            <>
                              <AuraTouch
                                onPress={() => resumeDownload(job.songId)}
                                feedback="impact"
                                style={[styles.actionBtnSmall, styles.actionResume]}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                accessibilityLabel="استئناف"
                              >
                                <Play size={13} color={Color.gold300} />
                              </AuraTouch>
                              <AuraTouch
                                onPress={() => cancelDownload(job.songId)}
                                feedback="impact"
                                style={[styles.actionBtnSmall, styles.actionCancel]}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                accessibilityLabel="إلغاء"
                              >
                                <X size={13} color={Color.state_danger} />
                              </AuraTouch>
                            </>
                          )}

                          {isDone && (
                            <>
                              <AuraTouch
                                onPress={() => handlePlayDownloaded(job)}
                                feedback="impact"
                                style={[styles.actionBtnSmall, styles.actionPlay]}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                accessibilityLabel="تشغيل الأغنية"
                              >
                                <Play size={13} color={Color.ink0} />
                              </AuraTouch>
                              <AuraTouch
                                onPress={() => {
                                  const song: Song = {
                                    id: job.songId,
                                    youtubeVideoId: job.songId,
                                    title: job.title || "مقطع صوتي",
                                    artist: job.artist || "فنان غير معروف",
                                    thumbnailUrl: job.thumbnailUrl,
                                    duration: 210,
                                  };
                                  deleteDownloadedSong(song);
                                }}
                                feedback="impact"
                                style={styles.actionBtnSmall}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                accessibilityLabel="حذف من الأوفلاين"
                              >
                                <Trash2 size={13} color={Color.text_muted} />
                              </AuraTouch>
                            </>
                          )}

                          {isFailed && (
                            <>
                              <AuraTouch
                                onPress={() => handleRetry(job)}
                                feedback="impact"
                                style={[styles.actionBtnSmall, styles.actionResume]}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                accessibilityLabel="إعادة المحاولة"
                              >
                                <RotateCcw size={13} color={Color.gold300} />
                              </AuraTouch>
                              <AuraTouch
                                onPress={() => removeJob(job.songId)}
                                feedback="impact"
                                style={styles.actionBtnSmall}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                accessibilityLabel="إزالة"
                              >
                                <Trash2 size={13} color={Color.text_muted} />
                              </AuraTouch>
                            </>
                          )}
                        </View>
                      </View>
                    </AuraSurface>
                  );
                })
              )}
            </ScrollView>

            {/* Footer Banner */}
            <View style={styles.footerBanner}>
              <View style={styles.footerRow}>
                <Sparkles size={14} color={Color.gold300} />
                <AuraText role="tiny" color={Color.gold100} style={{ fontWeight: "600", flex: 1 }}>
                  التحميل شغال في الخلفية ويمكنك قفل الشاشة
                </AuraText>
                {activeCount > 0 && (
                  <AuraText role="tiny" color={Color.gold300} style={{ fontWeight: "700" }}>
                    %{overallPct}
                  </AuraText>
                )}
              </View>
            </View>
          </AuraSurface>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  bubbleHost: {
    position: "absolute",
    left: Space.s4,
    zIndex: 9999,
  },
  bubble: {
    width: BUBBLE,
    height: BUBBLE,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleGlow: {
    position: "absolute",
    width: BUBBLE + 18,
    height: BUBBLE + 18,
    borderRadius: Radius.pill,
    backgroundColor: Color.veil_goldGlow,
    shadowColor: Color.gold500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 18,
    elevation: 12,
  },
  bubbleShell: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink2,
    borderWidth: 1.5,
    borderColor: Color.veil_goldHairline,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  ringHost: {
    position: "absolute",
    width: BUBBLE,
    height: BUBBLE,
    transform: [{ rotate: "-90deg" }],
  },
  bubbleIcon: {
    width: BUBBLE - 22,
    height: BUBBLE - 22,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink1,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  bubbleCount: {
    position: "absolute",
    top: -3,
    right: -3,
    backgroundColor: Color.gold500,
    borderRadius: Radius.pill,
    minWidth: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Space.s1,
    borderWidth: 2,
    borderColor: Color.ink0,
  },

  backdrop: {
    flex: 1,
    backgroundColor: Color.veil_scrim,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: 580,
    maxHeight: "84%",
    borderColor: Color.veil_hairlineStrong,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.6,
    shadowRadius: 28,
    elevation: 30,
    overflow: "hidden",
  },
  sheetFilament: {
    position: "absolute",
    top: 0,
    left: Radius.xl,
    right: Radius.xl,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.s4,
    paddingTop: Space.s4,
    paddingBottom: Space.s2,
  },
  headTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    flexShrink: 1,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: Color.gold500,
  },
  activePillBadge: {
    backgroundColor: "rgba(226,177,60, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(226,177,60, 0.35)",
    paddingHorizontal: Space.s2,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  headActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
  },
  headBtn: {
    paddingHorizontal: Space.s3,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    backgroundColor: Color.ink2,
  },
  headBtnLabel: { alignItems: "center" },
  closeCoin: {
    width: 32,
    height: 32,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink3,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    alignItems: "center",
    justifyContent: "center",
  },

  filterRow: {
    flexDirection: "row",
    gap: Space.s2,
    paddingHorizontal: Space.s4,
    paddingBottom: Space.s2,
  },
  filterChip: {
    paddingHorizontal: Space.s3,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink3,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
  },
  filterChipActive: {
    backgroundColor: "rgba(226,177,60, 0.18)",
    borderColor: Color.gold500,
  },

  summary: {
    paddingHorizontal: Space.s4,
    paddingBottom: Space.s2,
  },
  overall: { gap: Space.s1 },
  overallLabels: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  overallTrack: {
    height: 6,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink4,
    overflow: "hidden",
  },
  overallFill: {
    height: "100%",
    borderRadius: Radius.pill,
    backgroundColor: Color.gold500,
  },
  overallShine: {
    ...absoluteFill,
    backgroundColor: Color.gold300,
    opacity: 0.5,
  },

  list: { flex: 1 },
  listContent: {
    paddingHorizontal: Space.s4,
    paddingBottom: Space.s4,
    gap: Space.s2,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Space.s8,
  },
  jobRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
  },
  jobInfo: { flex: 1 },
  jobHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space.s2,
  },
  jobArtist: { marginTop: 1 },
  jobBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    marginTop: Space.s2,
  },
  jobTrack: {
    flex: 1,
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink4,
    overflow: "hidden",
  },
  jobFill: {
    height: "100%",
    borderRadius: Radius.pill,
  },
  jobShine: {
    ...absoluteFill,
    backgroundColor: Color.gold100,
    opacity: 0.45,
  },
  jobMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space.s2,
    marginTop: Space.s1,
  },
  jobError: { flexShrink: 1 },

  jobActionsCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s1,
  },
  actionBtnSmall: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink3,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  actionCancel: {
    backgroundColor: Color.veil_dangerGlow,
    borderColor: "rgba(224, 96, 60, 0.35)",
  },
  actionResume: {
    backgroundColor: "rgba(226,177,60, 0.15)",
    borderColor: "rgba(226,177,60, 0.4)",
  },
  actionPlay: {
    backgroundColor: Color.gold500,
    borderColor: Color.gold500,
  },

  footerBanner: {
    paddingHorizontal: Space.s4,
    paddingVertical: Space.s3,
    backgroundColor: "rgba(226,177,60, 0.08)",
    borderTopWidth: 1,
    borderTopColor: "rgba(226,177,60, 0.2)",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
  },
});
