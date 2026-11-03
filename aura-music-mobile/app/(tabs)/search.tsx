import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Music, User, Disc, Flame, Radio, Heart, Coffee, Sparkles, X } from "lucide-react-native";
import { Color, Radius, Size, Space } from "@/theme";
import {
  AuraArtwork,
  AuraBadge,
  AuraCanvas,
  AuraChip,
  AuraFadeIn,
  AuraHairline,
  AuraPageTransition,
  AuraSection,
  AuraSegmented,
  AuraText,
  AuraTouch,
  type SegmentItem,
} from "@/ui";
import { Song } from "@/types/music";
import { MusicApi } from "@/services/api/musicApi";
import { usePlayerStore } from "@/store/usePlayerStore";
import { SongItem } from "@/components/SongItem";
import { getArtworkUrl } from "@/utils/media";
import { AuraCreativeLoader } from "@/components/AuraCreativeLoader";
import { scrollBus } from "@/utils/scrollBus";

const POPULAR_TAGS = [
  "عمرو دياب",
  "شيرين",
  "ويجز",
  "تامر حسني",
  "كايروكي",
  "حماقي",
  "أصالة",
  "The Weeknd",
  "Eminem",
  "Taylor Swift",
];

const BROWSE = [
  { id: "tarab", title: "طرب كلاسيكي", query: "طرب مصري", icon: Music },
  { id: "rap", title: "راب وهيب هوب", query: "راب مصري", icon: Flame },
  { id: "romantic", title: "رومانسي", query: "رومانسي", icon: Heart },
  { id: "shaabi", title: "شعبي", query: "مهرجانات", icon: Radio },
  { id: "chill", title: "استرخاء", query: "روقان", icon: Coffee },
  { id: "pop", title: "بوب عالمي", query: "Pop hits", icon: Sparkles },
];

type Filter = "all" | "songs" | "albums" | "artists";

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string }>();
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, 16);

  const [query, setQuery] = useState(
    typeof params.q === "string" ? params.q : "",
  );

  useEffect(() => {
    if (typeof params.q === "string" && params.q) setQuery(params.q);
  }, [params.q]);
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>("all");

  const playSong = usePlayerStore((s) => s.playSong);

  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const searchScrollRef = useRef<any>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return scrollBus.subscribe(() => {
      searchScrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, []);

  const dismissSearch = () => {
    Keyboard.dismiss();
    inputRef.current?.blur();
  };

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const handleDocClick = (e: any) => {
        if (inputRef.current && !(inputRef.current as any).contains?.(e.target)) {
          inputRef.current?.blur();
        }
      };
      document.addEventListener("mousedown", handleDocClick);
      return () => document.removeEventListener("mousedown", handleDocClick);
    }
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const trimmed = query.trim();
    if (!trimmed) {
      setSongs([]);
      setArtists([]);
      setAlbums([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        const results = await MusicApi.search(trimmed);
        setSongs(results.songs || []);
        setArtists(results.artists || []);
        setAlbums(results.albums || []);
      } catch (err) {
        console.warn("[Search] error:", err);
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  const totalCount = songs.length + albums.length + artists.length;

  const tabs: SegmentItem[] = [
    { id: "all", label: `الكل${totalCount ? ` ${totalCount}` : ""}` },
    { id: "songs", label: `أغانٍ${songs.length ? ` ${songs.length}` : ""}` },
    { id: "albums", label: `ألبومات${albums.length ? ` ${albums.length}` : ""}` },
    { id: "artists", label: `فنانون${artists.length ? ` ${artists.length}` : ""}` },
  ];

  const show = (kind: Filter) => filter === "all" || filter === kind;

  return (
    <AuraPageTransition style={styles.root}>
      <TouchableWithoutFeedback onPress={dismissSearch} accessible={false}>
        <View style={styles.root}>
          <AuraCanvas intensity="deep" />

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.shell}
        >
          <View style={[styles.topBar, { paddingTop: topInset + Space.s1 }]}>
            <View style={styles.field}>
              <AuraText role="title" style={styles.fieldTitle}>
                البحث
              </AuraText>
              <View style={[styles.inputWrap, isFocused && styles.inputWrapFocused]}>
                <TextInput
                  ref={inputRef}
                  value={query}
                  onChangeText={setQuery}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  placeholder="اسم أغنية أو فنان أو ألبوم"
                  placeholderTextColor={Color.text_muted}
                  style={styles.input}
                  autoCorrect={false}
                  returnKeyType="search"
                  selectionColor={Color.gold500}
                />
              {loading && <ActivityIndicator size="small" color={Color.gold500} />}
              {query.length > 0 && !loading && (
                <AuraTouch
                  feedback="selection"
                  pressedScale={0.9}
                  onPress={() => setQuery("")}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                >
                  <X size={17} color={Color.text_secondary} />
                </AuraTouch>
              )}
            </View>
          </View>
        </View>

        {!!query.trim() && (
          <View style={styles.filterWrap}>
            <AuraSegmented
              items={tabs}
              value={filter}
              onChange={(id) => setFilter(id as Filter)}
            />
          </View>
        )}

        {!query.trim() && (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.emptyPad}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onTouchStart={dismissSearch}
          >
            <View style={styles.suggestions}>
              {POPULAR_TAGS.map((tag) => (
                <AuraChip
                  key={tag}
                  label={tag}
                  size="sm"
                  onPress={() => setQuery(tag)}
                />
              ))}
            </View>

            <AuraHairline intensity="gold" style={{ marginVertical: Space.s4 }} />

            <AuraText role="sectionTitle" style={styles.gridTitle}>
              استكشف التصنيفات
            </AuraText>
            <View style={styles.browseGrid}>
              {BROWSE.map((cat) => {
                const Icon = cat.icon;
                return (
                  <AuraTouch
                    key={cat.id}
                    feedback="selection"
                    pressedScale={0.97}
                    onPress={() => setQuery(cat.query)}
                    style={styles.browseTile}
                  >
                    <View style={styles.browseIcon}>
                      <Icon size={18} color={Color.gold500} />
                    </View>
                    <AuraText role="label" lines={1}>
                      {cat.title}
                    </AuraText>
                  </AuraTouch>
                );
              })}
            </View>
          </ScrollView>
        )}

        {!!query.trim() && (
          <ScrollView
            ref={searchScrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.resultsPad}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onTouchStart={dismissSearch}
          >
            {loading && (
              <AuraCreativeLoader message={`جارٍ البحث في خزانة الموسيقى عن «${query}»…`} />
            )}
            {!loading && show("artists") && artists.length > 0 && (
              <>
                <AuraSection kicker="فنانون" title={`${artists.length} نتيجة`} align="start" />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                >
                  {artists.map((a, i) => (
                    <AuraTouch
                      key={`sa-${a.artistId ?? i}`}
                      feedback="selection"
                      pressedScale={0.94}
                      onPress={() =>
                        router.push({
                          pathname: "/artist/[id]",
                          params: {
                            id: a.artistId || a.artistName,
                            name: a.artistName || a.name,
                            imageUrl: a.thumbnailUrl || "",
                          },
                        })
                      }
                      style={styles.artistCol}
                    >
                      <AuraArtwork
                        uri={getArtworkUrl(a.thumbnailUrl, undefined, "artist")}
                        size={80}
                        shape="coin"
                        ring="gold"
                      />
                      <AuraText role="caption" lines={1} align="center" style={styles.artistName}>
                        {a.artistName || a.name}
                      </AuraText>
                    </AuraTouch>
                  ))}
                </ScrollView>
              </>
            )}

            {show("albums") && albums.length > 0 && (
              <>
                <AuraSection kicker="ألبومات" title={`${albums.length} ألبوم`} align="start" />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.rail}
                >
                  {albums.map((al, i) => (
                    <AuraTouch
                      key={`sal-${al.albumId ?? i}`}
                      feedback="selection"
                      pressedScale={0.97}
                      onPress={() =>
                        router.push({
                          pathname: "/album/[id]",
                          params: {
                            id: al.albumId || al.id,
                            title: al.title,
                            coverUrl: al.thumbnailUrl || "",
                            artist: al.artist || "",
                          },
                        })
                      }
                      style={styles.albumCol}
                    >
                      <AuraArtwork
                        uri={getArtworkUrl(al.thumbnailUrl || al.coverUrl, undefined, "album")}
                        size={124}
                        shape="slab"
                      />
                      <AuraText role="label" lines={1} style={styles.railTitle}>
                        {al.title}
                      </AuraText>
                      <AuraText role="caption" lines={1}>
                        {al.artist || ""}
                      </AuraText>
                    </AuraTouch>
                  ))}
                </ScrollView>
              </>
            )}

            {show("songs") && songs.length > 0 && (
              <>
                <AuraSection
                  kicker="أغانٍ"
                  title="النتائج الأقرب"
                  actionLabel="تشغيل الكل"
                  onAction={() => songs.length > 0 && playSong(songs[0], songs)}
                />
                <View style={styles.songList}>
                  {songs.map((s, i) => (
                    <SongItem
                      key={`ss-${s.id}-${i}`}
                      song={s}
                      queue={songs}
                      index={i}
                      rank={i + 1}
                    />
                  ))}
                </View>
              </>
            )}

            {!loading && totalCount === 0 && (
              <View style={styles.none}>
                <AuraBadge label="لا نتائج" tone="quiet" />
                <AuraText role="body" align="center" color={Color.text_secondary}>
                  لا توجد نتائج مطابقة لـ «{query}». جرّب اسم فنان أو عنوانًا آخر.
                </AuraText>
              </View>
            )}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </View>
  </TouchableWithoutFeedback>
  </AuraPageTransition>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.ink0 },
  shell: { flex: 1 },
  topBar: { paddingHorizontal: Space.s4, paddingTop: Space.s4 },
  field: {
    borderRadius: Radius.lg,
    backgroundColor: Color.ink1,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    padding: Space.s4,
  },
  fieldTitle: { fontSize: 24, lineHeight: 30, marginBottom: Space.s3 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    height: Size.touch,
    paddingHorizontal: Space.s4,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink2,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
  },
  inputWrapFocused: {
    borderColor: Color.gold500,
    backgroundColor: Color.ink1,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 0 12px rgba(226,177,60, 0.2)",
        } as any)
      : null),
  },
  input: {
    flex: 1,
    color: Color.text_primary,
    fontSize: 15,
    paddingVertical: 0,
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
  filterWrap: {
    paddingHorizontal: Space.s4,
    paddingTop: Space.s4,
    paddingBottom: Space.s2,
  },
  scroll: { flex: 1 },
  emptyPad: { padding: Space.s4, paddingBottom: Size.miniPlayer + Size.tabBar + Space.s7 },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: Space.s2 },
  gridTitle: { marginBottom: Space.s3 },
  browseGrid: { flexDirection: "row", flexWrap: "wrap", gap: Space.s3 },
  browseTile: {
    width: 160,
    minHeight: 92,
    padding: Space.s4,
    borderRadius: Radius.lg,
    backgroundColor: Color.ink1,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    justifyContent: "flex-end",
  },
  browseIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    backgroundColor: Color.veil_goldTint,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.s3,
  },

  resultsPad: { paddingBottom: Size.miniPlayer + Size.tabBar + Space.s7 },
  rail: { gap: Space.s4, paddingHorizontal: Space.s4, paddingBottom: Space.s5 },
  artistCol: { width: 92, alignItems: "center", flexShrink: 0 },
  artistName: { maxWidth: 88, marginTop: Space.s2 },
  albumCol: { width: 124, flexShrink: 0 },
  railTitle: { marginTop: Space.s2, marginBottom: 2 },
  songList: {
    marginHorizontal: Space.s4,
    paddingRight: Space.s1,
    borderRadius: Radius.lg,
    backgroundColor: Color.ink1,
    borderWidth: 1,
    borderColor: Color.veil_hairlineSoft,
    overflow: "hidden",
  },
  none: { alignItems: "center", gap: Space.s3, paddingVertical: Space.s7, paddingHorizontal: Space.s5 },
});
