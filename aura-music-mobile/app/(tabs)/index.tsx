import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  Play,
  Flame,
  Headphones,
  Crown,
  Coffee,
  Car,
  BookOpen,
  Moon,
  Award,
  Sparkles,
  Heart,
  CheckCircle2,
  DownloadCloud,
} from "lucide-react-native";
import { Color, Gradient, Radius, Size, Space } from "@/theme";
import {
  AuraArtwork,
  AuraBadge,
  AuraCanvas,
  AuraFadeIn,
  AuraKicker,
  AuraLogo,
  AuraPageTransition,
  AuraPlayPulse,
  AuraSection,
  AuraText,
  AuraTouch,
} from "@/ui";
import { Song } from "@/types/music";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useLibraryStore } from "@/store/useLibraryStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useDownloadStore } from "@/store/useDownloadStore";
import { scrollBus } from "@/utils/scrollBus";
import { useHomeStore } from "@/store/useHomeStore";
import { resolveArtworkUri } from "@/utils/media";
import { HomeSearch } from "@/components/HomeSearch";
import { FeaturedArtistCarousel } from "@/components/FeaturedArtistCarousel";
import { HomeSkeletons } from "@/components/HomeSkeletons";
import { AuraCreativeLoader } from "@/components/AuraCreativeLoader";

const MOOD_CAPSULES_RICH = [
  { id: "coffee", title: "صباح هادئ", desc: "موسيقى خفيفة لبداية اليوم", icon: Coffee, query: "روقان هدوء" },
  { id: "focus", title: "تركيز", desc: "موسيقى بلا كلمات للعمل والدراسة", icon: BookOpen, query: "تركيز هادئ" },
  { id: "workout", title: "تدريب", desc: "إيقاعات سريعة للتمارين", icon: Flame, query: "حماس طاقة" },
  { id: "driving", title: "على الطريق", desc: "قوائم مناسبة للسفر والقيادة", icon: Car, query: "سفر طريق" },
  { id: "tarab", title: "طرب", desc: "كلاسيكيات الطرب العربي", icon: Award, query: "طرب أصيل" },
  { id: "night", title: "سهرة ليلية", desc: "أغاني هادئة لساعات المساء", icon: Moon, query: "حزن مشاعر" },
];

const ARABIC_GENRES = [
  { id: "tarab", title: "طرب", sub: "أعمال كوكب الشرق والعندليب", query: "طرب مصري أصيل", icon: Award },
  { id: "rap", title: "راب وهيب هوب", sub: "مشهد الراب المصري", query: "راب مصري", icon: Flame },
  { id: "shaabi", title: "شعبي", sub: "إيقاعات الشارع", query: "مهرجانات شعبية", icon: Headphones },
  { id: "romantic", title: "رومانسي", sub: "أغاني الحب", query: "أغاني رومانسية هادئة", icon: Heart },
  { id: "chill", title: "استرخاء", sub: "أجواء هادئة للاسترخاء", query: "روقان عربي", icon: Sparkles },
];

function formatDuration(seconds?: number) {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return "";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();

  // Store bindings
  const featuredArtists = useHomeStore((s) => s.featuredArtists);
  const trendingSongs = useHomeStore((s) => s.trendingSongs);
  const newReleases = useHomeStore((s) => s.newReleases);
  const popularArtists = useHomeStore((s) => s.popularArtists);
  const popularAlbums = useHomeStore((s) => s.popularAlbums);
  const spotifyHits = useHomeStore((s) => s.spotifyHits);
  const suggestedPlaylists = useHomeStore((s) => s.suggestedPlaylists);
  const regionalCharts = useHomeStore((s) => s.regionalCharts);
  const goldenClassics = useHomeStore((s) => s.goldenClassics);
  const isLoading = useHomeStore((s) => s.isLoading);
  const isRefreshing = useHomeStore((s) => s.isRefreshing);
  const initHomeStore = useHomeStore((s) => s.initHomeStore);
  const refresh = useHomeStore((s) => s.refresh);

  const currentSong = usePlayerStore((s) => s.currentSong);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playSong = usePlayerStore((s) => s.playSong);
  const togglePlay = usePlayerStore((s) => s.togglePlay);

  const isFavorite = useLibraryStore((s) => s.isFavorite);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);

  const isPremium = useAuthStore((s) => s.isPremium);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setAuthModalVisible = useAuthStore((s) => s.setAuthModalVisible);
  const setPremiumModalVisible = useAuthStore((s) => s.setPremiumModalVisible);

  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, 16);
  const scrollRef = useRef<any>(null);
  const downloadSong = useDownloadStore((s) => s.downloadSong);
  const downloadProgressMap = useDownloadStore((s) => s.progressMap);
  const downloadedSongs = useLibraryStore((s) => s.downloadedSongs);

  useEffect(() => {
    return scrollBus.subscribe(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, []);

  useEffect(() => {
    initHomeStore();
  }, [initHomeStore]);

  const openArtist = (id: string, name: string, imageUrl?: string) =>
    router.push({
      pathname: "/artist/[id]",
      params: { id, name, imageUrl: imageUrl ?? "" },
    });

  const railCardWidth = Math.round(
    Math.min(160, (width - Space.s4 * 2 - Space.s4) / 2.15),
  );
  const releaseCardWidth = 148;
  const moodTileWidth = (width - Space.s4 * 2 - Space.s3) / 2;

  // Render header
  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.brandGroup}>
          <AuraLogo size="md" />
        </View>

        <View style={styles.headerRightActions}>
          {/* Premium VIP status button */}
          <AuraTouch
            feedback="impact"
            pressedScale={0.92}
            onPress={() => setPremiumModalVisible(true)}
            style={[styles.vipBadgeBtn, isPremium && styles.vipBadgeBtnActive]}
          >
            <Crown size={14} color={isPremium ? Color.text_onBrand : Color.gold500} />
            <AuraText role="tiny" color={isPremium ? Color.text_onBrand : Color.gold300} style={{ fontWeight: "bold" }}>
              {isPremium ? "عضوية VIP" : "Premium"}
            </AuraText>
          </AuraTouch>

          {/* User avatar / login button */}
          <AuraTouch
            feedback="selection"
            pressedScale={0.92}
            onPress={() => (isAuthenticated ? router.push("/(tabs)/profile") : setAuthModalVisible(true))}
            style={styles.avatarBtn}
          >
            {isAuthenticated && user?.displayName ? (
              <View style={styles.initialsAvatar}>
                <AuraText role="tiny" color={Color.ink0} style={{ fontWeight: "bold" }}>
                  {user.displayName.substring(0, 2).toUpperCase()}
                </AuraText>
              </View>
            ) : (
              <AuraArtwork
                uri={resolveArtworkUri(null, null, undefined, "artist")}
                size={36}
                shape="coin"
                ring="gold"
              />
            )}
          </AuraTouch>
        </View>
      </View>

      {/* Global Interactive Search Input with Outside-tap Dismissal */}
      <HomeSearch />
    </View>
  );

  // If cold loading without any cached data, display creative studio loader
  if (isLoading && featuredArtists.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: topInset + Space.s1 }]}>
        <AuraCanvas intensity="ember" />
        {renderHeader()}
        <AuraCreativeLoader fullscreen message="جارٍ استدعاء نجوم الموسيقى العربية وقوائم التشغيل الأكثر رواجاً…" />
      </View>
    );
  }

  const releasesList = newReleases.slice(0, 12);
  const starsList = popularArtists.slice(0, 20);

  return (
    <AuraPageTransition style={styles.root}>
      <AuraCanvas intensity="ember" />

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: topInset + Space.s1 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={Color.gold500}
          />
        }
      >
        <View style={styles.page}>
          {/* Header */}
          {renderHeader()}

          {/* Section 01: Hero Slider — 15 Featured Artists Showcase */}
          {featuredArtists.length > 0 && (
            <AuraFadeIn delay={40} slideDistance={14}>
              <FeaturedArtistCarousel
                slides={featuredArtists}
                onPlaySong={(song, queue) => playSong(song, queue)}
                onOpenArtist={openArtist}
                onToggleFavorite={toggleFavorite}
                isFavorite={isFavorite}
              />
            </AuraFadeIn>
          )}

          {/* Section 02: Spotify Top Hits — 100% Franco Titles & Artists */}
          {spotifyHits.length > 0 && (
            <AuraFadeIn delay={100} slideDistance={14}>
              <AuraSection
                kicker="قائمة الاستماع اليومية"
                title="الأكثر استماعًا الآن"
                actionLabel="تشغيل الكل"
                onAction={() => {
                  const q = spotifyHits.map((h) => ({
                    id: h.id,
                    title: h.francoTitle,
                    artist: h.francoArtist,
                    youtubeVideoId: h.youtubeVideoId,
                    thumbnailUrl: h.thumbnailUrl,
                    duration: h.duration,
                  }));
                  playSong(q[0], q, 0);
                }}
              />
              <View style={styles.chartCard}>
                {spotifyHits.map((s, i) => {
                  const songObj: Song = {
                    id: s.id,
                    title: s.francoTitle,
                    artist: s.francoArtist,
                    youtubeVideoId: s.youtubeVideoId,
                    thumbnailUrl: s.thumbnailUrl,
                    duration: s.duration,
                  };
                  const active = currentSong?.id === s.id;
                  const queue = spotifyHits.map((h) => ({
                    id: h.id,
                    title: h.francoTitle,
                    artist: h.francoArtist,
                    youtubeVideoId: h.youtubeVideoId,
                    thumbnailUrl: h.thumbnailUrl,
                    duration: h.duration,
                  }));

                  return (
                    <AuraTouch
                      key={`spotify-${s.id}-${i}`}
                      feedback="selection"
                      pressedScale={1}
                      onPress={() => (active ? togglePlay() : playSong(songObj, queue, i))}
                      style={[
                        styles.chartRow,
                        i === spotifyHits.length - 1 && styles.chartRowLast,
                      ]}
                    >
                      <AuraText
                        role="numeric"
                        color={active ? Color.gold500 : i < 3 ? Color.gold300 : Color.text_muted}
                        style={[styles.chartRank, i < 3 && styles.topRankText]}
                      >
                        {i + 1}
                      </AuraText>

                      <AuraArtwork
                        uri={s.thumbnailUrl}
                        title={s.arabicTitle || s.francoTitle}
                        artist={s.arabicArtist || s.francoArtist}
                        size={48}
                        shape="tile"
                        ring={active ? "gold" : "hairline"}
                      />

                      <View style={styles.chartInfo}>
                        <AuraText
                          role="label"
                          lines={1}
                          color={active ? Color.gold300 : Color.text_primary}
                          style={{ fontWeight: "700" }}
                        >
                          {s.francoTitle}
                        </AuraText>
                        <AuraText role="caption" lines={1} color={Color.text_secondary}>
                          {s.francoArtist} · {s.streams}
                        </AuraText>
                      </View>

                        <View style={styles.chartActions}>
                          <AuraTouch
                            feedback="selection"
                            pressedScale={0.88}
                            onPress={(e) => {
                              (e as any)?.stopPropagation?.();
                              downloadSong(songObj);
                            }}
                            style={styles.directDownloadBtn}
                          >
                            {downloadedSongs.some((ds) => ds.id === songObj.id) || downloadProgressMap[songObj.id]?.status === "completed" ? (
                              <CheckCircle2 size={16} color={Color.gold500} />
                            ) : downloadProgressMap[songObj.id]?.status === "downloading" ? (
                              <AuraPlayPulse playing size={12} />
                            ) : (
                              <DownloadCloud size={16} color={Color.text_muted} />
                            )}
                          </AuraTouch>

                          {active && isPlaying ? (
                            <AuraPlayPulse playing size={14} />
                          ) : (
                            <AuraText role="numeric" color={Color.text_muted}>
                              {formatDuration(s.duration)}
                            </AuraText>
                          )}
                        </View>
                    </AuraTouch>
                  );
                })}
              </View>
            </AuraFadeIn>
          )}

          {/* Section 03: New Releases (أحدث الإصدارات الحصرية) */}
          {releasesList.length > 0 && (
            <AuraFadeIn delay={160} slideDistance={16}>
              <AuraSection
                kicker="إصدارات حديثة"
                title="أحدث الإصدارات"
                actionLabel="عرض الكل"
                onAction={() => router.push("/(tabs)/search?q=جديد 2026")}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {releasesList.map((rel, idx) => {
                  const isCurrent = currentSong?.id === rel.id;
                  return (
                    <AuraTouch
                      key={`rel-${rel.id}-${idx}`}
                      feedback="selection"
                      pressedScale={0.96}
                      onPress={() => (isCurrent ? togglePlay() : playSong(rel, releasesList, idx))}
                      style={[styles.releaseCard, { width: releaseCardWidth }]}
                    >
                      <AuraArtwork
                        uri={resolveArtworkUri(
                          rel.localArtworkPath,
                          rel.thumbnailUrl,
                          rel.youtubeVideoId,
                          "song",
                          rel.artist
                        )}
                        title={rel.title}
                        artist={rel.artist}
                        size={releaseCardWidth}
                        shape="slab"
                        ring={isCurrent ? "gold" : "hairline"}
                      >
                        <LinearGradient
                          colors={["rgba(10,9,8,0)", "rgba(10,9,8,0.85)"]}
                          style={styles.cardScrim}
                        />
                        <View style={styles.releaseBadgeWrap}>
                          <AuraBadge label={idx % 2 === 0 ? "جديد" : "حصري"} tone={idx % 2 === 0 ? "live" : "gold"} />
                        </View>
                        <View style={styles.cardPlayButton}>
                          <View style={[styles.miniPlayCircle, isCurrent && styles.miniPlayActive]}>
                            {isCurrent && isPlaying ? (
                              <AuraPlayPulse playing size={11} />
                            ) : (
                              <Play size={11} color={Color.ink0} fill={Color.ink0} style={{ marginLeft: 1 }} />
                            )}
                          </View>
                        </View>
                      </AuraArtwork>

                      <AuraText role="label" lines={1} style={styles.railTitle}>
                        {rel.title}
                      </AuraText>
                      <AuraText role="caption" lines={1} color={Color.text_muted}>
                        {rel.artist}
                      </AuraText>
                    </AuraTouch>
                  );
                })}
              </ScrollView>
            </AuraFadeIn>
          )}

          {/* Section 04: 20 Arab Stars (كبار نجوم الموسيقى العربية) */}
          {starsList.length > 0 && (
            <AuraFadeIn delay={220} slideDistance={16}>
              <AuraSection
                kicker="فنانون موثّقون"
                title="أبرز الفنانين"
                actionLabel="عرض الكل"
                onAction={() => router.push("/(tabs)/search")}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {starsList.map((a, i) => (
                  <AuraTouch
                    key={`artist-${a.artistId ?? i}`}
                    feedback="selection"
                    pressedScale={0.94}
                    onPress={() => openArtist(a.artistId || a.name, a.name, a.thumbnailUrl)}
                    style={styles.artistCol}
                  >
                    <AuraArtwork
                      uri={resolveArtworkUri(null, a.thumbnailUrl, undefined, "artist")}
                      size={76}
                      shape="coin"
                      ring="gold"
                      glow
                    />
                    <AuraText
                      role="caption"
                      lines={1}
                      align="center"
                      style={styles.artistName}
                    >
                      {a.name}
                    </AuraText>
                    <View style={styles.verifiedRow}>
                      <CheckCircle2 size={11} color={Color.gold500} />
                      <AuraText role="tiny" color={Color.text_muted} style={{ fontSize: 9 }}>
                        فنان موثق
                      </AuraText>
                    </View>
                  </AuraTouch>
                ))}
              </ScrollView>
            </AuraFadeIn>
          )}

          {/* Section 05: Suggested Playlists for You (قوائم تشغيل مقترحة لك) */}
          {suggestedPlaylists.length > 0 && (
            <AuraFadeIn delay={280} slideDistance={16}>
              <AuraSection
                kicker="مختارة لك"
                title="قوائم تشغيل مقترحة"
                align="start"
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {suggestedPlaylists.map((pl) => (
                  <AuraTouch
                    key={pl.id}
                    feedback="selection"
                    pressedScale={0.96}
                    onPress={() => playSong(pl.song, [pl.song])}
                    style={[styles.railCard, { width: railCardWidth }]}
                  >
                    <AuraArtwork
                      uri={pl.coverUrl}
                      title={pl.title}
                      size={railCardWidth}
                      shape="slab"
                      ring="hairline"
                    >
                      <LinearGradient
                        colors={["rgba(10,9,8,0)", "rgba(10,9,8,0.85)"]}
                        style={styles.cardScrim}
                      />
                      <View style={styles.playlistMetaBadge}>
                        <AuraText role="tiny" color={Color.gold300} style={{ fontSize: 10 }}>
                          {pl.followers}
                        </AuraText>
                      </View>
                    </AuraArtwork>

                    <AuraText role="label" lines={1} style={styles.railTitle}>
                      {pl.title}
                    </AuraText>
                    <AuraText role="caption" lines={1} color={Color.text_muted}>
                      {pl.subtitle}
                    </AuraText>
                  </AuraTouch>
                ))}
              </ScrollView>
            </AuraFadeIn>
          )}

          {/* Section 06: Regional Top 50 Spotify Charts (توب 50 العالم العربي) */}
          {regionalCharts.length > 0 && (
            <AuraFadeIn delay={340} slideDistance={16}>
              <AuraSection
                kicker="القوائم الإقليمية"
                title="الأكثر استماعًا في الوطن العربي"
                align="start"
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {regionalCharts.map((reg) => (
                  <AuraTouch
                    key={reg.id}
                    feedback="selection"
                    pressedScale={0.96}
                    onPress={() => playSong(reg.song, [reg.song])}
                    style={styles.regionalCard}
                  >
                    <LinearGradient
                      colors={["rgba(226,177,60,0.16)", "rgba(16,13,11,0.95)"]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.regionalTop}>
                      <AuraText role="display" style={{ fontSize: 26 }}>
                        {reg.flag}
                      </AuraText>
                    </View>
                    <AuraText role="label" color={Color.gold100} style={{ marginTop: Space.s2, fontWeight: "700" }}>
                      {reg.title}
                    </AuraText>
                    <AuraText role="tiny" color={Color.text_muted} lines={1}>
                      {reg.sub}
                    </AuraText>
                  </AuraTouch>
                ))}
              </ScrollView>
            </AuraFadeIn>
          )}

          {/* Section 07: Golden Era Classics (روائع الزمن الجميل والتراث) */}
          {goldenClassics.length > 0 && (
            <AuraFadeIn delay={400} slideDistance={16}>
              <AuraSection
                kicker="تراث موسيقي"
                title="روائع الزمن الجميل"
                align="start"
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {goldenClassics.map((cls) => (
                  <AuraTouch
                    key={cls.id}
                    feedback="selection"
                    pressedScale={0.96}
                    onPress={() => playSong(cls.song, [cls.song])}
                    style={[styles.railCard, { width: railCardWidth }]}
                  >
                    <AuraArtwork
                      uri={cls.coverUrl}
                      title={cls.title}
                      artist={cls.artist}
                      size={railCardWidth}
                      shape="slab"
                      ring="hairline"
                    >
                      <LinearGradient
                        colors={["rgba(10,9,8,0)", "rgba(10,9,8,0.7)"]}
                        style={styles.cardScrim}
                      />
                    </AuraArtwork>

                    <AuraText role="label" lines={1} style={styles.railTitle}>
                      {cls.title}
                    </AuraText>
                    <AuraText role="caption" lines={1} color={Color.text_muted}>
                      {cls.artist} · {cls.year}
                    </AuraText>
                  </AuraTouch>
                ))}
              </ScrollView>
            </AuraFadeIn>
          )}

          {/* Section 08: Iconic Classic Albums (ألبومات صنعت التاريخ) */}
          {popularAlbums.length > 0 && (
            <AuraFadeIn delay={460} slideDistance={16}>
              <AuraSection
                kicker="ألبومات خالدة"
                title="ألبومات في ذاكرة الموسيقى العربية"
                align="start"
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
              >
                {popularAlbums.map((alb) => (
                  <AuraTouch
                    key={alb.id}
                    feedback="selection"
                    pressedScale={0.96}
                    onPress={() => playSong(alb.song, [alb.song])}
                    style={[styles.railCard, { width: railCardWidth }]}
                  >
                    <AuraArtwork
                      uri={resolveArtworkUri(undefined, alb.coverUrl, alb.song.youtubeVideoId, "album", alb.artist)}
                      title={alb.title}
                      artist={alb.artist}
                      size={railCardWidth}
                      shape="slab"
                      ring="hairline"
                    >
                      <LinearGradient
                        colors={["rgba(10,9,8,0)", "rgba(10,9,8,0.7)"]}
                        style={styles.cardScrim}
                      />
                    </AuraArtwork>

                    <AuraText role="label" lines={1} style={styles.railTitle}>
                      {alb.title}
                    </AuraText>
                    <AuraText role="caption" lines={1} color={Color.text_muted}>
                      {alb.artist} · {alb.year}
                    </AuraText>
                  </AuraTouch>
                ))}
              </ScrollView>
            </AuraFadeIn>
          )}

          {/* Section 09: Mood & Activity Capsules */}
          <AuraFadeIn delay={520} slideDistance={16}>
            <AuraSection kicker="حسب المزاج" title="استمع حسب حالتك" align="start" />
            <View style={styles.moodGrid}>
              {MOOD_CAPSULES_RICH.map((mood) => {
                const Icon = mood.icon;
                return (
                  <AuraTouch
                    key={mood.id}
                    feedback="impact"
                    pressedScale={0.97}
                    onPress={() => router.push(`/(tabs)/search?q=${encodeURIComponent(mood.query)}`)}
                    style={[styles.moodTile, { width: moodTileWidth }]}
                  >
                    <View style={styles.moodIcon}>
                      <Icon size={18} color={Color.gold500} />
                    </View>
                    <AuraText role="sectionTitle" style={styles.moodTitle}>
                      {mood.title}
                    </AuraText>
                    <AuraText role="caption" lines={1} color={Color.text_muted}>
                      {mood.desc}
                    </AuraText>
                  </AuraTouch>
                );
              })}
            </View>
          </AuraFadeIn>

          {/* Section 10: Arabic Music Genres */}
          <AuraFadeIn delay={580} slideDistance={16}>
            <AuraSection
              kicker="الأنواع الموسيقية"
              title="استكشف الأنواع"
              align="start"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
            >
              {ARABIC_GENRES.map((g) => {
                const Icon = g.icon;
                return (
                  <AuraTouch
                    key={g.id}
                    feedback="impact"
                    pressedScale={0.96}
                    onPress={() => router.push(`/(tabs)/search?q=${encodeURIComponent(g.query)}`)}
                    style={styles.genreCard}
                  >
                    <LinearGradient
                      colors={["rgba(226,177,60,0.18)", "rgba(10,9,8,0.92)"]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.genreIconWrap}>
                      <Icon size={20} color={Color.gold500} />
                    </View>
                    <AuraText role="label" color={Color.gold100} style={{ marginTop: Space.s2 }}>
                      {g.title}
                    </AuraText>
                    <AuraText role="tiny" color={Color.text_muted} lines={1}>
                      {g.sub}
                    </AuraText>
                  </AuraTouch>
                );
              })}
            </ScrollView>
          </AuraFadeIn>

          {/* Section 11: Aura VIP Membership Promo Card */}
          <AuraFadeIn delay={640} slideDistance={16}>
            <View style={styles.vipBannerWrap}>
              <LinearGradient
                colors={["rgba(226,177,60,0.22)", "rgba(10,9,8,0.95)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.vipBannerFace}
              >
                <View style={styles.vipBannerContent}>
                  <View style={styles.vipBannerCrown}>
                    <Crown size={24} color={Color.gold500} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <AuraText role="title" color={Color.gold100} style={{ fontSize: 18 }}>
                      Aura Premium
                    </AuraText>
                    <AuraText role="caption" color={Color.text_muted}>
                      جودة استوديو 32-bit، مضخّم صوت حتى 200%، وصوت محيطي 8D.
                    </AuraText>
                  </View>
                  <AuraTouch
                    feedback="impact"
                    pressedScale={0.94}
                    onPress={() => setPremiumModalVisible(true)}
                    style={styles.vipActionBtn}
                  >
                    <LinearGradient
                      colors={[Gradient.ember[0], Gradient.signature[1]]}
                      style={styles.vipActionFace}
                    >
                      <AuraText role="bodyStrong" color={Color.ink0}>
                        {isPremium ? "عضوية نشطة" : "ترقية الآن"}
                      </AuraText>
                    </LinearGradient>
                  </AuraTouch>
                </View>
              </LinearGradient>
            </View>
          </AuraFadeIn>

          {/* Safe scroll tail preventing any overlap with MiniPlayer & MobileTabBar */}
          <View style={styles.tail} />
        </View>
      </ScrollView>
    </AuraPageTransition>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.ink0 },
  scroll: { flex: 1 },
  content: {
    paddingTop: Space.s4,
    paddingBottom: Size.miniPlayer + Size.tabBar + Space.s8,
  },
  tail: { height: Space.s7 },
  page: { width: "100%", maxWidth: 620, alignSelf: "center" },

  header: { paddingHorizontal: Space.s4, marginBottom: Space.s4 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandGroup: { flexDirection: "row", alignItems: "center", gap: Space.s3 },
  headerRightActions: { flexDirection: "row", alignItems: "center", gap: Space.s2 },
  vipBadgeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Space.s3,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    backgroundColor: Color.veil_goldTint,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  vipBadgeBtnActive: {
    backgroundColor: Color.gold500,
    borderColor: Color.gold300,
  },
  greeting: { marginTop: Space.s4, marginBottom: Space.s3 },
  avatarBtn: { padding: 2 },
  initialsAvatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: Color.gold500,
    alignItems: "center",
    justifyContent: "center",
  },

  chartCard: {
    marginHorizontal: Space.s4,
    marginBottom: Space.s5,
    backgroundColor: Color.ink1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    overflow: "hidden",
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Space.s2,
    paddingHorizontal: Space.s3,
    borderBottomWidth: 1,
    borderBottomColor: Color.veil_hairlineSoft,
    gap: Space.s3,
  },
  chartRowLast: { borderBottomWidth: 0 },
  chartRank: { width: 22, textAlign: "center", fontWeight: "700" },
  topRankText: { fontSize: 15 },
  chartInfo: { flex: 1, minWidth: 0 },
  chartActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
  },
  directDownloadBtn: {
    padding: 6,
    borderRadius: Radius.pill,
  },

  rail: {
    flexDirection: "row",
    gap: Space.s4,
    paddingHorizontal: Space.s4,
    paddingBottom: Space.s5,
  },
  railCard: { flexShrink: 0 },
  releaseCard: { flexShrink: 0 },
  railTitle: { marginTop: Space.s2, marginBottom: 2, fontWeight: "600" },
  cardScrim: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
  },
  releaseBadgeWrap: {
    position: "absolute",
    top: Space.s2,
    right: Space.s2,
  },
  cardPlayButton: {
    position: "absolute",
    left: Space.s2,
    bottom: Space.s2,
  },
  playlistMetaBadge: {
    position: "absolute",
    right: Space.s2,
    bottom: Space.s2,
    backgroundColor: "rgba(10,9,8,0.75)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  regionalCard: {
    width: 148,
    minHeight: 112,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    padding: Space.s3,
    justifyContent: "space-between",
    overflow: "hidden",
  },
  regionalTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  miniPlayCircle: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    backgroundColor: Color.gold500,
    alignItems: "center",
    justifyContent: "center",
  },
  miniPlayActive: {
    backgroundColor: Color.state_danger,
  },

  artistCol: { alignItems: "center", width: 84 },
  artistName: { marginTop: Space.s2, marginBottom: 2, width: 84, fontWeight: "600" },
  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },

  moodGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.s3,
    paddingHorizontal: Space.s4,
    paddingBottom: Space.s5,
  },
  moodTile: {
    minHeight: 104,
    padding: Space.s4,
    borderRadius: Radius.lg,
    backgroundColor: Color.ink1,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    justifyContent: "flex-end",
  },
  moodIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    backgroundColor: Color.veil_goldTint,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.s2,
  },
  moodTitle: { marginBottom: 2 },

  genreCard: {
    width: 148,
    minHeight: 108,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    padding: Space.s4,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  genreIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Color.veil_goldTint,
    alignItems: "center",
    justifyContent: "center",
  },

  vipBannerWrap: {
    marginHorizontal: Space.s4,
    marginBottom: Space.s5,
    borderRadius: Radius.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Color.gold500,
  },
  vipBannerFace: {
    padding: Space.s4,
  },
  vipBannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
  },
  vipBannerCrown: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    backgroundColor: Color.veil_goldTint,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    alignItems: "center",
    justifyContent: "center",
  },
  vipActionBtn: {
    borderRadius: Radius.md,
    overflow: "hidden",
  },
  vipActionFace: {
    paddingHorizontal: Space.s3,
    paddingVertical: Space.s2,
    alignItems: "center",
    justifyContent: "center",
  },
});
