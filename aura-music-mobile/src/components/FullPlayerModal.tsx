import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronDown,
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Heart,
  DownloadCloud,
  CheckCircle2,
  Sparkles,
  ListMusic,
  SlidersHorizontal,
  Volume2,
  Gem,
  Speaker,
  Mic2,
  Radio,
  Theater,
  ShieldCheck,
  RotateCcw,
  RotateCw,
  VolumeX,
  Zap,
  Clock,
  Crown,
  Disc,
  Headphones,
} from "lucide-react-native";
import { Color, Gradient, Radius, Size, Space } from "@/theme";
import {
  AuraArtwork,
  AuraBadge,
  AuraChip,
  AuraHairline,
  AuraKicker,
  AuraMark,
  AuraPlayPulse,
  AuraSegmented,
  AuraSurface,
  AuraText,
  AuraTouch,
  type SegmentItem,
} from "@/ui";
import { SOUND_PRESETS, type SoundPreset } from "@/services/audio/soundPresets";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useLibraryStore } from "@/store/useLibraryStore";
import { useDownloadStore } from "@/store/useDownloadStore";
import { useAuthStore } from "@/store/useAuthStore";
import { LyricsView } from "./LyricsView";
import { InteractiveScrubber } from "./InteractiveScrubber";
import { VolumeSlider } from "./VolumeSlider";
import { AuraCover } from "./player/AuraCover";
import { AuraSpectrum } from "./player/AuraSpectrum";
import { AuraStage, PlayKickRing } from "./player/AuraStage";
import { SCENES, useAuraPulse, useAuraScene } from "./player/useAuraPulse";
import { resolveArtworkUri } from "@/utils/media";
import { getDominantArtworkColor, type DominantColorResult } from "@/utils/colorExtractor";

const TABS: SegmentItem[] = [
  { id: "now", label: "يعزف الآن" },
  { id: "lyrics", label: "كلمات" },
  { id: "queue", label: "القائمة" },
  { id: "audio", label: "الصوت" },
];

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const BOOSTS = [1, 1.25, 1.5, 1.8, 2];

const SLEEP_OPTIONS = [
  { val: null, label: "إيقاف" },
  { val: 15, label: "15 دقيقة" },
  { val: 30, label: "30 دقيقة" },
  { val: 45, label: "45 دقيقة" },
  { val: 60, label: "60 دقيقة" },
];

const PRESET_ICONS = {
  off: Volume2,
  gem: Gem,
  bass: Speaker,
  vocal: Mic2,
  orbit: Radio,
  stage: Theater,
  shield: ShieldCheck,
} as const;

export const FullPlayerModal: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const visible = usePlayerStore((s) => s.isFullPlayerVisible);
  const setVisible = usePlayerStore((s) => s.setFullPlayerVisible);

  const song = usePlayerStore((s) => s.currentSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const isBuffering = usePlayerStore((s) => s.isBuffering);
  const position = usePlayerStore((s) => s.position);
  const duration = usePlayerStore((s) => s.duration);
  const repeatMode = usePlayerStore((s) => s.repeatMode);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const queue = usePlayerStore((s) => s.queue);
  const playbackRate = usePlayerStore((s) => s.playbackRate);
  const soundPreset = usePlayerStore((s) => s.soundPreset);
  const soundBoost = usePlayerStore((s) => s.soundBoost);
  const is8dActive = usePlayerStore((s) => s.is8dActive);
  const isAiMix = usePlayerStore((s) => s.isAiMix);
  const isHighQuality = usePlayerStore((s) => s.isHighQuality);
  const sleepTimerMinutes = usePlayerStore((s) => s.sleepTimerMinutes);
  const sleepTimerEndsAt = usePlayerStore((s) => s.sleepTimerEndsAt);
  const volume = usePlayerStore((s) => s.volume);

  const togglePlay = usePlayerStore((s) => s.togglePlay);
  const nextTrack = usePlayerStore((s) => s.nextTrack);
  const prevTrack = usePlayerStore((s) => s.prevTrack);
  const seekTo = usePlayerStore((s) => s.seekTo);
  const skipBy = usePlayerStore((s) => s.skipBy);
  const closePlayer = usePlayerStore((s) => s.closePlayer);
  const setRepeatMode = usePlayerStore((s) => s.setRepeatMode);
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle);
  const clearQueue = usePlayerStore((s) => s.clearQueue);
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue);
  const playSong = usePlayerStore((s) => s.playSong);
  const setPlaybackRate = usePlayerStore((s) => s.setPlaybackRate);
  const setSoundPreset = usePlayerStore((s) => s.setSoundPreset);
  const setSoundBoost = usePlayerStore((s) => s.setSoundBoost);
  const setIs8dActive = usePlayerStore((s) => s.setIs8dActive);
  const test8dSound = usePlayerStore((s) => s.test8dSound);
  const setIsAiMix = usePlayerStore((s) => s.setIsAiMix);
  const setHighQuality = usePlayerStore((s) => s.setHighQuality);
  const setSleepTimer = usePlayerStore((s) => s.setSleepTimer);
  const setVolume = usePlayerStore((s) => s.setVolume);

  const isFav = useLibraryStore((s) => (song ? s.isFavorite(song.id) : false));
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);

  const downloadSong = useDownloadStore((s) => s.downloadSong);
  const getProgress = useDownloadStore((s) => s.getProgress);

  const isPremium = useAuthStore((s) => s.isPremium);
  const setPremiumModalVisible = useAuthStore((s) => s.setPremiumModalVisible);

  const [tab, setTab] = useState("now");
  const [scene, pickScene] = useAuraScene();
  const [scenePickerOpen, setScenePickerOpen] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [remainingTimer, setRemainingTimer] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const lastVolumeRef = useRef(1);
  const webDsp = Platform.OS === "web";

  // Countdown timer for active sleep timer
  useEffect(() => {
    if (!sleepTimerEndsAt) {
      setRemainingTimer(null);
      return;
    }

    const updateTimer = () => {
      const diffSec = Math.max(0, Math.floor((sleepTimerEndsAt - Date.now()) / 1000));
      if (diffSec <= 0) {
        setRemainingTimer(null);
        return;
      }
      const m = Math.floor(diffSec / 60);
      const s = diffSec % 60;
      setRemainingTimer(`${m}:${String(s).padStart(2, "0")}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [sleepTimerEndsAt]);

  const artwork = useMemo(
    () =>
      song
        ? resolveArtworkUri(
            imgError ? null : song.localArtworkPath,
            song.thumbnailUrl,
            song.youtubeVideoId,
            "song",
            song.artist
          )
        : "",
    [song, imgError],
  );

  const [dynamicColor, setDynamicColor] = useState<DominantColorResult>({
    accent: "#E2B13C",
    bgGradient: ["rgba(226,177,60, 0.22)", "rgba(16, 13, 11, 0.94)", "#0A0908"],
    glowColor: "rgba(226,177,60, 0.45)",
  });

  useEffect(() => {
    if (artwork || song) {
      getDominantArtworkColor(artwork, song?.artist, song?.title).then((res) => {
        if (res) setDynamicColor(res);
      });
    }
  }, [artwork, song?.artist, song?.title]);

  // Effects only run while the now-playing tab is on screen.
  const pulse = useAuraPulse(
    isPlaying && !isBuffering,
    song?.id ?? "",
    visible && tab === "now" && scene !== "calm",
  );

  const [downloadToast, setDownloadToast] = useState<string | null>(null);
  const downloadScaleAnim = useRef(new Animated.Value(1)).current;

  const handleDownloadWithFeedback = () => {
    if (!song || isDownloaded) return;
    Animated.sequence([
      Animated.timing(downloadScaleAnim, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.timing(downloadScaleAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();

    setDownloadToast(`جارٍ حفظ «${song.title}» للأوفلاين 🚀`);
    setTimeout(() => setDownloadToast(null), 3500);

    downloadSong(song);
  };

  if (!song || !visible) return null;

  const progressInfo = getProgress(song.id);
  const isDownloaded = !!song.isDownloaded || progressInfo?.status === "completed";
  const artSize = Math.round(Math.min(width * 0.68, height * 0.34, 320));
  const progress = duration > 0 ? Math.min(1, Math.max(0, position / duration)) : 0;

  const cycleRepeat = () => {
    if (repeatMode === "off") setRepeatMode("all");
    else if (repeatMode === "all") setRepeatMode("one");
    else setRepeatMode("off");
  };

  const handleToggle8d = () => {
    setIs8dActive(!is8dActive);
  };

  const handleRun8dTest = () => {
    test8dSound((msg) => {
      setTestMessage(msg);
      setTimeout(() => setTestMessage(null), 4000);
    });
  };

  const toggleMute = () => {
    if (volume > 0.01) {
      lastVolumeRef.current = volume;
      setVolume(0);
    } else {
      setVolume(lastVolumeRef.current || 1);
    }
  };

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => setVisible(false)}
    >
      <View style={styles.root}>
        <View pointerEvents="none" style={styles.backdrop}>
          <Image
            source={{ uri: artwork ?? undefined }}
            style={styles.backdropImage}
            contentFit="cover"
            transition={300}
            cachePolicy="memory-disk"
            blurRadius={40}
          />
          <LinearGradient
            colors={dynamicColor.bgGradient}
            locations={[0, 0.45, 1]}
            style={StyleSheet.absoluteFill}
          />
          {/* Keeps the song's color a tint under the gold identity instead of the whole screen */}
          <LinearGradient
            colors={["rgba(10,9,8,0.52)", "rgba(10,9,8,0.72)", "rgba(10,9,8,0.94)"]}
            locations={[0, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        {/* Live Toast Feedback for Download Gesture */}
        {downloadToast && (
          <View style={styles.downloadToastPill}>
            <AuraText role="caption" color={Color.gold100} align="center">
              {downloadToast}
            </AuraText>
          </View>
        )}

        <View
          style={[
            styles.shell,
            { paddingTop: Math.max(insets.top, Space.s3) + Space.s1 },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <AuraTouch
              feedback="selection"
              pressedScale={0.92}
              onPress={() => setVisible(false)}
              style={styles.headerBtn}
            >
              <ChevronDown size={22} color={Color.text_primary} />
            </AuraTouch>

            <View style={styles.headerCenter}>
              <View style={styles.headerBrand}>
                <AuraMark size={16} />
                <AuraKicker style={styles.headerKicker}>يعزف الآن</AuraKicker>
              </View>
              <View style={styles.headerBadges}>
                {isBuffering && <AuraBadge label="جارٍ التحميل…" tone="quiet" />}
                {!isBuffering && isPlaying && <AuraBadge label="صوت مباشر" tone="live" />}
                {isHighQuality && (
                  <AuraTouch feedback="selection" onPress={() => setHighQuality(!isHighQuality)}>
                    <AuraBadge label="Master HQ 32-bit" tone="gold" />
                  </AuraTouch>
                )}
                {remainingTimer && (
                  <AuraBadge label={`⏳ ${remainingTimer}`} tone="gold" />
                )}
                {isDownloaded && <AuraBadge label="دون اتصال" tone="gold" />}
              </View>
            </View>

            <View style={styles.headerActions}>
              <AuraTouch
                feedback="selection"
                pressedScale={0.92}
                onPress={() => {
                  setTab("now");
                  setScenePickerOpen((open) => !open);
                }}
                style={[styles.headerBtn, scenePickerOpen && styles.headerBtnActive]}
              >
                <Sparkles
                  size={18}
                  color={scene !== "calm" ? Color.gold500 : Color.text_muted}
                />
              </AuraTouch>
              <AuraTouch
                feedback="selection"
                pressedScale={0.92}
                onPress={closePlayer}
                style={styles.headerBtn}
              >
                <X size={18} color={Color.text_secondary} />
              </AuraTouch>
            </View>
          </View>

          {/* Navigation Tabs */}
          <View style={styles.tabs}>
            <AuraSegmented items={TABS} value={tab} onChange={setTab} />
          </View>

          {/* TAB 1: NOW PLAYING */}
          {tab === "now" && (
            <View style={styles.now}>
              {scenePickerOpen && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.scenePicker}
                  contentContainerStyle={styles.scenePickerRow}
                >
                  {SCENES.map((item) => (
                    <AuraChip
                      key={item.id}
                      label={item.label}
                      size="sm"
                      active={scene === item.id}
                      onPress={() => {
                        pickScene(item.id);
                        setScenePickerOpen(false);
                      }}
                    />
                  ))}
                </ScrollView>
              )}

              <View style={styles.artStack}>
                <AuraStage
                  scene={scene}
                  size={artSize}
                  tint={dynamicColor.accent}
                  songKey={song.id}
                  pulse={pulse}
                />
                <AuraCover
                  scene={scene}
                  size={artSize}
                  uri={artwork}
                  title={song.title}
                  artist={song.artist}
                  songKey={song.id}
                  isPlaying={isPlaying}
                  isBuffering={isBuffering}
                  pulse={pulse}
                />
              </View>

              <View style={styles.meta}>
                <AuraText role="title" lines={2} style={styles.title}>
                  {song.title}
                </AuraText>
                <View style={styles.artistRow}>
                  <AuraText role="body" color={Color.gold300} lines={1} style={{ flexShrink: 1, fontWeight: "600" }}>
                    {song.artist || "فنان غير معروف"}
                  </AuraText>
                  {!!song.albumName && (
                    <AuraText role="caption" lines={1}>
                      · {song.albumName}
                    </AuraText>
                  )}
                </View>
              </View>

              {/* Waveform strip right above the scrubber: dynamic artwork-derived tint */}
              <AuraSpectrum progress={progress} pulse={pulse} tint={dynamicColor.accent} />

              <View style={styles.scrub}>
                <InteractiveScrubber
                  position={position}
                  duration={duration}
                  onSeek={seekTo}
                  accent={dynamicColor.accent || Color.gold500}
                />
              </View>

              {/* Main Controls Row with 10s skip buttons */}
              <View style={styles.controls}>
                <AuraTouch
                  feedback="selection"
                  pressedScale={0.9}
                  onPress={toggleShuffle}
                  style={[styles.sideBtn, shuffle && styles.sideBtnActive]}
                >
                  <Shuffle
                    size={19}
                    color={shuffle ? Color.gold500 : Color.text_muted}
                  />
                </AuraTouch>

                <AuraTouch
                  feedback="selection"
                  pressedScale={0.9}
                  onPress={() => skipBy(-10)}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  style={styles.seekBtn}
                >
                  <RotateCcw size={21} color={Color.text_secondary} />
                  <AuraText role="tiny" color={Color.text_muted} style={styles.seekLabel}>
                    10
                  </AuraText>
                </AuraTouch>

                <AuraTouch feedback="impact" pressedScale={0.9} onPress={prevTrack} style={styles.skipBtn}>
                  <SkipBack size={28} color={Color.text_primary} fill={Color.text_primary} style={styles.skipGlyph} />
                </AuraTouch>

                <AuraTouch
                  feedback="impact"
                  pressedScale={0.94}
                  onPress={togglePlay}
                  style={styles.playShell}
                >
                  <PlayKickRing pulse={pulse} />
                  <LinearGradient
                    colors={Gradient.signature}
                    start={{ x: 0.15, y: 0 }}
                    end={{ x: 0.85, y: 1 }}
                    style={styles.playFace}
                  >
                    {isPlaying ? (
                      <Pause size={28} color={Color.text_onBrand} fill={Color.text_onBrand} />
                    ) : (
                      <Play size={28} color={Color.text_onBrand} fill={Color.text_onBrand} style={styles.playNudge} />
                    )}
                  </LinearGradient>
                </AuraTouch>

                <AuraTouch feedback="impact" pressedScale={0.9} onPress={nextTrack} style={styles.skipBtn}>
                  <SkipForward size={28} color={Color.text_primary} fill={Color.text_primary} style={styles.skipGlyph} />
                </AuraTouch>

                <AuraTouch
                  feedback="selection"
                  pressedScale={0.9}
                  onPress={() => skipBy(10)}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  style={styles.seekBtn}
                >
                  <RotateCw size={21} color={Color.text_secondary} />
                  <AuraText role="tiny" color={Color.text_muted} style={styles.seekLabel}>
                    10
                  </AuraText>
                </AuraTouch>

                <AuraTouch
                  feedback="selection"
                  pressedScale={0.9}
                  onPress={cycleRepeat}
                  style={[styles.sideBtn, repeatMode !== "off" && styles.sideBtnActive]}
                >
                  <Repeat
                    size={19}
                    color={repeatMode !== "off" ? Color.gold500 : Color.text_muted}
                  />
                  {repeatMode === "one" && (
                    <View style={[styles.repeatDot, { backgroundColor: Color.gold500 }]}>
                      <AuraText role="tiny" color={Color.ink0} style={{ fontSize: 8 }}>
                        1
                      </AuraText>
                    </View>
                  )}
                </AuraTouch>
              </View>

              {/* Volume Slider Row */}
              <View style={styles.fineRow}>
                <AuraTouch
                  feedback="selection"
                  pressedScale={0.9}
                  onPress={toggleMute}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  style={styles.volumeBtn}
                >
                  {volume <= 0.01 ? (
                    <VolumeX size={17} color={Color.text_muted} />
                  ) : (
                    <Volume2 size={17} color={Color.text_secondary} />
                  )}
                </AuraTouch>

                <VolumeSlider value={volume} onChange={setVolume} />

                {/* Speed selector indicator */}
                <AuraTouch
                  feedback="selection"
                  pressedScale={0.92}
                  onPress={() => {
                    const curIdx = SPEEDS.indexOf(playbackRate);
                    const nextRate = SPEEDS[(curIdx + 1) % SPEEDS.length];
                    setPlaybackRate(nextRate);
                  }}
                  style={styles.speedPill}
                >
                  <AuraText role="tiny" color={Color.gold300}>
                    {playbackRate.toFixed(2)}x
                  </AuraText>
                </AuraTouch>
              </View>

              {/* Bottom Quick Bar */}
              <View style={styles.deck}>
                <AuraTouch
                  feedback="impact"
                  pressedScale={0.92}
                  onPress={() => toggleFavorite(song)}
                  style={styles.deckBtn}
                >
                  <Heart
                    size={19}
                    color={isFav ? Color.gold500 : Color.text_secondary}
                    fill={isFav ? Color.gold500 : "transparent"}
                  />
                  <AuraText role="tiny" color={isFav ? Color.gold500 : Color.text_muted}>
                    {isFav ? "أعجبني" : "إعجاب"}
                  </AuraText>
                </AuraTouch>

                <AuraTouch
                  feedback="impact"
                  pressedScale={0.92}
                  onPress={handleDownloadWithFeedback}
                  style={styles.deckBtn}
                >
                  <Animated.View style={{ transform: [{ scale: downloadScaleAnim }], alignItems: "center" }}>
                    {isDownloaded ? (
                      <CheckCircle2 size={19} color={Color.state_success} />
                    ) : progressInfo?.status === "downloading" ? (
                      <ActivityIndicator size="small" color={Color.gold500} />
                    ) : (
                      <DownloadCloud size={19} color={Color.text_secondary} />
                    )}
                    <AuraText
                      role="tiny"
                      color={progressInfo?.status === "downloading" ? Color.gold500 : Color.text_muted}
                    >
                      {isDownloaded
                        ? "محفوظة"
                        : progressInfo?.status === "downloading"
                        ? `${Math.round((progressInfo.progress || 0) * 100)}%`
                        : "تنزيل"}
                    </AuraText>
                  </Animated.View>
                </AuraTouch>

                <AuraTouch
                  feedback="selection"
                  pressedScale={0.92}
                  onPress={() => setIsAiMix(!isAiMix)}
                  style={styles.deckBtn}
                >
                  <Sparkles size={19} color={isAiMix ? Color.gold500 : Color.text_secondary} />
                  <AuraText role="tiny" color={isAiMix ? Color.gold500 : Color.text_muted}>
                    {isAiMix ? "AI Mix مفعّل" : "AI Mix"}
                  </AuraText>
                </AuraTouch>

                <AuraTouch
                  feedback="selection"
                  pressedScale={0.92}
                  onPress={() => setTab("audio")}
                  style={styles.deckBtn}
                >
                  <SlidersHorizontal size={19} color={is8dActive || soundBoost > 1 ? Color.gold500 : Color.text_secondary} />
                  <AuraText role="tiny" color={is8dActive || soundBoost > 1 ? Color.gold500 : Color.text_muted}>
                    {Math.round(soundBoost * 100)}% EQ
                  </AuraText>
                </AuraTouch>

                <AuraTouch
                  feedback="selection"
                  pressedScale={0.92}
                  onPress={() => setPremiumModalVisible(true)}
                  style={styles.deckBtn}
                >
                  <Crown size={19} color={isPremium ? Color.gold500 : Color.text_muted} />
                  <AuraText role="tiny" color={isPremium ? Color.gold300 : Color.text_muted}>
                    {isPremium ? "عضوية VIP" : "Premium"}
                  </AuraText>
                </AuraTouch>
              </View>
            </View>
          )}

          {/* TAB 2: LYRICS */}
          {tab === "lyrics" && <LyricsView song={song} />}

          {/* TAB 3: QUEUE */}
          {tab === "queue" && (
            <ScrollView
              style={styles.tabFill}
              contentContainerStyle={styles.listPad}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.listHead}>
                <View>
                  <AuraText role="kicker">قائمة الاستماع التالية</AuraText>
                  <AuraText role="caption" color={Color.gold300}>
                    {queue.length} أغانٍ جاهزة
                  </AuraText>
                </View>
                {queue.length > 0 && (
                  <AuraTouch feedback="selection" onPress={clearQueue} style={styles.clearBtn}>
                    <AuraText role="tiny" color={Color.state_danger}>
                      إفراغ القائمة
                    </AuraText>
                  </AuraTouch>
                )}
              </View>

              {queue.length === 0 ? (
                <View style={styles.empty}>
                  <Disc size={36} color={Color.text_muted} />
                  <AuraText role="body" color={Color.text_muted} align="center">
                    لا توجد أغانٍ في القائمة بعد
                  </AuraText>
                </View>
              ) : (
                queue.map((q, i) => {
                  const active = q.id === song.id;
                  return (
                    <View key={`q-${q.id}-${i}`} style={styles.queueRow}>
                      <AuraTouch
                        feedback="selection"
                        pressedScale={1}
                        onPress={() => playSong(q, queue, i)}
                        style={styles.queueMain}
                      >
                        <AuraText role="numeric" color={active ? Color.gold500 : Color.text_muted} style={styles.queueIndex}>
                          {i + 1}
                        </AuraText>
                        <AuraArtwork
                          uri={resolveArtworkUri(q.localArtworkPath, q.thumbnailUrl, q.youtubeVideoId, "song", q.artist)}
                          title={q.title}
                          artist={q.artist}
                          size={42}
                          shape="tile"
                          ring={active ? "gold" : "hairline"}
                        />
                        <View style={styles.queueInfo}>
                          <AuraText
                            role="label"
                            lines={1}
                            color={active ? Color.gold300 : Color.text_primary}
                          >
                            {q.title}
                          </AuraText>
                          <AuraText role="caption" lines={1}>
                            {q.artist}
                          </AuraText>
                        </View>
                        {active && <AuraPlayPulse playing={isPlaying} size={12} />}
                      </AuraTouch>
                      <AuraTouch
                        feedback="selection"
                        pressedScale={0.9}
                        onPress={() => removeFromQueue(i)}
                        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                        style={styles.queueRemove}
                      >
                        <X size={15} color={Color.text_muted} />
                      </AuraTouch>
                    </View>
                  );
                })
              )}
            </ScrollView>
          )}

          {/* TAB 4: AUDIO & STUDIO EQ */}
          {tab === "audio" && (
            <ScrollView
              style={styles.tabFill}
              contentContainerStyle={styles.listPad}
              showsVerticalScrollIndicator={false}
            >
              {/* 1. Super Loudness Booster */}
              <View style={styles.presetHead}>
                <View style={styles.boostTitle}>
                  <Zap size={16} color={Color.gold500} />
                  <AuraText role="kicker">مضخّم الصوت (Super Boost 200%)</AuraText>
                </View>
                <AuraBadge
                  label={`${Math.round(soundBoost * 100)}%`}
                  tone={soundBoost > 1 ? "gold" : "quiet"}
                />
              </View>
              <View style={styles.speedRow}>
                {BOOSTS.map((b) => (
                  <AuraChip
                    key={b}
                    label={`${Math.round(b * 100)}%`}
                    active={soundBoost === b}
                    onPress={() => setSoundBoost(b)}
                    style={{ flex: 1 }}
                  />
                ))}
              </View>
              <AuraText role="caption" color={Color.text_muted} style={{ marginTop: Space.s2, marginBottom: Space.s4 }}>
                مضاعفة مستوى الصوت حتى 200% مع محدّد احترافي يمنع التشويش وإجهاد السماعات.
              </AuraText>

              <AuraHairline style={{ marginVertical: Space.s3 }} />

              {/* 2. 8D Spatial Audio Rotation */}
              <View style={styles.spatialCard}>
                <View style={styles.spatialHead}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: Space.s2 }}>
                    <Radio size={18} color={is8dActive ? Color.gold500 : Color.text_muted} />
                    <AuraText role="label" color={is8dActive ? Color.gold300 : Color.text_primary}>
                      الصوت المحيطي 8D (360° Spatial Audio)
                    </AuraText>
                  </View>
                  <AuraTouch
                    feedback="selection"
                    onPress={handleToggle8d}
                    style={[styles.toggleBtn, is8dActive && styles.toggleBtnActive]}
                  >
                    <AuraText role="tiny" color={is8dActive ? Color.ink0 : Color.text_muted}>
                      {is8dActive ? "مفعّل" : "معطّل"}
                    </AuraText>
                  </AuraTouch>
                </View>
                <AuraText role="caption" color={Color.text_muted} style={{ marginVertical: Space.s2 }}>
                  دوران الصوت 360° بين قناتي اليمين واليسار كل 5.5 ثوانٍ لتجربة استماع أوسع.
                </AuraText>
                <AuraTouch
                  feedback="impact"
                  pressedScale={0.97}
                  onPress={handleRun8dTest}
                  style={styles.test8dBtn}
                >
                  <Headphones size={15} color={Color.gold300} />
                  <AuraText role="label" color={Color.gold300}>
                    اختبار تبديل القنوات (يمين / يسار)
                  </AuraText>
                </AuraTouch>
                {testMessage && (
                  <View style={styles.testToast}>
                    <AuraText role="caption" color={Color.gold100} align="center">
                      {testMessage}
                    </AuraText>
                  </View>
                )}
              </View>

              <AuraHairline style={{ marginVertical: Space.s3 }} />

              {/* 3. Studio Sound Profiles */}
              <View style={styles.presetHead}>
                <AuraText role="kicker">إعدادات الصوت (Studio EQ)</AuraText>
                <AuraText role="tiny" color={Color.gold300}>
                  {SOUND_PRESETS.length} إعدادات صوتية
                </AuraText>
              </View>

              <View style={styles.presetGrid}>
                {SOUND_PRESETS.map((preset) => {
                  const Icon = PRESET_ICONS[preset.icon];
                  const active = soundPreset === preset.id;
                  return (
                    <AuraTouch
                      key={preset.id}
                      feedback="selection"
                      pressedScale={0.97}
                      onPress={() => setSoundPreset(preset.id as SoundPreset)}
                      style={[
                        styles.presetCard,
                        active && styles.presetCardActive,
                      ]}
                    >
                      <View style={styles.presetTop}>
                        <View style={[styles.presetIcon, active && styles.presetIconActive]}>
                          <Icon
                            size={16}
                            color={active ? Color.ink0 : Color.gold300}
                          />
                        </View>
                        {active && <AuraBadge label="نشط" tone="gold" />}
                      </View>
                      <AuraText
                        role="label"
                        lines={1}
                        color={active ? Color.gold100 : Color.text_primary}
                      >
                        {preset.label}
                      </AuraText>
                      <AuraText role="tiny" lines={2} color={Color.text_muted}>
                        {preset.desc}
                      </AuraText>
                    </AuraTouch>
                  );
                })}
              </View>

              <AuraHairline style={{ marginVertical: Space.s4 }} />

              {/* 4. Sleep Timer */}
              <View style={styles.presetHead}>
                <View style={styles.boostTitle}>
                  <Clock size={16} color={Color.gold500} />
                  <AuraText role="kicker">مؤقت النوم (Sleep Timer)</AuraText>
                </View>
                {remainingTimer && (
                  <AuraBadge label={`متبقي ${remainingTimer}`} tone="gold" />
                )}
              </View>
              <View style={styles.speedRow}>
                {SLEEP_OPTIONS.map((opt) => (
                  <AuraChip
                    key={String(opt.val)}
                    label={opt.label}
                    active={sleepTimerMinutes === opt.val}
                    onPress={() => setSleepTimer(opt.val)}
                    style={{ flex: 1 }}
                  />
                ))}
              </View>
              <AuraText role="caption" color={Color.text_muted} style={{ marginTop: Space.s2, marginBottom: Space.s4 }}>
                يتوقف التشغيل تلقائياً عند انتهاء الوقت المحدد.
              </AuraText>

              <AuraHairline style={{ marginVertical: Space.s3 }} />

              {/* 5. Playback Speed */}
              <AuraText role="kicker">سرعة التشغيل (Playback Speed)</AuraText>
              <View style={styles.speedRow}>
                {SPEEDS.map((r) => (
                  <AuraChip
                    key={r}
                    label={`${r.toFixed(2)}x`}
                    active={playbackRate === r}
                    onPress={() => setPlaybackRate(r)}
                    style={{ flex: 1 }}
                  />
                ))}
              </View>
              <AuraText role="caption" color={Color.text_muted} style={{ marginTop: Space.s2 }}>
                تُطبَّق سرعة التشغيل على الصوت فوراً دون تغيير درجة النغمة.
              </AuraText>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.ink0, overflow: "hidden" },
  backdrop: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  backdropImage: { width: "100%", height: "100%", opacity: 0.55 },
  shell: { flex: 1, paddingHorizontal: Space.s4 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: Size.touch,
    zIndex: 20,
  },
  headerCenter: { alignItems: "center", flex: 1 },
  headerBrand: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  headerKicker: { marginBottom: 0 },
  headerBadges: { flexDirection: "row", gap: Space.s2 },
  headerActions: { flexDirection: "row", gap: Space.s2 },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    backgroundColor: Color.veil_goldTint,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtnActive: { borderColor: Color.veil_goldHairline, backgroundColor: Color.veil_goldTintStrong },

  tabs: { marginTop: Space.s2, marginBottom: Space.s4, zIndex: 20 },

  now: { flex: 1, justifyContent: "space-between", paddingTop: Space.s1 },
  artStack: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    minHeight: 180,
    marginTop: Space.s4,
    marginBottom: Space.s3,
  },
  scenePicker: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    flexGrow: 0,
  },
  scenePickerRow: { flexDirection: "row", gap: Space.s2, paddingHorizontal: Space.s1 },
  downloadToastPill: {
    position: "absolute",
    top: 56,
    alignSelf: "center",
    backgroundColor: "rgba(18,15,13,0.96)",
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    paddingHorizontal: Space.s4,
    paddingVertical: Space.s2,
    borderRadius: Radius.pill,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 20,
  },

  meta: { marginBottom: Space.s3 },
  title: { fontSize: 22, lineHeight: 30, textAlign: "center" },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    marginTop: 2,
  },

  scrub: { marginBottom: Space.s2 },

  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Space.s3,
    paddingHorizontal: Space.s2,
  },
  sideBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  sideBtnActive: {
    backgroundColor: Color.veil_goldTint,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  skipBtn: { padding: Space.s1 },
  playShell: {
    width: 66,
    height: 66,
    borderRadius: Radius.pill,
    shadowColor: Color.gold500,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 10,
  },
  playFace: {
    width: "100%",
    height: "100%",
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  playNudge: { marginLeft: 3 },
  skipGlyph: { transform: [{ scaleX: -1 }] },
  repeatDot: {
    position: "absolute",
    top: 4,
    left: 4,
    width: 14,
    height: 14,
    borderRadius: Radius.pill,
    backgroundColor: Color.gold500,
    alignItems: "center",
    justifyContent: "center",
  },

  deck: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: Space.s2,
    paddingBottom: Space.s4,
  },
  deckBtn: { alignItems: "center", gap: 3, paddingHorizontal: Space.s2, paddingVertical: Space.s2 },

  fineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    marginBottom: Space.s2,
    paddingHorizontal: Space.s2,
  },
  seekBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  seekLabel: {
    position: "absolute",
    bottom: 3,
    fontSize: 8,
    fontWeight: "bold",
    letterSpacing: 0,
  },
  volumeBtn: {
    width: 28,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  speedPill: {
    paddingHorizontal: Space.s2,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    backgroundColor: Color.veil_goldTint,
  },

  tabFill: { flex: 1 },
  listPad: { paddingBottom: Space.s7 },
  listHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Space.s4,
  },
  clearBtn: {
    paddingHorizontal: Space.s3,
    paddingVertical: Space.s1,
    borderRadius: Radius.sm,
    backgroundColor: "rgba(239,68,68,0.15)",
  },
  empty: { alignItems: "center", gap: Space.s3, paddingVertical: Space.s7 },

  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: Color.veil_hairlineSoft,
  },
  queueMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: Space.s3, paddingVertical: Space.s2 },
  queueIndex: { width: 20, textAlign: "center" },
  queueInfo: { flex: 1, minWidth: 0 },
  queueRemove: { padding: Space.s2 },

  speedRow: { flexDirection: "row", gap: Space.s2, marginTop: Space.s2 },

  presetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Space.s2,
  },
  boostTitle: { flexDirection: "row", alignItems: "center", gap: Space.s2 },
  spatialCard: {
    backgroundColor: Color.ink1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    padding: Space.s3,
  },
  spatialHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  toggleBtn: {
    paddingHorizontal: Space.s3,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: Color.veil_hairline,
  },
  toggleBtnActive: {
    backgroundColor: Color.gold500,
  },
  test8dBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    backgroundColor: Color.veil_goldTint,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    borderRadius: Radius.md,
    paddingVertical: Space.s2,
    marginTop: Space.s1,
  },
  testToast: {
    backgroundColor: "rgba(226,177,60,0.2)",
    padding: Space.s2,
    borderRadius: Radius.md,
    marginTop: Space.s2,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.s2,
  },
  presetCard: {
    width: "48.5%",
    minHeight: 104,
    padding: Space.s3,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    backgroundColor: Color.ink1,
    justifyContent: "space-between",
  },
  presetCardActive: {
    borderColor: Color.gold500,
    backgroundColor: Color.veil_goldTint,
  },
  presetTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Space.s2,
  },
  presetIcon: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    backgroundColor: Color.veil_goldTint,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    alignItems: "center",
    justifyContent: "center",
  },
  presetIconActive: {
    backgroundColor: Color.gold500,
    borderColor: Color.gold500,
  },
});
