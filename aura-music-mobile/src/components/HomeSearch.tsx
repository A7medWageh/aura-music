import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import {
  Search,
  X,
  Clock,
  Play,
  Music,
  Mic2,
  Disc,
  TrendingUp,
} from "lucide-react-native";
import { Color, Radius, Space } from "@/theme";
import { AuraArtwork, AuraText, AuraTouch } from "@/ui";
import { Song } from "@/types/music";
import { MusicApi } from "@/services/api/musicApi";
import { usePlayerStore } from "@/store/usePlayerStore";
import { resolveArtworkUri } from "@/utils/media";

const RECENT_KEY = "aura-recent-searches";
const SUGGESTIONS = ["عمرو دياب", "تامر عاشور", "محمد منير", "ويجز", "Taylor Swift", "Drake"];

async function readRecent(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function writeRecent(list: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Home search that behaves like the web widget: results appear in a dropdown
 * under the field and songs play immediately — no navigation to the search page
 * unless the user asks for the full result list.
 */
export const HomeSearch: React.FC = () => {
  const router = useRouter();
  const playSong = usePlayerStore((s) => s.playSong);

  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  const wrapRef = useRef<any>(null);
  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null);

  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const handleOutsideClick = (e: any) => {
        if (wrapRef.current && !(wrapRef.current as any).contains(e.target)) {
          close();
        }
      };
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("touchstart", handleOutsideClick, { passive: true });
      return () => {
        document.removeEventListener("mousedown", handleOutsideClick);
        document.removeEventListener("touchstart", handleOutsideClick);
      };
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 180);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (!debounced) {
      setSongs([]);
      setArtists([]);
      setAlbums([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    MusicApi.search(debounced)
      .then((res) => {
        if (cancelled) return;
        setSongs((res.songs || []).slice(0, 5));
        setArtists((res.artists || []).slice(0, 4));
        setAlbums((res.albums || []).slice(0, 3));
      })
      .catch(() => {
        if (!cancelled) {
          setSongs([]);
          setArtists([]);
          setAlbums([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useEffect(() => {
    readRecent().then(setRecent);
  }, []);

  const remember = useCallback((query: string) => {
    const value = query.trim();
    if (!value) return;
    setRecent((prev) => {
      const next = [value, ...prev.filter((x) => x !== value)].slice(0, 8);
      writeRecent(next);
      return next;
    });
  }, []);

  const close = () => {
    setOpen(false);
    inputRef.current?.blur();
    Keyboard.dismiss();
  };

  const handleSong = (song: Song) => {
    playSong(song, songs);
    remember(term);
    close();
  };

  const goToSearch = (query = term) => {
    const value = query.trim();
    if (!value) return;
    remember(value);
    close();
    router.push(`/(tabs)/search?q=${encodeURIComponent(value)}`);
  };

  const pickSuggestion = (value: string) => {
    setTerm(value);
    setDebounced(value.trim());
    setOpen(true);
  };

  const showResults = term.trim().length > 0;
  const hasResults = songs.length + artists.length + albums.length > 0;

  return (
    <View ref={wrapRef} style={styles.wrap}>
      <View style={[styles.field, open && styles.fieldOpen]}>
        {loading ? (
          <ActivityIndicator size="small" color={Color.gold500} />
        ) : (
          <Search size={17} color={open ? Color.gold300 : Color.text_muted} strokeWidth={1.8} />
        )}
        <TextInput
          ref={inputRef}
          value={term}
          onChangeText={(value) => {
            setTerm(value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onSubmitEditing={() => goToSearch()}
          placeholder="أغنية، فنان، أو ألبوم"
          placeholderTextColor={Color.text_muted}
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
          selectionColor={Color.gold500}
        />
        {term.length > 0 ? (
          <AuraTouch
            feedback="selection"
            pressedScale={0.9}
            onPress={() => {
              setTerm("");
              setSongs([]);
              setArtists([]);
              setAlbums([]);
              inputRef.current?.focus();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
          >
            <X size={16} color={Color.text_secondary} />
          </AuraTouch>
        ) : (
          <View style={styles.go}>
            <Search size={13} color={Color.gold100} />
          </View>
        )}
      </View>

      {open && (
        <View style={styles.panel}>
          {!showResults && (
            <View style={styles.pad}>
              {recent.length > 0 && (
                <>
                  <View style={styles.rowHead}>
                    <AuraText role="tiny" color={Color.text_muted}>
                      عمليات البحث الأخيرة
                    </AuraText>
                    <AuraTouch
                      feedback="selection"
                      onPress={() => {
                        setRecent([]);
                        writeRecent([]);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <AuraText role="tiny" color={Color.gold300}>
                        مسح الكل
                      </AuraText>
                    </AuraTouch>
                  </View>
                  {recent.slice(0, 5).map((query) => (
                    <AuraTouch
                      key={query}
                      feedback="selection"
                      pressedScale={1}
                      onPress={() => pickSuggestion(query)}
                      style={styles.recentRow}
                    >
                      <Clock size={15} color={Color.text_muted} />
                      <AuraText role="body" lines={1} style={{ flex: 1 }}>
                        {query}
                      </AuraText>
                      <Search size={13} color={Color.text_muted} />
                    </AuraTouch>
                  ))}
                  <View style={styles.divider} />
                </>
              )}

              <View style={styles.rowHead}>
                <AuraText role="tiny" color={Color.text_muted}>
                  استكشف
                </AuraText>
                <TrendingUp size={13} color={Color.text_muted} />
              </View>
              <View style={styles.chips}>
                {SUGGESTIONS.map((value) => (
                  <AuraTouch
                    key={value}
                    feedback="selection"
                    pressedScale={0.95}
                    onPress={() => pickSuggestion(value)}
                    style={styles.chip}
                  >
                    <AuraText role="tiny" color={Color.text_secondary}>
                      {value}
                    </AuraText>
                  </AuraTouch>
                ))}
              </View>
            </View>
          )}

          {showResults && loading && !hasResults && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={Color.gold500} />
              <AuraText role="caption" color={Color.text_muted}>
                جارٍ البحث عن «{term.trim()}»…
              </AuraText>
            </View>
          )}

          {showResults && !loading && !hasResults && (
            <View style={styles.empty}>
              <Music size={22} color={Color.text_muted} />
              <AuraText role="caption" color={Color.text_secondary}>
                لا نتائج لـ «{term.trim()}». جرّب كلمة أخرى.
              </AuraText>
            </View>
          )}

          {showResults && hasResults && (
            <View style={styles.pad}>
              {artists.length > 0 && (
                <>
                  <View style={styles.groupHead}>
                    <Mic2 size={12} color={Color.text_muted} />
                    <AuraText role="tiny" color={Color.text_muted}>
                      فنانون
                    </AuraText>
                  </View>
                  <View style={styles.artistRail}>
                    {artists.map((artist, index) => (
                      <AuraTouch
                        key={`hs-artist-${artist.artistId ?? index}`}
                        feedback="selection"
                        pressedScale={0.94}
                        onPress={() => {
                          remember(term);
                          close();
                          router.push({
                            pathname: "/artist/[id]",
                            params: {
                              id: artist.artistId || artist.artistName,
                              name: artist.artistName || artist.name,
                              imageUrl: artist.thumbnailUrl || "",
                            },
                          });
                        }}
                        style={styles.artistCol}
                      >
                        <AuraArtwork
                          uri={resolveArtworkUri(null, artist.thumbnailUrl, undefined, "artist")}
                          size={52}
                          shape="coin"
                          ring="gold"
                        />
                        <AuraText role="tiny" lines={1} align="center" style={styles.artistName}>
                          {artist.artistName || artist.name}
                        </AuraText>
                      </AuraTouch>
                    ))}
                  </View>
                </>
              )}

              {songs.length > 0 && (
                <>
                  <View style={styles.groupHead}>
                    <Music size={12} color={Color.text_muted} />
                    <AuraText role="tiny" color={Color.text_muted}>
                      أغانٍ
                    </AuraText>
                  </View>
                  {songs.map((song, index) => (
                    <AuraTouch
                      key={`hs-song-${song.id}-${index}`}
                      feedback="selection"
                      pressedScale={1}
                      onPress={() => handleSong(song)}
                      style={styles.songRow}
                    >
                      <AuraArtwork
                        uri={resolveArtworkUri(
                          song.localArtworkPath,
                          song.thumbnailUrl,
                          song.youtubeVideoId,
                        )}
                        size={40}
                        shape="tile"
                      />
                      <View style={styles.songInfo}>
                        <AuraText role="label" lines={1}>
                          {song.title}
                        </AuraText>
                        <AuraText role="tiny" lines={1} color={Color.text_muted}>
                          {song.artist}
                        </AuraText>
                      </View>
                      <View style={styles.playDot}>
                        <Play size={11} color={Color.ink0} fill={Color.ink0} />
                      </View>
                    </AuraTouch>
                  ))}
                </>
              )}

              {albums.length > 0 && (
                <>
                  <View style={styles.groupHead}>
                    <Disc size={12} color={Color.text_muted} />
                    <AuraText role="tiny" color={Color.text_muted}>
                      ألبومات
                    </AuraText>
                  </View>
                  {albums.map((album, index) => (
                    <AuraTouch
                      key={`hs-album-${album.albumId ?? index}`}
                      feedback="selection"
                      pressedScale={1}
                      onPress={() => {
                        remember(term);
                        close();
                        router.push({
                          pathname: "/album/[id]",
                          params: {
                            id: album.albumId || album.id,
                            title: album.title,
                            coverUrl: album.thumbnailUrl || "",
                            artist: album.artist || "",
                          },
                        });
                      }}
                      style={styles.songRow}
                    >
                      <AuraArtwork
                        uri={resolveArtworkUri(null, album.thumbnailUrl, undefined, "album")}
                        size={40}
                        shape="slab"
                      />
                      <View style={styles.songInfo}>
                        <AuraText role="label" lines={1}>
                          {album.title}
                        </AuraText>
                        <AuraText role="tiny" lines={1} color={Color.text_muted}>
                          {album.artist}
                        </AuraText>
                      </View>
                      <Disc size={15} color={Color.text_muted} />
                    </AuraTouch>
                  ))}
                </>
              )}

              <AuraTouch
                feedback="selection"
                pressedScale={1}
                onPress={() => goToSearch()}
                style={styles.viewAll}
              >
                <Search size={14} color={Color.gold300} />
                <AuraText role="label" color={Color.gold300}>
                  عرض كل نتائج «{term.trim()}»
                </AuraText>
              </AuraTouch>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { marginTop: Space.s4, zIndex: 40 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    height: 50,
    paddingHorizontal: Space.s4,
    borderRadius: Radius.lg,
    backgroundColor: Color.ink1,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
  },
  fieldOpen: {
    borderColor: Color.gold500,
    backgroundColor: Color.ink2,
    borderBottomLeftRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 0 12px rgba(226,177,60, 0.2)",
        } as any)
      : null),
  },
  input: {
    flex: 1,
    color: Color.text_primary,
    fontSize: 14,
    paddingVertical: 0,
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
  go: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    backgroundColor: Color.veil_goldTintStrong,
    alignItems: "center",
    justifyContent: "center",
  },

  panel: {
    marginTop: 6,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    backgroundColor: Color.ink1,
    overflow: "hidden",
  },
  pad: { padding: Space.s3 },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Space.s2,
    paddingHorizontal: Space.s1,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    paddingVertical: 8,
    paddingHorizontal: Space.s1,
  },
  divider: { height: 1, backgroundColor: Color.veil_hairlineSoft, marginVertical: Space.s2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: Space.s2 },
  chip: {
    paddingHorizontal: Space.s3,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    backgroundColor: Color.ink2,
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    padding: Space.s4,
  },
  empty: {
    alignItems: "center",
    gap: Space.s2,
    paddingVertical: Space.s5,
    paddingHorizontal: Space.s4,
  },

  groupHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    marginTop: Space.s2,
    marginBottom: Space.s2,
    paddingHorizontal: Space.s1,
  },
  artistRail: {
    flexDirection: "row",
    gap: Space.s3,
    marginBottom: Space.s3,
  },
  artistCol: { width: 62, alignItems: "center" },
  artistName: { marginTop: 4, maxWidth: 62 },

  songRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    paddingVertical: 6,
    paddingHorizontal: Space.s1,
    borderRadius: Radius.md,
  },
  songInfo: { flex: 1, minWidth: 0 },
  playDot: {
    width: 24,
    height: 24,
    borderRadius: Radius.pill,
    backgroundColor: Color.gold500,
    alignItems: "center",
    justifyContent: "center",
  },

  viewAll: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    marginTop: Space.s3,
    paddingVertical: Space.s3,
    borderRadius: Radius.md,
    backgroundColor: Color.veil_goldTint,
  },
});
