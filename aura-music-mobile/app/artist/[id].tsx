import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  BadgeCheck,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Disc3,
  Heart,
  Layers,
  Music2,
  Play,
  Search,
  Share2,
  Shuffle,
  X,
} from "lucide-react-native";

import { Color, Gradient, Radius, Space } from "@/theme";
import { Song } from "@/types/music";
import { MusicApi, BASE_API_URL } from "@/services/api/musicApi";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useLibraryStore } from "@/store/useLibraryStore";
import { SongItem } from "@/components/SongItem";
import { AuraCreativeLoader } from "@/components/AuraCreativeLoader";
import { resolveArtworkUri } from "@/utils/media";
import { scrollBus } from "@/utils/scrollBus";
import { latinizeArtist, normalizeArabicName } from "@/utils/latinize";
import { PLACEHOLDER_ARTIST, PLACEHOLDER_ALBUM } from "@/constants/placeholders";
import {
  AuraArtwork,
  AuraBadge,
  AuraCanvas,
  AuraFadeIn,
  AuraHairline,
  AuraKicker,
  AuraPageTransition,
  AuraSection,
  AuraSegmented,
  AuraSurface,
  AuraText,
  AuraTouch,
  useDockClearance,
} from "@/ui";

const RELEASE_W = 132;
const absFill = StyleSheet.absoluteFill as any;
const SONG_PREVIEW = 35;

// YouTube shelf labels arrive as e.g. "Album • 2009"; keep only the year.
const yearOf = (value?: string | number) => {
  const match = /(?:19|20)\d{2}/.exec(String(value || ""));
  return match ? Number(match[0]) : 0;
};

const formatDuration = (seconds?: number) => {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return null;
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
};

const formatViews = (views?: number) => {
  if (!views || views <= 0) return null;
  if (views >= 1e9) return `${(views / 1e9).toFixed(1).replace(/\.0$/, "")} مليار مشاهدة`;
  if (views >= 1e6) return `${(views / 1e6).toFixed(1).replace(/\.0$/, "")} مليون مشاهدة`;
  if (views >= 1e3) return `${Math.round(views / 1e3)} ألف مشاهدة`;
  return `${views} مشاهدة`;
};

export default function ArtistDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockClearance = useDockClearance();
  const { width: screenWidth } = useWindowDimensions();
  const { id, name, imageUrl } = useLocalSearchParams<{
    id: string;
    name?: string;
    imageUrl?: string;
  }>();

  const [artistDetails, setArtistDetails] = useState<any>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showAllSongs, setShowAllSongs] = useState(false);
  const [discTab, setDiscTab] = useState("all");
  const [visibleAlbums, setVisibleAlbums] = useState(12);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const scrollY = useRef(new Animated.Value(0)).current;
  const artistScrollRef = useRef<any>(null);
  const barOnRef = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [barOn, setBarOn] = useState(false);

  useEffect(() => {
    return scrollBus.subscribe(() => {
      artistScrollRef.current?.scrollTo?.({ y: 0, animated: true });
    });
  }, []);

  const playSong = usePlayerStore((s) => s.playSong);
  const favorites = useLibraryStore((s) => s.favorites);
  const recentSongs = useLibraryStore((s) => s.recentSongs);
  const loadLibrary = useLibraryStore((s) => s.loadLibrary);

  const heroH = Math.round(Math.max(360, Math.min(screenWidth * 0.95, 440)));
  const portraitSize = Math.round(Math.min(screenWidth * 0.4, 172));
  const topCardW = Math.round(Math.min(screenWidth * 0.42, 168));

  useEffect(() => {
    async function loadArtist() {
      if (!id) return;
      setLoading(true);
      const startTime = Date.now();
      try {
        const resolvedName = name || id;
        const [artistData, searchRes] = await Promise.all([
          MusicApi.getArtist(id).catch(() => null),
          MusicApi.search(resolvedName).catch(() => ({ songs: [] })),
        ]);

        let accumulatedSongs: Song[] = [];
        if (artistData && Array.isArray(artistData.songs)) {
          accumulatedSongs.push(...artistData.songs);
        }

        if (searchRes && Array.isArray(searchRes.songs)) {
          const seenIds = new Set(accumulatedSongs.map((s) => s.id));
          const seenTitles = new Set(accumulatedSongs.map((s) => normalizeArabicName(s.title)));

          for (const s of searchRes.songs) {
            const normTitle = normalizeArabicName(s.title);
            const normArtist = normalizeArabicName(s.artist);
            const normTarget = normalizeArabicName(resolvedName);
            const isRelevant =
              normArtist.includes(normTarget) ||
              normTarget.includes(normArtist) ||
              normTitle.includes(normTarget);

            if (isRelevant && !seenIds.has(s.id) && !seenTitles.has(normTitle)) {
              seenIds.add(s.id);
              seenTitles.add(normTitle);
              accumulatedSongs.push(s);
            }
          }
        }

        if (artistData) {
          setArtistDetails(artistData);
        } else {
          setArtistDetails({
            artistId: id,
            artistName: resolvedName,
            thumbnailUrl: imageUrl || (accumulatedSongs[0]?.thumbnailUrl ?? ""),
            bio: "أحد ألمع نجوم ومبدعي الموسيقى العربية، يقدم باقة من أروع الأعمال والتسجيلات الغنائية الخالدة.",
            monthlyListeners: "8.5M مستمع شهرياً",
          });
        }

        setSongs(accumulatedSongs);
      } catch (err) {
        console.warn("[ArtistDetailScreen] Error:", err);
      } finally {
        const elapsed = Date.now() - startTime;
        if (elapsed < 400) {
          await new Promise((r) => setTimeout(r, 400 - elapsed));
        }
        setLoading(false);
      }
    }

    loadArtist();
    loadLibrary().catch(() => {});
  }, [id, name, imageUrl, loadLibrary]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const artistName = name || artistDetails?.artistName || "فنان";
  const artistArt = resolveArtworkUri(
    null,
    artistDetails?.thumbnailUrl || artistDetails?.artistImage || imageUrl,
    undefined,
    "artist",
  );

  const officialName = useMemo(() => {
    const official = artistDetails?.artistName;
    if (!official) return null;
    return normalizeArabicName(official) !== normalizeArabicName(artistName) ? official : null;
  }, [artistDetails?.artistName, artistName]);

  const albumList = useMemo(() => {
    const map = new Map<string, any>();
    const all = [...(artistDetails?.newReleases || []), ...(artistDetails?.oldAlbums || [])];
    for (const album of all) {
      const key = album?.albumId || album?.title;
      if (album?.title && key && !map.has(key)) map.set(key, album);
    }
    return Array.from(map.values());
  }, [artistDetails]);

  const verified = Boolean(
    artistDetails?.artistId &&
      artistDetails?.source !== "error" &&
      (songs.length > 0 || albumList.length > 0),
  );

  const years = useMemo(() => {
    const current = new Date().getFullYear() + 1;
    return albumList
      .map((album) => yearOf(album.year))
      .filter((year) => year >= 1950 && year <= current);
  }, [albumList]);

  const period = useMemo(() => {
    if (!years.length) return null;
    const min = Math.min(...years);
    const max = Math.max(...years);
    return min === max ? String(min) : `${min}–${max}`;
  }, [years]);

  const topTracks = useMemo(() => songs.slice(0, 5), [songs]);

  const [apiSearchLoading, setApiSearchLoading] = useState(false);
  const [apiSongs, setApiSongs] = useState<Song[]>([]);
  const searchDebounce = useRef<any>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setApiSongs([]);
      setApiSearchLoading(false);
      return;
    }

    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setApiSearchLoading(true);
      try {
        const res = await MusicApi.search(`${artistName} ${trimmed}`);
        if (res && res.songs && res.songs.length > 0) {
          const matching = res.songs.filter(
            (s) =>
              normalizeArabicName(s.artist).includes(normalizeArabicName(artistName)) ||
              normalizeArabicName(artistName).includes(normalizeArabicName(s.artist)) ||
              normalizeArabicName(s.title).includes(normalizeArabicName(trimmed)),
          );
          setApiSongs(matching.length > 0 ? matching : res.songs.slice(0, 10));
        }
      } catch (err) {
        console.warn("[ArtistSearch] Error:", err);
      } finally {
        setApiSearchLoading(false);
      }
    }, 400);

    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [query, artistName]);

  const normalizedQuery = normalizeArabicName(query);
  const latinQuery = latinizeArtist(query).toLowerCase();

  const filteredSongs = useMemo(() => {
    if (!normalizedQuery && !latinQuery) return songs;
    const rawClean = query.trim().toLowerCase();

    const local = songs.filter((song) => {
      const normT = normalizeArabicName(song.title);
      const latinT = latinizeArtist(song.title).toLowerCase();
      const normAlb = normalizeArabicName(song.albumName);
      return (
        (normalizedQuery && normT.includes(normalizedQuery)) ||
        (latinQuery && latinT.includes(latinQuery)) ||
        (normalizedQuery && normAlb.includes(normalizedQuery)) ||
        (rawClean && song.title.toLowerCase().includes(rawClean))
      );
    });

    const seen = new Set(local.map((s) => s.id));
    const extra = apiSongs.filter((s) => !seen.has(s.id));
    const combined = [...local, ...extra];

    return combined.sort((a, b) => {
      const aNorm = normalizeArabicName(a.title);
      const bNorm = normalizeArabicName(b.title);
      const aLatin = latinizeArtist(a.title).toLowerCase();
      const bLatin = latinizeArtist(b.title).toLowerCase();

      const aExact = aNorm === normalizedQuery || aLatin === latinQuery || a.title.toLowerCase() === rawClean;
      const bExact = bNorm === normalizedQuery || bLatin === latinQuery || b.title.toLowerCase() === rawClean;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;

      const aStarts = aNorm.startsWith(normalizedQuery) || aLatin.startsWith(latinQuery);
      const bStarts = bNorm.startsWith(normalizedQuery) || bLatin.startsWith(latinQuery);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      return 0;
    });
  }, [songs, normalizedQuery, latinQuery, query, apiSongs]);

  const visibleSongs = useMemo(() => {
    if (normalizedQuery || showAllSongs) return filteredSongs;
    return filteredSongs.slice(0, SONG_PREVIEW);
  }, [filteredSongs, normalizedQuery, showAllSongs]);

  const discAlbums = useMemo(() => {
    const list =
      discTab === "new"
        ? artistDetails?.newReleases || []
        : discTab === "old"
          ? artistDetails?.oldAlbums || []
          : albumList;
    return [...list]
      .filter((album) => album?.title)
      .sort((a, b) => yearOf(b.year) - yearOf(a.year));
  }, [discTab, artistDetails, albumList]);

  const librarySongs = useMemo(() => {
    const keys = new Set<string>();
    const addKey = (value?: string) => {
      if (!value) return;
      keys.add(normalizeArabicName(value));
      keys.add(normalizeArabicName(latinizeArtist(value)));
    };
    addKey(artistName);
    if (officialName) addKey(officialName);

    const seen = new Set<string>();
    return [...favorites, ...recentSongs].filter((song) => {
      if (!song?.id || seen.has(song.id) || !song.artist) return false;
      const candidates = [song.artist, latinizeArtist(song.artist)]
        .map((value) => normalizeArabicName(value))
        .filter((value) => value.length > 2);
      const hit = candidates.some(
        (candidate) =>
          keys.has(candidate) ||
          Array.from(keys).some(
            (key) => key.length > 2 && (candidate.includes(key) || key.includes(candidate)),
          ),
      );
      if (hit) seen.add(song.id);
      return hit;
    }).slice(0, 8);
  }, [favorites, recentSongs, artistName, officialName]);

  const favoriteIds = useMemo(() => new Set(favorites.map((song) => song.id)), [favorites]);

  const playFrom = (list: Song[], shuffleMode: boolean) => {
    if (list.length === 0) return;
    const queue = shuffleMode ? [...list].sort(() => Math.random() - 0.5) : [...list];
    playSong(queue[0], queue, 0);
  };

  const handleScroll = (event: any) => {
    const y = event?.nativeEvent?.contentOffset?.y ?? 0;
    scrollY.setValue(y);
    const on = y > heroH * 0.55;
    if (on !== barOnRef.current) {
      barOnRef.current = on;
      setBarOn(on);
    }
  };

  const handleShare = async () => {
    const url = `${BASE_API_URL}/artist/${encodeURIComponent(String(id || ""))}`;
    try {
      if (Platform.OS === "web") {
        const nav = typeof navigator !== "undefined" ? (navigator as any) : null;
        if (nav?.share) {
          await nav.share({ title: artistName, url });
          return;
        }
        let copiedOk = false;
        if (nav?.clipboard?.writeText) {
          try {
            await nav.clipboard.writeText(url);
            copiedOk = true;
          } catch {
            copiedOk = false;
          }
        }
        if (!copiedOk && typeof document !== "undefined") {
          const area = document.createElement("textarea");
          area.value = url;
          area.style.position = "fixed";
          area.style.opacity = "0";
          document.body.appendChild(area);
          area.focus();
          area.select();
          try {
            copiedOk = document.execCommand("copy");
          } catch {
            copiedOk = false;
          }
          document.body.removeChild(area);
        }
        setCopied(copiedOk);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setCopied(false), 2400);
        return;
      }
      await Share.share({ message: `${artistName} على Aura Music\n${url}` });
    } catch {
      // The native share sheet was dismissed or is unavailable.
    }
  };

  const changeDiscTab = (value: string) => {
    setDiscTab(value);
    setVisibleAlbums(12);
  };

  const barStyle = {
    opacity: scrollY.interpolate({
      inputRange: [heroH * 0.45, heroH * 0.68],
      outputRange: [0, 1],
      extrapolate: "clamp",
    }),
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [heroH * 0.45, heroH * 0.68],
          outputRange: [-10, 0],
          extrapolate: "clamp",
        }),
      },
    ],
  };

  const backdropStyle = {
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [0, heroH],
          outputRange: [0, heroH * 0.18],
          extrapolate: "clamp",
        }),
      },
      { scale: 1.12 },
    ],
  };

  if (loading && songs.length === 0) {
    return (
      <View style={styles.root}>
        <AuraCanvas intensity="ember" />

        {/* Back navigation button while loading */}
        <View style={[styles.loadingBackWrap, { top: insets.top + Space.s2, right: Space.s4 }]}>
          <AuraTouch
            feedback="selection"
            pressedScale={0.9}
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.heroIconBtn}
          >
            <ChevronRight size={20} color={Color.text_primary} />
          </AuraTouch>
        </View>

        <AuraCreativeLoader
          fullscreen
          message={`جارٍ جلب روائع وأعمال ${name || artistName || "الفنان"}… 🎵`}
        />
      </View>
    );
  }

  return (
    <AuraPageTransition style={styles.root}>
      <AuraCanvas intensity="ember" />

      <Animated.ScrollView
        ref={artistScrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: dockClearance + Space.s5 }]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── HERO ── */}
        <View style={[styles.hero, { height: heroH }]}>
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <AuraArtwork
              uri={artistArt}
              placeholder={PLACEHOLDER_ARTIST}
              size={screenWidth}
              ratio={1}
              shape="slab"
              ring="none"
              style={styles.heroBackdrop}
            />
          </Animated.View>

          <LinearGradient
            colors={["rgba(10,9,8,0.3)", "rgba(10,9,8,0.62)", Color.ink0]}
            locations={[0, 0.55, 1]}
            style={absFill}
          />
          <LinearGradient
            colors={[Color.veil_goldGlowSoft, "rgba(10,9,8,0)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.75 }}
            style={absFill}
          />

          <AuraTouch
            feedback="impact"
            pressedScale={0.9}
            onPress={handleShare}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.heroIconBtn, { top: insets.top + Space.s2, left: Space.s4 }]}
          >
            <Share2 size={18} color={Color.text_primary} />
          </AuraTouch>

          <AuraTouch
            feedback="selection"
            pressedScale={0.9}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.heroIconBtn, { top: insets.top + Space.s2, right: Space.s4 }]}
          >
            <ChevronRight size={20} color={Color.text_primary} />
          </AuraTouch>

          <View style={styles.heroBody}>
            <AuraKicker>ملف الفنان</AuraKicker>

            <View
              style={[
                styles.portraitWrap,
                { width: portraitSize + 26, height: portraitSize + 26 },
              ]}
            >
              <View
                style={[
                  styles.haloOuter,
                  { width: portraitSize + 40, height: portraitSize + 40 },
                ]}
              />
              <View
                style={[
                  styles.haloInner,
                  { width: portraitSize + 24, height: portraitSize + 24 },
                ]}
              />
              <AuraArtwork
                uri={artistArt}
                placeholder={PLACEHOLDER_ARTIST}
                size={portraitSize}
                shape="coin"
                ring="gold"
              />
              {verified && (
                <AuraTouch
                  feedback="impact"
                  pressedScale={0.9}
                  onPress={() => setVerifyOpen(true)}
                  accessibilityLabel="تفاصيل توثيق الفنان"
                  style={styles.seal}
                >
                  <LinearGradient colors={Gradient.ember} style={absFill} />
                  <BadgeCheck
                    size={16}
                    color={Color.text_onBrand}
                    strokeWidth={2.4}
                    style={styles.iconOverGradient}
                  />
                </AuraTouch>
              )}
            </View>

            <AuraText role="display" lines={2} align="center" style={styles.heroName}>
              {artistName}
            </AuraText>

            {verified && (
              <AuraTouch
                feedback="selection"
                pressedScale={0.97}
                onPress={() => setVerifyOpen(true)}
                style={styles.verifiedChip}
              >
                <BadgeCheck size={13} color={Color.gold100} strokeWidth={2.4} />
                <AuraText role="tiny" color={Color.gold100} style={styles.verifiedText}>
                  فنان موثّق
                </AuraText>
              </AuraTouch>
            )}
          </View>
        </View>

        {/* ── ACTIONS & STATS ── */}
        <AuraFadeIn delay={60} slideDistance={14}>
          <View style={styles.actionsRow}>
            <AuraTouch
              feedback="medium"
              pressedScale={0.97}
              onPress={() => playFrom(songs, false)}
              disabled={songs.length === 0}
              style={styles.playPill}
            >
              <LinearGradient
                colors={Gradient.signature}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={absFill}
              />
              <Play
                size={16}
                color={Color.text_onBrand}
                fill={Color.text_onBrand}
                style={styles.iconOverGradient}
              />
              <AuraText role="bodyStrong" color={Color.text_onBrand}>
                تشغيل الكل
              </AuraText>
            </AuraTouch>

            <AuraTouch
              feedback="impact"
              pressedScale={0.9}
              onPress={() => playFrom(songs, true)}
              disabled={songs.length === 0}
              accessibilityLabel="تشغيل عشوائي"
              style={styles.roundBtn}
            >
              <Shuffle size={18} color={Color.text_secondary} />
            </AuraTouch>

            <AuraTouch
              feedback="impact"
              pressedScale={0.9}
              onPress={handleShare}
              accessibilityLabel="مشاركة الفنان"
              style={styles.roundBtn}
            >
              <Share2 size={18} color={Color.text_secondary} />
            </AuraTouch>
          </View>

          {copied && (
            <AuraText role="tiny" color={Color.gold300} align="center" style={styles.copyHint}>
              تم نسخ رابط الفنان
            </AuraText>
          )}

          {/* ── STATS ── */}
          <View style={styles.statsBar}>
            <StatCell icon={<Music2 size={15} color={Color.gold300} />} value={songs.length} label="أغنية" />
            <View style={styles.statDivider} />
            <StatCell
              icon={<Layers size={15} color={Color.gold300} />}
              value={albumList.length}
              label="إصدار"
            />
            <View style={styles.statDivider} />
            <StatCell
              icon={<CalendarRange size={15} color={Color.gold300} />}
              value={period || "—"}
              label="الفترة"
              compact
            />
          </View>
        </AuraFadeIn>

        {/* ── PROMINENT IN-PAGE ARTIST SEARCH BAR ── */}
        <AuraFadeIn delay={120} slideDistance={14}>
          <View style={[styles.artistSearchBox, isSearchFocused && styles.artistSearchBoxFocused]}>
            <Search size={16} color={Color.gold500} strokeWidth={2.2} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder={`ابحث في جميع أعمال ${artistName}…`}
              placeholderTextColor={Color.text_muted}
              style={styles.artistSearchInput}
              autoCorrect={false}
              returnKeyType="search"
              selectionColor={Color.gold500}
            />
            {apiSearchLoading ? (
              <ActivityIndicator size="small" color={Color.gold500} />
            ) : query ? (
              <AuraTouch
                feedback="selection"
                pressedScale={0.9}
                onPress={() => setQuery("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={16} color={Color.text_muted} />
              </AuraTouch>
            ) : null}
          </View>
        </AuraFadeIn>

        {/* ── LIVE SEARCH RESULTS DISPLAY (When typing) ── */}
        {!!normalizedQuery && (
          <View style={styles.liveResultsSection}>
            <AuraSection
              kicker="البحث في الكتالوج"
              title={`الأغاني المطابقة لـ "${query}" (${filteredSongs.length})`}
              actionLabel={filteredSongs.length > 0 ? "تشغيل الكل" : undefined}
              onAction={() => playFrom(filteredSongs, false)}
              style={styles.section}
            />
            {filteredSongs.length > 0 ? (
              <View style={styles.songList}>
                {filteredSongs.map((song, index) => (
                  <SongItem
                    key={`search-${song.id}-${index}`}
                    song={song}
                    queue={filteredSongs}
                    index={index}
                    rank={index + 1}
                  />
                ))}
              </View>
            ) : apiSearchLoading ? (
              <View style={styles.searchLoadingBox}>
                <ActivityIndicator color={Color.gold500} size="small" />
                <AuraText role="caption" color={Color.text_muted} style={{ marginTop: 8 }}>
                  جارٍ البحث في جميع أعمال {artistName}…
                </AuraText>
              </View>
            ) : (
              <View style={styles.emptySearchBox}>
                <AuraText role="body" color={Color.text_muted} align="center">
                  لم يتم العثور على أغانٍ مطابقة لـ "{query}"
                </AuraText>
              </View>
            )}
            <AuraHairline intensity="gold" style={styles.divider} />
          </View>
        )}

        {/* ── TOP TRACKS ── */}
        {topTracks.length > 0 && (
          <AuraFadeIn delay={180} slideDistance={16}>
            <AuraSection
              kicker="الأكثر استماعًا"
              title="أفضل ٥ أغانٍ"
              actionLabel={songs.length > 5 ? "تشغيل الكل" : undefined}
              onAction={() => playFrom(songs, false)}
              style={styles.section}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
            >
              {topTracks.map((song, index) => {
                const views = formatViews(song.viewCount);
                const duration = formatDuration(song.duration);
                return (
                  <AuraTouch
                    key={`top-${song.id}-${index}`}
                    feedback="selection"
                    pressedScale={0.965}
                    onPress={() => playSong(song, songs, index)}
                    style={[styles.topCard, { width: topCardW }]}
                  >
                    <View>
                      <AuraArtwork
                        uri={resolveArtworkUri(
                          song.localArtworkPath,
                          song.thumbnailUrl,
                          song.youtubeVideoId,
                          "song",
                        )}
                        placeholder={PLACEHOLDER_ALBUM}
                        size={topCardW}
                        shape="slab"
                        ring={index === 0 ? "gold" : "hairline"}
                      />
                      <AuraText role="display" style={styles.topRank}>
                        {String(index + 1).padStart(2, "0")}
                      </AuraText>
                      <View style={styles.topPlay}>
                        <Play size={12} color={Color.text_onBrand} fill={Color.text_onBrand} />
                      </View>
                    </View>
                    <AuraText role="label" lines={1} style={styles.topTitle}>
                      {song.title}
                    </AuraText>
                    {!!(views || duration) && (
                      <AuraText role="tiny" lines={1} color={Color.text_muted}>
                        {views || duration}
                      </AuraText>
                    )}
                  </AuraTouch>
                );
              })}
            </ScrollView>
          </AuraFadeIn>
        )}

        {/* ── DISCOGRAPHY ── */}
        {albumList.length > 0 && (
          <AuraFadeIn delay={250} slideDistance={16}>
            <AuraSection
              kicker="الألبومات"
              title="الإصدارات"
              style={styles.section}
            />
            <AuraSegmented
              items={[
                { id: "all", label: `الكل · ${albumList.length}` },
                { id: "new", label: "جديد" },
                { id: "old", label: "أقدم" },
              ]}
              value={discTab}
              onChange={changeDiscTab}
              style={styles.discTabs}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
            >
              {discAlbums.slice(0, visibleAlbums).map((album, index) => (
                <AuraTouch
                  key={`album-${album.albumId || album.title}-${index}`}
                  feedback="selection"
                  pressedScale={0.97}
                  onPress={() =>
                    router.push({
                      pathname: "/album/[id]",
                      params: {
                        id: album.albumId || album.title,
                        title: album.title,
                        coverUrl: album.thumbnailUrl || album.coverUrl || "",
                        artist: artistName,
                      },
                    })
                  }
                  style={styles.releaseCard}
                >
                  <AuraArtwork
                    uri={resolveArtworkUri(
                      null,
                      album.thumbnailUrl || album.coverUrl,
                      undefined,
                      "album",
                    )}
                    placeholder={PLACEHOLDER_ALBUM}
                    size={RELEASE_W}
                    shape="slab"
                    ring="hairline"
                  />
                  <AuraText role="label" lines={1} style={styles.releaseTitle}>
                    {album.title}
                  </AuraText>
                  <AuraText role="tiny" color={Color.text_muted}>
                    {yearOf(album.year) || "إصدار"}
                    {album.songCount ? ` · ${album.songCount} أغنية` : ""}
                  </AuraText>
                </AuraTouch>
              ))}
            </ScrollView>

            {visibleAlbums < discAlbums.length && (
              <AuraTouch
                feedback="selection"
                pressedScale={0.98}
                onPress={() => setVisibleAlbums((count) => count + 12)}
                style={styles.moreBtn}
              >
                <AuraText role="label" color={Color.gold300}>
                  عرض المزيد من الإصدارات ({discAlbums.length - visibleAlbums})
                </AuraText>
                <ChevronLeft size={15} color={Color.gold300} />
              </AuraTouch>
            )}
          </AuraFadeIn>
        )}

        {/* ── FROM YOUR LIBRARY ── */}
        {librarySongs.length > 0 && (
          <>
            <AuraSection kicker="من مكتبتك" title="من استماعك السابق" style={styles.section} />
            <View style={styles.libraryList}>
              {librarySongs.map((song, index) => (
                <AuraTouch
                  key={`lib-${song.id}`}
                  feedback="selection"
                  pressedScale={0.98}
                  onPress={() => playSong(song, librarySongs, index)}
                  style={styles.libraryRow}
                >
                  <AuraArtwork
                    uri={resolveArtworkUri(
                      song.localArtworkPath,
                      song.thumbnailUrl,
                      song.youtubeVideoId,
                      "song",
                    )}
                    placeholder={PLACEHOLDER_ALBUM}
                    size={42}
                    shape="tile"
                    ring="hairline"
                  />
                  <View style={styles.libraryInfo}>
                    <AuraText role="label" lines={1}>
                      {song.title}
                    </AuraText>
                    <AuraText role="tiny" color={Color.text_muted} lines={1}>
                      {song.albumName || "من استماعك"}
                    </AuraText>
                  </View>
                  {favoriteIds.has(song.id) ? (
                    <Heart size={15} color={Color.gold500} fill={Color.gold500} />
                  ) : (
                    <Clock3 size={15} color={Color.text_muted} />
                  )}
                </AuraTouch>
              ))}
            </View>
          </>
        )}

        <AuraHairline intensity="gold" style={styles.divider} />

        {/* ── ALL SONGS ── */}
        <AuraFadeIn delay={320} slideDistance={18}>
          <AuraSection kicker="الكتالوج الكامل" title="كل الأغاني" style={styles.section} />

          <View style={styles.searchWrap}>
            <Search size={16} color={Color.text_muted} strokeWidth={1.8} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="ابحث في كتالوج الفنان"
              placeholderTextColor={Color.text_muted}
              style={styles.searchInput}
              autoCorrect={false}
              returnKeyType="search"
              selectionColor={Color.gold500}
            />
            {!!query && (
              <AuraTouch
                feedback="selection"
                pressedScale={0.9}
                onPress={() => setQuery("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={15} color={Color.text_muted} />
              </AuraTouch>
            )}
          </View>

          {!!normalizedQuery && (
            <AuraText role="tiny" color={Color.text_muted} style={styles.resultCount}>
              {filteredSongs.length > 0
                ? `${filteredSongs.length} نتيجة داخل كتالوج الفنان`
                : "لا توجد أغنية بهذا الاسم. جرّب كلمة أخرى"}
            </AuraText>
          )}

          {loading ? (
            <View style={styles.loadingBox}>
              <AuraBadge label="جارٍ تجهيز الكتالوج" tone="gold" />
              <AuraText role="caption" color={Color.text_secondary}>
                جارٍ تحميل أعمال الفنان…
              </AuraText>
            </View>
          ) : songs.length === 0 ? (
            <AuraSurface tone="gold" style={styles.emptySurface}>
              <Disc3 size={26} color={Color.gold500} />
              <AuraText role="titleSm">لا توجد أعمال متاحة لهذا الفنان حاليًا</AuraText>
              <AuraText role="caption" align="center">
                جرّب البحث باسم آخر، أو عد لاحقًا بعد إضافة أعمال الفنان إلى مكتبة Aura Music.
              </AuraText>
            </AuraSurface>
          ) : (
            <>
              <View style={styles.songList}>
                {visibleSongs.map((song, index) => (
                  <SongItem
                    key={`art-song-${song.id}-${index}`}
                    song={song}
                    queue={filteredSongs}
                    index={index}
                    rank={index + 1}
                  />
                ))}
              </View>

              {!normalizedQuery && !showAllSongs && filteredSongs.length > SONG_PREVIEW && (
                <AuraTouch
                  feedback="selection"
                  pressedScale={0.98}
                  onPress={() => setShowAllSongs(true)}
                  style={styles.moreBtn}
                >
                  <AuraText role="label" color={Color.gold300}>
                    عرض جميع الأغاني ({filteredSongs.length})
                  </AuraText>
                  <ChevronLeft size={15} color={Color.gold300} />
                </AuraTouch>
              )}
            </>
          )}
        </AuraFadeIn>
      </Animated.ScrollView>

      {/* ── STICKY BAR ── */}
      <Animated.View
        pointerEvents={barOn ? "auto" : "none"}
        style={[styles.topBar, { paddingTop: insets.top, height: insets.top + 54 }, barStyle]}
      >
        <View style={styles.topBarInner}>
          <AuraTouch
            feedback="selection"
            pressedScale={0.9}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.topBarBtn}
          >
            <ChevronRight size={20} color={Color.text_primary} />
          </AuraTouch>

          <View style={styles.topBarTitle}>
            <AuraText role="label" lines={1}>
              {artistName}
            </AuraText>
            {verified && <BadgeCheck size={14} color={Color.gold500} strokeWidth={2.3} />}
          </View>

          <AuraTouch
            feedback="impact"
            pressedScale={0.9}
            onPress={() => playFrom(songs, false)}
            disabled={songs.length === 0}
            accessibilityLabel="تشغيل الفنان"
            style={styles.topBarPlay}
          >
            <Play size={15} color={Color.text_onBrand} fill={Color.text_onBrand} />
          </AuraTouch>
        </View>
      </Animated.View>

      {/* ── VERIFICATION SHEET ── */}
      <Modal
        visible={verifyOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setVerifyOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={absFill} onPress={() => setVerifyOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + Space.s5 }]}>
            <View style={styles.sheetSeal}>
              <LinearGradient colors={Gradient.ember} style={absFill} />
              <BadgeCheck
                size={28}
                color={Color.text_onBrand}
                strokeWidth={2.2}
                style={styles.iconOverGradient}
              />
            </View>
            <AuraText role="title" align="center">
              فنان موثّق
            </AuraText>
            <AuraText role="caption" align="center" color={Color.text_secondary} style={styles.sheetCopy}>
              تعني هذه العلامة أن للفنان ملفًا فنيًا رسميًا في Aura Music: صورة رسمية،
              وكتالوج أغانٍ، وإصدارات موثّقة من YouTube Music.
            </AuraText>

            <View style={styles.factList}>
              <FactRow label="الكتالوج" value={`${songs.length} أغنية`} />
              <FactRow label="الإصدارات" value={`${albumList.length} إصدار`} />
              {!!period && <FactRow label="الفترة" value={period} />}
              {!!officialName && <FactRow label="الاسم الرسمي" value={officialName} />}
              <FactRow label="المصدر" value="YouTube Music" last />
            </View>

            <AuraTouch
              feedback="medium"
              pressedScale={0.98}
              onPress={() => setVerifyOpen(false)}
              style={styles.sheetBtn}
            >
              <LinearGradient
                colors={Gradient.signature}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={absFill}
              />
              <AuraText role="bodyStrong" color={Color.text_onBrand}>
                حسنًا
              </AuraText>
            </AuraTouch>
          </View>
        </View>
      </Modal>
    </AuraPageTransition>
  );
}

const StatCell: React.FC<{
  icon: React.ReactNode;
  value: string | number;
  label: string;
  compact?: boolean;
}> = ({ icon, value, label, compact }) => (
  <View style={styles.statCell}>
    {icon}
    <AuraText role={compact ? "titleSm" : "title"} color={Color.text_primary} style={styles.statValue}>
      {value}
    </AuraText>
    <AuraText role="tiny" color={Color.text_muted}>
      {label}
    </AuraText>
  </View>
);

const FactRow: React.FC<{ label: string; value: string; last?: boolean }> = ({
  label,
  value,
  last,
}) => (
  <View style={[styles.factRow, last && styles.factRowLast]}>
    <AuraText role="caption" color={Color.text_secondary}>
      {label}
    </AuraText>
    <AuraText role="label" lines={1} style={styles.factValue}>
      {value}
    </AuraText>
  </View>
);

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
    paddingTop: 0,
  },
  hero: {
    width: "100%",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  heroBackdrop: {
    position: "absolute",
    left: 0,
    top: 0,
    opacity: 0.46,
  },
  // Overlays use physical edges: the app is permanently RTL, and react-native-web resolves
  // absolute `start`/`end` against its own always-LTR I18nManager stub (native honours forceRTL).
  heroIconBtn: {
    position: "absolute",
    width: 38,
    height: 38,
    borderRadius: Radius.pill,
    backgroundColor: Color.veil_scrim,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 6,
  },
  heroBody: {
    alignItems: "center",
    paddingHorizontal: Space.s4,
    paddingBottom: Space.s5,
    gap: Space.s2,
  },
  portraitWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: Space.s2,
  },
  haloOuter: {
    position: "absolute",
    borderRadius: Radius.pill,
    backgroundColor: Color.veil_goldGlowSoft,
  },
  haloInner: {
    position: "absolute",
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  seal: {
    position: "absolute",
    left: 6,
    bottom: 6,
    width: 30,
    height: 30,
    borderRadius: Radius.pill,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Color.ink0,
  },
  // The gradient is an absolutely positioned sibling; on web it paints above
  // static siblings, so icons need their own stacking level.
  iconOverGradient: {
    zIndex: 1,
  },
  heroName: {
    marginTop: Space.s1,
  },
  verifiedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Space.s3,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: Color.veil_goldTintStrong,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  verifiedText: {
    letterSpacing: 0.4,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    paddingHorizontal: Space.s4,
    marginTop: Space.s2,
  },
  playPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    height: 46,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  roundBtn: {
    width: 46,
    height: 46,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink2,
    borderWidth: 1,
    borderColor: Color.veil_hairlineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  copyHint: {
    marginTop: Space.s2,
  },
  statsBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Space.s4,
    marginTop: Space.s4,
    paddingVertical: Space.s3,
    paddingHorizontal: Space.s2,
    borderRadius: Radius.lg,
    backgroundColor: Color.ink1,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statValue: {
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: Color.veil_hairline,
  },
  section: {
    marginTop: Space.s6,
  },
  rail: {
    gap: Space.s3,
    paddingHorizontal: Space.s4,
    paddingBottom: Space.s2,
  },
  topCard: {
    gap: 3,
  },
  topRank: {
    position: "absolute",
    left: 8,
    bottom: 2,
    fontSize: 30,
    lineHeight: 36,
    color: Color.gold500,
    textShadowColor: "rgba(0,0,0,0.65)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  topPlay: {
    position: "absolute",
    right: 7,
    bottom: 7,
    width: 26,
    height: 26,
    borderRadius: Radius.pill,
    backgroundColor: Color.gold500,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    marginTop: Space.s2,
  },
  discTabs: {
    marginHorizontal: Space.s4,
    marginBottom: Space.s3,
  },
  releaseCard: {
    width: RELEASE_W,
    gap: 3,
  },
  releaseTitle: {
    marginTop: Space.s2,
  },
  moreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s1,
    height: 42,
    marginHorizontal: Space.s4,
    marginTop: Space.s3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_hairlineStrong,
    backgroundColor: Color.ink1,
  },
  libraryList: {
    marginHorizontal: Space.s4,
    gap: Space.s2,
  },
  libraryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    padding: Space.s2,
    borderRadius: Radius.md,
    backgroundColor: Color.ink1,
    borderWidth: 1,
    borderColor: Color.veil_hairlineSoft,
  },
  libraryInfo: {
    flex: 1,
    minWidth: 0,
  },
  divider: {
    marginHorizontal: Space.s4,
    marginTop: Space.s6,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    height: 44,
    marginHorizontal: Space.s4,
    marginBottom: Space.s2,
    paddingHorizontal: Space.s3,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink1,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
  },
  searchInput: {
    flex: 1,
    color: Color.text_primary,
    fontSize: 13.5,
    paddingVertical: 0,
    textAlign: "right",
    ...(Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null),
  },
  resultCount: {
    marginHorizontal: Space.s4,
    marginBottom: Space.s2,
  },
  songList: {
    paddingHorizontal: Space.s2,
    gap: Space.s1,
  },
  loadingBox: {
    paddingVertical: Space.s7,
    alignItems: "center",
    gap: Space.s3,
  },
  emptySurface: {
    marginHorizontal: Space.s4,
    alignItems: "center",
    gap: Space.s2,
    padding: Space.s6,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
    backgroundColor: Color.ink0,
    borderBottomWidth: 1,
    borderBottomColor: Color.veil_hairline,
  },
  topBarInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    paddingHorizontal: Space.s3,
  },
  topBarBtn: {
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  topBarPlay: {
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    backgroundColor: Color.gold500,
    alignItems: "center",
    justifyContent: "center",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: Color.veil_scrim,
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    alignItems: "center",
    gap: Space.s2,
    paddingTop: Space.s5,
    paddingHorizontal: Space.s5,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    backgroundColor: Color.ink1,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
  },
  sheetSeal: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.s1,
  },
  sheetCopy: {
    paddingHorizontal: Space.s2,
  },
  factList: {
    alignSelf: "stretch",
    marginTop: Space.s3,
    marginBottom: Space.s3,
  },
  factRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Space.s3,
    paddingVertical: Space.s2,
    borderBottomWidth: 1,
    borderBottomColor: Color.veil_hairlineSoft,
  },
  factRowLast: {
    borderBottomWidth: 0,
  },
  factValue: {
    flexShrink: 1,
    textAlign: "left",
  },
  sheetBtn: {
    alignSelf: "stretch",
    height: 46,
    borderRadius: Radius.pill,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  artistSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Space.s4,
    marginTop: Space.s4,
    marginBottom: Space.s2,
    paddingHorizontal: Space.s3,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink2,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    gap: Space.s2,
  },
  artistSearchBoxFocused: {
    borderColor: Color.gold500,
    backgroundColor: Color.ink1,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 0 12px rgba(226,177,60, 0.2)",
        } as any)
      : null),
  },
  artistSearchInput: {
    flex: 1,
    color: Color.text_primary,
    fontSize: 14,
    paddingVertical: 4,
    textAlign: "right",
    borderWidth: 0,
    ...(Platform.OS === "web"
      ? ({
          outline: "none",
          outlineWidth: 0,
          outlineStyle: "none",
          boxShadow: "none",
        } as any)
      : null),
  },
  liveResultsSection: {
    marginTop: Space.s2,
    marginBottom: Space.s4,
  },
  searchLoadingBox: {
    padding: Space.s4,
    alignItems: "center",
    justifyContent: "center",
  },
  emptySearchBox: {
    padding: Space.s4,
    alignItems: "center",
    justifyContent: "center",
  },
});
