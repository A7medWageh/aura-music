import React, { useState, useEffect, useMemo, useRef } from "react";
import { View, StyleSheet, ScrollView, TextInput, Modal, useWindowDimensions, Platform } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Play,
  Trash2,
  ArrowRight,
  DownloadCloud,
  Lock,
  Unlock,
  EyeOff,
  Eye,
  CheckCircle2,
  Search,
  X,
  FileText,
  Sparkles,
  RefreshCw,
  Smartphone,
  Edit2,
  FolderPlus,
  FolderInput,
  Folder,
  Heart,
} from "lucide-react-native";

import { Color, Gradient, Radius, Space, Type } from "@/theme";
import { Song } from "@/types/music";
import { useLibraryStore } from "@/store/useLibraryStore";
import { usePlayerStore } from "@/store/usePlayerStore";
import { useDownloadStore } from "@/store/useDownloadStore";
import { seedCurated50SongsMobile } from "@/services/offline/seedCatalog";
import { searchOfflineSongs, type OfflineSearchResult } from "@/utils/arabicSearch";
import { resolveArtworkUri, getArtworkUrl } from "@/utils/media";
import { normalizeArabicName, latinizeArtist } from "@/utils/latinize";
import { getArtistAvatar } from "@/constants/artistAvatars";
import { MusicApi } from "@/services/api/musicApi";
import { scrollBus } from "@/utils/scrollBus";
import { getAllCachedLyricsMap } from "@/database/db";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LibraryBackupModal } from "@/components/LibraryBackupModal";
import { PLACEHOLDER_ARTIST, PLACEHOLDER_ALBUM, PLACEHOLDER_SONG } from "@/constants/placeholders";
import {
  AuraArtwork,
  AuraBadge,
  AuraCanvas,
  AuraChip,
  AuraDotRail,
  AuraHairline,
  AuraKicker,
  AuraPlayPulse,
  AuraSegmented,
  AuraSurface,
  AuraText,
  AuraTouch,
  AuraPageTransition,
  useDockClearance,
} from "@/ui";
import { AuraCreativeLoader } from "@/components/AuraCreativeLoader";

const GRID_GAP = Space.s3;
const absFill = StyleSheet.absoluteFill as any;

type AlbumFolder = { name: string; songs: Song[]; cover: string };
type ArtistFolder = { name: string; albums: AlbumFolder[]; singles: Song[]; cover: string };
type ViewFilter = "all" | "artists" | "albums" | "folders" | "downloads";

export default function LibraryScreen() {
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const artistColWidth = Math.max(90, Math.floor((windowWidth - Space.s4 * 2 - Space.s3 * 2) / 3));
  const albumColWidth = Math.max(140, Math.floor((windowWidth - Space.s4 * 2 - Space.s3) / 2));

  const downloadedSongs = useLibraryStore((s) => s.downloadedSongs);
  const favorites = useLibraryStore((s) => s.favorites);
  const customFolders = useLibraryStore((s) => s.customFolders);
  const loadLibrary = useLibraryStore((s) => s.loadLibrary);
  const toggleSongHidden = useLibraryStore((s) => s.toggleSongHidden);
  const renameFolder = useLibraryStore((s) => s.renameFolder);
  const moveSongToFolder = useLibraryStore((s) => s.moveSongToFolder);
  const deleteFolder = useLibraryStore((s) => s.deleteFolder);
  const deleteArtist = useLibraryStore((s) => s.deleteArtist);
  const deleteAlbum = useLibraryStore((s) => s.deleteAlbum);
  const deleteDownloadedSong = useLibraryStore((s) => s.deleteDownloadedSong);
  const createCustomFolder = useLibraryStore((s) => s.createCustomFolder);

  const playSong = usePlayerStore((s) => s.playSong);

  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, 16);

  const [openArtist, setOpenArtist] = useState<string | null>(null);
  const [openAlbum, setOpenAlbum] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "meta" | "lyrics">("all");

  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [vaultPassword, setVaultPassword] = useState("");
  const [showVaultPrompt, setShowVaultPrompt] = useState(false);

  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [createdFolderName, setCreatedFolderName] = useState("");

  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");

  const [movingSong, setMovingSong] = useState<Song | null>(null);
  const [targetFolder, setTargetFolder] = useState("");

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [isSeeding50, setIsSeeding50] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const mainScrollRef = useRef<any>(null);

  useEffect(() => {
    return scrollBus.subscribe(() => {
      mainScrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, []);
  const [artistPhotos, setArtistPhotos] = useState<Record<string, string>>({});
  const [artistPhotosLatin, setArtistPhotosLatin] = useState<Record<string, string>>({});
  const [cachedLyricsMap, setCachedLyricsMap] = useState<Map<string, string>>(new Map());

  const dockClearance = useDockClearance();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    loadLibrary();
  }, [vaultUnlocked]);

  useEffect(() => {
    let alive = true;
    getAllCachedLyricsMap().then((m) => {
      if (alive && m) setCachedLyricsMap(m);
    });
    return () => {
      alive = false;
    };
  }, [downloadedSongs]);

  useEffect(() => {
    let alive = true;
    MusicApi.getArtists()
      .then(({ egyptian = [], intl = [] }) => {
        if (!alive) return;
        const map: Record<string, string> = {};
        const latinMap: Record<string, string> = {};
        for (const a of [...egyptian, ...intl]) {
          const name = a?.name || a?.artistName;
          const image = getArtworkUrl(a?.thumbnailUrl || a?.imageUrl, undefined, "artist");
          if (name && image) {
            map[normalizeArabicName(name)] = image;
            // The catalogue stores many artists under their Latin name
            // (Angham vs أنغام), so index the transliteration too.
            latinMap[latinizeArtist(name).toLowerCase()] = image;
          }
        }
        setArtistPhotos(map);
        setArtistPhotosLatin(latinMap);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const findArtistPhoto = (name: string): string | undefined => {
    const directAvatar = getArtistAvatar(name);
    if (directAvatar) return directAvatar;
    const key = normalizeArabicName(name);
    if (!key) return undefined;
    const direct = artistPhotos[key];
    if (direct) return direct;
    const latinKey = latinizeArtist(name).toLowerCase();
    const latinMatch = artistPhotosLatin[latinKey];
    if (latinMatch) return latinMatch;
    if (key.length < 3) return undefined;
    for (const [candidate, photo] of Object.entries(artistPhotos)) {
      if (candidate.length >= 3 && (candidate.includes(key) || key.includes(candidate))) {
        return photo;
      }
    }
    for (const [candidate, photo] of Object.entries(artistPhotosLatin)) {
      if (candidate.length >= 3 && (candidate.includes(latinKey) || latinKey.includes(candidate))) {
        return photo;
      }
    }
    return undefined;
  };

  const visibleSongs = useMemo(
    () => downloadedSongs.filter((s) => (vaultUnlocked ? true : !s.isHidden)),
    [downloadedSongs, vaultUnlocked],
  );

  const stats = useMemo(() => {
    const count = visibleSongs.length;
    const totalBytes = visibleSongs.reduce((acc, s) => acc + (s.fileSize || 3600000), 0);
    return { count, sizeMB: totalBytes / (1024 * 1024) };
  }, [visibleSongs]);

  const artists: ArtistFolder[] = useMemo(() => {
    const artistMap = new Map<string, { albums: Map<string, Song[]>; singles: Song[] }>();

    for (const song of visibleSongs) {
      const rawArtist = song.folderName || song.artist || "غير معروف";
      const artistName = rawArtist.trim() || "غير معروف";
      if (!artistMap.has(artistName)) {
        artistMap.set(artistName, { albums: new Map(), singles: [] });
      }
      const artistNode = artistMap.get(artistName)!;

      if (song.albumName && song.albumName.trim()) {
        const albumName = song.albumName.trim();
        if (!artistNode.albums.has(albumName)) artistNode.albums.set(albumName, []);
        artistNode.albums.get(albumName)!.push(song);
      } else {
        artistNode.singles.push(song);
      }
    }

    for (const cf of customFolders) {
      if (!artistMap.has(cf)) artistMap.set(cf, { albums: new Map(), singles: [] });
    }

    return Array.from(artistMap.entries()).map(([name, data]) => {
      const albums: AlbumFolder[] = Array.from(data.albums.entries()).map(([albumName, albumSongs]) => {
        const firstWithArt =
          albumSongs.find((s) => s.thumbnailUrl || s.youtubeVideoId) ?? albumSongs[0];
        return {
          name: albumName,
          songs: albumSongs,
          cover:
            getArtworkUrl(
              firstWithArt?.thumbnailUrl,
              firstWithArt?.youtubeVideoId,
              "album",
            ) || "",
        };
      });
      const firstSingle = data.singles.find((s) => s.thumbnailUrl || s.youtubeVideoId);
      const localCover =
        albums.find((a) => a.cover)?.cover ||
        getArtworkUrl(firstSingle?.thumbnailUrl, firstSingle?.youtubeVideoId, "artist") ||
        "";
      const cover = findArtistPhoto(name) || localCover;
      return { name, albums, singles: data.singles, cover };
    });
  }, [visibleSongs, customFolders, artistPhotos, artistPhotosLatin]);

  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const progressMap = useDownloadStore((s) => s.progressMap);
  const downloadJobs = Object.values(progressMap);
  const activeDownloads = downloadJobs.filter((j) => j.status === "downloading" || j.status === "pending");

  const allAlbums = useMemo(() => {
    const list: { name: string; artist: string; cover: string; songs: Song[] }[] = [];
    for (const art of artists) {
      for (const alb of art.albums) {
        list.push({ name: alb.name, artist: art.name, cover: alb.cover, songs: alb.songs });
      }
    }
    return list;
  }, [artists]);

  const audioMB = stats.sizeMB;
  const cacheMB = Number((stats.count * 0.12).toFixed(1));
  const totalMB = audioMB + cacheMB;
  const assumedMaxMB = Math.max(500, Math.ceil((totalMB + 80) / 100) * 100);
  const audioPct = Math.min(100, Math.max(4, Math.round((audioMB / assumedMaxMB) * 100)));
  const cachePct = Math.min(100 - audioPct, Math.max(2, Math.round((cacheMB / assumedMaxMB) * 100)));

  const searchResults: OfflineSearchResult<Song>[] = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchOfflineSongs(visibleSongs, cachedLyricsMap, searchQuery, filterMode);
  }, [visibleSongs, cachedLyricsMap, searchQuery, filterMode]);

  const currentArtistData = artists.find((a) => a.name === openArtist);
  const currentAlbumData = currentArtistData?.albums.find((a) => a.name === openAlbum);

  const isSearching = searchQuery.trim().length > 0;
  const isDeep = !!openAlbum || !!openArtist;

  const playList = (songs: Song[], startIndex = 0) => {
    if (!songs || songs.length === 0) {
      showToast("لا توجد أغانٍ في هذه القائمة");
      return;
    }
    const idx = Math.max(0, Math.min(startIndex, songs.length - 1));
    playSong(songs[idx], songs, idx);
  };

  const handleSeed50 = async () => {
    if (isSeeding50) return;
    setIsSeeding50(true);
    showToast("جارٍ إضافة الأغاني الخمسين الأكثر استماعًا…");
    try {
      const count = await seedCurated50SongsMobile();
      showToast(`تمت إضافة ${count} أغنية إلى مكتبة الجهاز`);
    } catch {
      showToast("حدث خطأ أثناء إضافة التشكيلة");
    } finally {
      setIsSeeding50(false);
    }
  };

  const handleUnlockVault = () => {
    if (vaultUnlocked) {
      setVaultUnlocked(false);
      showToast("تم قفل المجلد السري");
      return;
    }
    setShowVaultPrompt(true);
  };

  const submitVaultPassword = () => {
    if (vaultPassword.length >= 4) {
      setVaultUnlocked(true);
      setShowVaultPrompt(false);
      setVaultPassword("");
      showToast("تم فتح المجلد السري");
    } else {
      showToast("كلمة المرور يجب أن تكون 4 أرقام على الأقل");
    }
  };

  const artistSongs = (a: ArtistFolder) => [...a.albums.flatMap((alb) => alb.songs), ...a.singles];
  const startMove = (song: Song) => {
    setMovingSong(song);
    setTargetFolder(song.folderName || song.artist || "غير معروف");
  };

  return (
    <AuraPageTransition style={styles.root}>
      <AuraCanvas intensity="ember" />

      {toast && (
        <View style={[styles.toast, { bottom: dockClearance }]}>
          <AuraText role="caption" color={Color.gold100} align="center">
            {toast}
          </AuraText>
        </View>
      )}

      <ScrollView
        ref={mainScrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: dockClearance + Space.s5 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── HEADER ── */}
        <View style={[styles.header, { paddingTop: topInset + Space.s1 }]}>
          <View style={styles.headerTop}>
            <AuraTouch
              onPress={handleUnlockVault}
              feedback="impact"
              style={[styles.vaultPill, vaultUnlocked && styles.vaultPillActive]}
            >
              {vaultUnlocked ? (
                <Unlock size={13} color={Color.gold500} />
              ) : (
                <Lock size={13} color={Color.text_muted} />
              )}
              <AuraText role="tiny" color={vaultUnlocked ? Color.gold300 : Color.text_muted}>
                {vaultUnlocked ? "السري مفتوح" : "المجلد السري"}
              </AuraText>
            </AuraTouch>
            <AuraDotRail count={3} activeIndex={openAlbum ? 2 : openArtist ? 1 : 0} />
            <View style={styles.livePill}>
              <AuraPlayPulse playing={activeDownloads.length > 0} size={9} />
              <AuraText role="tiny" color={Color.text_secondary}>
                {activeDownloads.length > 0 ? `${activeDownloads.length} تنزيل` : "دون اتصال"}
              </AuraText>
            </View>
          </View>

          {isDeep ? (
            <AuraTouch
              onPress={() => (openAlbum ? setOpenAlbum(null) : setOpenArtist(null))}
              feedback="selection"
              style={styles.backBtn}
            >
              <ArrowRight size={15} color={Color.gold300} />
              <AuraText role="label" color={Color.gold300}>
                {openAlbum ? `رجوع إلى ${openArtist}` : "العودة إلى المكتبة"}
              </AuraText>
            </AuraTouch>
          ) : (
            <View>
              <AuraKicker>مكتبة الجهاز · تعمل دون اتصال</AuraKicker>
              <AuraText role="display">المكتبة</AuraText>
              <View style={styles.metaRow}>
                <AuraText role="caption" color={Color.text_secondary}>
                  {stats.count} أغنية
                </AuraText>
                <View style={styles.metaDot} />
                <AuraText role="numeric">{stats.sizeMB.toFixed(1)} MB</AuraText>
                <View style={styles.metaDot} />
                <AuraText role="caption" color={Color.text_secondary}>
                  {artists.length} مجلد
                </AuraText>
              </View>
            </View>
          )}

          {!isDeep && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRail}>
              <AuraChip
                label={isSeeding50 ? "جارٍ الإضافة…" : "أفضل 50 أغنية"}
                onPress={handleSeed50}
                size="sm"
                icon={<Sparkles size={13} color={Color.gold500} />}
              />
              <AuraChip
                label="مجلد جديد"
                onPress={() => {
                  setCreatedFolderName("");
                  setShowCreateFolderModal(true);
                }}
                size="sm"
                icon={<FolderPlus size={13} color={Color.text_secondary} />}
              />
              <AuraChip
                label="تحديث الفهرس"
                onPress={() => {
                  loadLibrary();
                  showToast("تم تحديث مكتبة الجهاز وفحصها");
                }}
                size="sm"
                icon={<RefreshCw size={13} color={Color.text_secondary} />}
              />
              <AuraChip
                label={favorites.length > 0 ? `المفضلة · ${favorites.length}` : "المفضلة"}
                onPress={() => router.push("/(tabs)/favorites")}
                size="sm"
                icon={<Heart size={13} color={Color.gold500} />}
              />
              <AuraChip
                label="التخزين المحلي"
                onPress={() => setShowTransferModal(true)}
                size="sm"
                icon={<Smartphone size={13} color={Color.text_secondary} />}
              />
            </ScrollView>
          )}
        </View>

        {/* ── VAULT LEDGER ── */}
        {!isDeep && !isSearching && (
          <AuraSurface tone="raised" radius={Radius.xl} hairline>
            <View style={styles.ledgerHead}>
              <View style={{ flexShrink: 1 }}>
                <AuraKicker color={Color.gold700}>سجل المكتبة</AuraKicker>
                <AuraText role="titleSm" lines={1}>
                  الذاكرة والتنزيلات
                </AuraText>
              </View>
              <AuraBadge label="دون اتصال" tone="live" />
            </View>

            <View style={styles.ledgerBar}>
              <LinearGradient
                colors={Gradient.ember}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.ledgerSeg, { width: `${audioPct}%` }]}
              />
              <View style={[styles.ledgerSeg, styles.ledgerCacheSeg, { width: `${cachePct}%` }]} />
            </View>

            <View style={styles.ledgerLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Color.gold500 }]} />
                <AuraText role="tiny">ملفات صوتية · {audioMB.toFixed(1)} MB</AuraText>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Color.gold900 }]} />
                <AuraText role="tiny">الكلمات والذاكرة المؤقتة · {cacheMB.toFixed(1)} MB</AuraText>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Color.ink4 }]} />
                <AuraText role="tiny">مساحة متاحة</AuraText>
              </View>
            </View>

            <AuraHairline intensity="soft" style={styles.ledgerDivider} />

            <View style={styles.ledgerMetrics}>
              <LedgerMetric value={stats.count} label="أغنية محفوظة" />
              <LedgerMetric value={artists.length} label="فنان / مجلد" />
              <LedgerMetric value={allAlbums.length} label="ألبوم" />
              <LedgerMetric
                value={activeDownloads.length}
                label="تنزيل نشط"
                accent={activeDownloads.length > 0}
              />
            </View>
          </AuraSurface>
        )}

        {/* ── VIEW FILTER ── */}
        {!isDeep && !isSearching && (
          <View style={styles.filterWrap}>
            <AuraSegmented
              items={[
                { id: "all", label: "الكل" },
                { id: "artists", label: "فنانون" },
                { id: "albums", label: "ألبومات" },
                { id: "folders", label: "مجلدات" },
                { id: "downloads", label: "تنزيلات" },
              ]}
              value={viewFilter}
              onChange={(id) => setViewFilter(id as ViewFilter)}
            />
            <AuraText role="tiny" color={Color.gold700}>
              {artists.length} فنان · {allAlbums.length} ألبوم · {customFolders.length} مجلد ·{" "}
              {downloadJobs.length} تنزيل
            </AuraText>
          </View>
        )}

        {/* ── OFFLINE SEARCH ── */}
        <View style={styles.searchWrap}>
          <View style={[styles.searchField, isSearchFocused && styles.searchFieldFocused]}>
            <Search size={17} color={isSearching || isSearchFocused ? Color.gold500 : Color.text_muted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder="ابحث في مكتبتك: عنوان أو فنان أو كلمة من الكلمات"
              placeholderTextColor={Color.text_muted}
              style={styles.searchInput}
              selectionColor={Color.gold500}
            />
            {isSearching && (
              <AuraTouch
                onPress={() => setSearchQuery("")}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={15} color={Color.text_secondary} />
              </AuraTouch>
            )}
          </View>

          {isSearching && (
            <View style={styles.searchFilters}>
              <View style={styles.searchChips}>
                {(
                  [
                    { id: "all", label: "الكل" },
                    { id: "meta", label: "عنوان وفنان" },
                    { id: "lyrics", label: "الكلمات" },
                  ] as const
                ).map((chip) => (
                  <AuraChip
                    key={chip.id}
                    label={chip.label}
                    active={filterMode === chip.id}
                    onPress={() => setFilterMode(chip.id)}
                    size="sm"
                  />
                ))}
              </View>
              <View style={styles.searchSummary}>
                <AuraText role="numeric" color={Color.gold300}>
                  {searchResults.length} نتيجة
                </AuraText>
                {searchResults.length > 0 && (
                  <AuraTouch
                    onPress={() => playList(searchResults.map((r) => r.item))}
                    feedback="medium"
                    style={styles.searchPlay}
                  >
                    <Play size={12} color={Color.text_onBrand} fill={Color.text_onBrand} />
                    <AuraText role="label" color={Color.text_onBrand}>
                      تشغيل
                    </AuraText>
                  </AuraTouch>
                )}
              </View>
            </View>
          )}
        </View>

        {/* ── CONTENT ── */}
        {isSearching ? (
          <View style={styles.contentWrap}>
            {searchResults.length === 0 ? (
              <EmptyState
                icon={<Search size={24} color={Color.gold700} />}
                title="لا نتائج في مكتبتك"
                body="البحث يعمل على الأغاني المحفوظة على هذا الجهاز فقط. جرّب كلمة أقصر أو اسم فنان."
              />
            ) : (
              <View style={styles.songsList}>
                {searchResults.map((res, i) => (
                  <View key={res.item.id}>
                    <SongRow
                      song={res.item}
                      index={i}
                      onPlay={() => playList(searchResults.map((r) => r.item), i)}
                      onDelete={() => deleteDownloadedSong(res.item)}
                      onToggleHide={() => toggleSongHidden(res.item.id, !res.item.isHidden)}
                      onMove={() => startMove(res.item)}
                      badge={res.matchedField === "lyrics" ? <AuraBadge label="من الكلمات" tone="gold" /> : undefined}
                    />
                    {!!res.lyricsSnippet && (
                      <View style={styles.snippetBox}>
                        <FileText size={11} color={Color.gold700} />
                        <AuraText role="caption" color={Color.text_secondary} lines={1} style={{ flex: 1 }}>
                          “{res.lyricsSnippet}”
                        </AuraText>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : artists.length === 0 && viewFilter !== "downloads" ? (
          <View style={styles.contentWrap}>
            {isSeeding50 ? (
              <AuraCreativeLoader message="جارٍ استدعاء وتجهيز أفضل 50 أغنية عربية للأوفلاين…" />
            ) : (
              <AuraSurface tone="gold" radius={Radius.xl} style={styles.emptySurface}>
                <View style={styles.emptyIcon}>
                  <DownloadCloud size={24} color={Color.gold300} />
                </View>
                <AuraKicker>مكتبتك فارغة</AuraKicker>
                <AuraText role="titleSm" align="center">
                  أضف أولى أغانيك للاستماع دون اتصال
                </AuraText>
                <AuraText role="caption" color={Color.text_secondary} align="center" style={styles.emptyBody}>
                  حمّل أي أغنية من البحث، أو أضف قائمة أفضل 50 أغنية عربية بضغطة واحدة.
                </AuraText>
                <AuraTouch onPress={handleSeed50} feedback="medium" style={styles.emptyCta}>
                  <LinearGradient colors={Gradient.signature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={absFill} />
                  <Sparkles size={15} color={Color.text_onBrand} />
                  <AuraText role="bodyStrong" color={Color.text_onBrand}>
                    إضافة أفضل 50
                  </AuraText>
                </AuraTouch>
              </AuraSurface>
            )}
          </View>
        ) : openAlbum && currentAlbumData ? (
          <View style={styles.contentWrap}>
            <View style={styles.detailHero}>
              <AuraArtwork
                uri={resolveArtworkUri(undefined, currentAlbumData.cover, undefined, "album")}
                placeholder={PLACEHOLDER_ALBUM}
                size={104}
                shape="arch"
                ring="gold"
              />
              <View style={styles.detailCopy}>
                <AuraKicker>ألبوم</AuraKicker>
                <AuraText role="title" lines={2}>
                  {currentAlbumData.name}
                </AuraText>
                <View style={styles.metaRow}>
                  <AuraText role="caption" color={Color.text_secondary}>
                    {currentAlbumData.songs.length} أغنية
                  </AuraText>
                  <View style={styles.metaDot} />
                  <AuraText role="caption" color={Color.text_secondary} lines={1}>
                    {openArtist}
                  </AuraText>
                </View>
              </View>
            </View>

            <View style={styles.detailActions}>
              <AuraTouch onPress={() => playList(currentAlbumData.songs)} feedback="medium" style={styles.primaryAction}>
                <LinearGradient colors={Gradient.signature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={absFill} />
                <Play size={14} color={Color.text_onBrand} fill={Color.text_onBrand} />
                <AuraText role="bodyStrong" color={Color.text_onBrand}>
                  تشغيل الألبوم
                </AuraText>
              </AuraTouch>
              <AuraTouch
                onPress={() => {
                  deleteAlbum(currentAlbumData.name, openArtist || undefined);
                  setOpenAlbum(null);
                  showToast("تم حذف الألبوم من الخزانة");
                }}
                feedback="impact"
                style={styles.dangerAction}
              >
                <Trash2 size={15} color={Color.state_danger} />
              </AuraTouch>
            </View>

            <AuraHairline intensity="gold" />

            <View style={styles.songsList}>
              {currentAlbumData.songs.map((song, i) => (
                <SongRow
                  key={song.id}
                  song={song}
                  index={i}
                  onPlay={() => playList(currentAlbumData.songs, i)}
                  onDelete={() => deleteDownloadedSong(song)}
                  onToggleHide={() => toggleSongHidden(song.id, !song.isHidden)}
                  onMove={() => startMove(song)}
                />
              ))}
            </View>
          </View>
        ) : openArtist && currentArtistData ? (
          <View style={styles.contentWrap}>
            <View style={styles.detailHero}>
              <AuraArtwork
                uri={resolveArtworkUri(undefined, currentArtistData.cover, undefined, "artist")}
                placeholder={PLACEHOLDER_ARTIST}
                size={104}
                shape="coin"
                ring="gold"
              />
              <View style={styles.detailCopy}>
                <AuraKicker>مجلد الفنان</AuraKicker>
                <AuraText role="title" lines={2}>
                  {currentArtistData.name}
                </AuraText>
                <View style={styles.metaRow}>
                  <AuraText role="caption" color={Color.text_secondary}>
                    {artistSongs(currentArtistData).length} أغنية
                  </AuraText>
                  <View style={styles.metaDot} />
                  <AuraText role="caption" color={Color.text_secondary}>
                    {currentArtistData.albums.length} ألبوم
                  </AuraText>
                </View>
              </View>
            </View>

            <View style={styles.detailActions}>
              <AuraTouch onPress={() => playList(artistSongs(currentArtistData))} feedback="medium" style={styles.primaryAction}>
                <LinearGradient colors={Gradient.signature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={absFill} />
                <Play size={14} color={Color.text_onBrand} fill={Color.text_onBrand} />
                <AuraText role="bodyStrong" color={Color.text_onBrand}>
                  تشغيل الكل
                </AuraText>
              </AuraTouch>
              <AuraTouch
                onPress={() => {
                  setRenamingFolder(currentArtistData.name);
                  setNewFolderName(currentArtistData.name);
                }}
                feedback="impact"
                style={styles.ghostAction}
              >
                <Edit2 size={15} color={Color.gold300} />
              </AuraTouch>
              <AuraTouch
                onPress={() => {
                  deleteArtist(currentArtistData.name);
                  setOpenArtist(null);
                  showToast("تم حذف المجلد");
                }}
                feedback="impact"
                style={styles.dangerAction}
              >
                <Trash2 size={15} color={Color.state_danger} />
              </AuraTouch>
            </View>

            {currentArtistData.albums.length > 0 && (
              <View style={styles.subSection}>
                <View style={styles.subHead}>
                  <AuraKicker>أرشيف</AuraKicker>
                  <AuraText role="titleSm">الألبومات</AuraText>
                </View>
                <View style={styles.albumGrid}>
                  {currentArtistData.albums.map((album) => (
                    <AlbumCard
                      key={album.name}
                      name={album.name}
                      sub={`${album.songs.length} أغنية`}
                      cover={album.cover}
                      width={albumColWidth}
                      onPress={() => setOpenAlbum(album.name)}
                    />
                  ))}
                </View>
              </View>
            )}

            {currentArtistData.singles.length > 0 && (
              <View style={styles.subSection}>
                <View style={styles.subHead}>
                  <AuraKicker>منفردة</AuraKicker>
                  <AuraText role="titleSm">أغانٍ منفردة</AuraText>
                </View>
                <View style={styles.songsList}>
                  {currentArtistData.singles.map((song, i) => (
                    <SongRow
                      key={song.id}
                      song={song}
                      index={i}
                      onPlay={() => playList(currentArtistData.singles, i)}
                      onDelete={() => deleteDownloadedSong(song)}
                      onToggleHide={() => toggleSongHidden(song.id, !song.isHidden)}
                      onMove={() => startMove(song)}
                    />
                  ))}
                </View>
              </View>
            )}
          </View>
        ) : viewFilter === "downloads" ? (
          <View style={styles.contentWrap}>
            {downloadJobs.length === 0 ? (
              <EmptyState
                icon={<DownloadCloud size={24} color={Color.gold700} />}
                title="لا تنزيلات بعد"
                body="كل أغنية تحمّلها من البحث تُسجَّل هنا وتُحفظ على الجهاز لتعمل دون اتصال."
              />
            ) : (
              <View style={styles.songsList}>
                {downloadJobs.map((job) => {
                  const pct = Math.round((job.progress || 0) * 100);
                  const tone: "gold" | "live" | "quiet" | "danger" =
                    job.status === "completed"
                      ? "live"
                      : job.status === "failed"
                        ? "danger"
                        : job.status === "pending"
                          ? "quiet"
                          : "gold";
                  const label =
                    job.status === "completed"
                      ? "محفوظ"
                      : job.status === "failed"
                        ? "فشل"
                        : job.status === "pending"
                          ? "انتظار"
                          : `${pct}%`;
                  return (
                    <View key={`dl-${job.songId}`} style={styles.downloadRow}>
                      <AuraArtwork
                        uri={resolveArtworkUri(undefined, job.thumbnailUrl, job.songId, "song")}
                        placeholder={PLACEHOLDER_SONG}
                        size={44}
                        shape="tile"
                      />
                      <View style={styles.downloadInfo}>
                        <AuraText role="bodyStrong" lines={1}>
                          {job.title || "مقطع صوتي"}
                        </AuraText>
                        <AuraText role="caption" color={Color.text_muted} lines={1}>
                          {job.artist || "فنان"}
                        </AuraText>
                        <View style={styles.downloadTrack}>
                          <LinearGradient
                            colors={Gradient.ember}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={[styles.downloadFill, { width: `${pct}%` }]}
                          />
                        </View>
                      </View>
                      <AuraBadge label={label} tone={tone} />
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        ) : viewFilter === "albums" || (viewFilter === "folders" && customFolders.length === 0) ? (
          <View style={styles.contentWrap}>
            {allAlbums.length === 0 ? (
              <EmptyState
                icon={<Folder size={24} color={Color.gold700} />}
                title="لا ألبومات محفوظة"
                body="الألبومات تظهر هنا تلقائياً عندما تحمّل أكثر من أغنية من الألبوم نفسه."
              />
            ) : (
              <View style={styles.albumGrid}>
                {allAlbums.map((album, idx) => (
                  <AlbumCard
                    key={`${album.name}-${idx}`}
                    name={album.name}
                    sub={`${album.artist} · ${album.songs.length} أغنية`}
                    cover={album.cover}
                    width={albumColWidth}
                    onPress={() => {
                      setOpenArtist(album.artist);
                      setOpenAlbum(album.name);
                    }}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.contentWrap}>
            <View style={styles.artistGrid}>
              {artists
                .filter((a) => viewFilter !== "folders" || customFolders.includes(a.name))
                .map((artist) => {
                  const total = artistSongs(artist).length;
                  const isEmpty = total === 0;
                  return (
                    <View key={artist.name} style={[styles.artistCell, { width: artistColWidth }]}>
                      <AuraTouch
                        onPress={() => setOpenArtist(artist.name)}
                        feedback="impact"
                        pressedScale={0.94}
                        style={styles.artistCard}
                      >
                        <AuraArtwork
                          uri={resolveArtworkUri(undefined, artist.cover, undefined, "artist", artist.name)}
                          title={artist.name}
                          artist={artist.name}
                          placeholder={PLACEHOLDER_ARTIST}
                          size={artistColWidth - Space.s3}
                          shape="coin"
                          ring="hairline"
                        />
                        <AuraText role="label" lines={1} align="center" style={styles.artistName}>
                          {artist.name}
                        </AuraText>
                        <AuraText role="tiny" color={isEmpty ? Color.gold700 : Color.text_muted} align="center">
                          {isEmpty ? "مجلد فارغ" : `${total} أغنية`}
                        </AuraText>
                      </AuraTouch>
                      {isEmpty && (
                        <AuraTouch
                          onPress={() => {
                            deleteFolder(artist.name);
                            showToast("تم حذف المجلد الفارغ");
                          }}
                          feedback="impact"
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={styles.artistDelete}
                        >
                          <X size={11} color={Color.text_secondary} />
                        </AuraTouch>
                      )}
                    </View>
                  );
                })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ── CREATE FOLDER ── */}
      <AuraModal visible={showCreateFolderModal} onClose={() => setShowCreateFolderModal(false)}>
        <ModalIcon icon={<FolderPlus size={17} color={Color.gold500} />} />
        <AuraText role="titleSm">مجلد جديد</AuraText>
        <AuraText role="caption" color={Color.text_secondary} style={styles.modalBody}>
          أدخل اسمًا للمجلد لتنظيم أغانيك، مثل: رومانسي، كلاسيكي، سهرات.
        </AuraText>
        <ModalInput
          value={createdFolderName}
          onChangeText={setCreatedFolderName}
          placeholder="اسم المجلد"
          autoFocus
        />
        <ModalButtons
          onCancel={() => setShowCreateFolderModal(false)}
          confirmLabel="إنشاء"
          onConfirm={() => {
            const clean = createdFolderName.trim();
            if (!clean) {
              showToast("أدخل اسمًا للمجلد أولًا");
              return;
            }
            if (createCustomFolder(clean)) {
              showToast(`تم إنشاء مجلد “${clean}”`);
              setShowCreateFolderModal(false);
            } else {
              showToast("هذا المجلد موجود بالفعل");
            }
          }}
        />
      </AuraModal>

      {/* ── RENAME FOLDER ── */}
      <AuraModal visible={!!renamingFolder} onClose={() => setRenamingFolder(null)}>
        <ModalIcon icon={<Edit2 size={17} color={Color.gold500} />} />
        <AuraText role="titleSm">إعادة تسمية المجلد</AuraText>
        <AuraText role="caption" color={Color.text_secondary} style={styles.modalBody} lines={1}>
          الاسم الحالي: {renamingFolder}
        </AuraText>
        <ModalInput value={newFolderName} onChangeText={setNewFolderName} placeholder="الاسم الجديد" autoFocus />
        <ModalButtons
          onCancel={() => setRenamingFolder(null)}
          confirmLabel="حفظ"
          onConfirm={async () => {
            const clean = newFolderName.trim();
            if (!clean) {
              showToast("أدخل الاسم الجديد");
              return;
            }
            if (renamingFolder) {
              await renameFolder(renamingFolder, clean);
              showToast(`تمت إعادة التسمية إلى “${clean}”`);
              if (openArtist === renamingFolder) setOpenArtist(clean);
            }
            setRenamingFolder(null);
          }}
        />
      </AuraModal>

      {/* ── SECRET VAULT ── */}
      <AuraModal visible={showVaultPrompt} onClose={() => setShowVaultPrompt(false)}>
        <ModalIcon icon={<Lock size={17} color={Color.gold500} />} />
        <AuraText role="titleSm">المجلد السري</AuraText>
        <AuraText role="caption" color={Color.text_secondary} style={styles.modalBody}>
          أدخل كلمة المرور لإظهار الأغاني المخفية.
        </AuraText>
        <ModalInput
          value={vaultPassword}
          onChangeText={setVaultPassword}
          placeholder="••••"
          secure
          numeric
          centered
          autoFocus
        />
        <ModalButtons onCancel={() => setShowVaultPrompt(false)} confirmLabel="فتح" onConfirm={submitVaultPassword} />
      </AuraModal>

      {/* ── BACKUP & TRANSFER MODAL (.aurapack) ── */}
      <LibraryBackupModal
        visible={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        songsCount={stats.count}
        totalSizeMB={stats.sizeMB}
        onSuccess={() => {
          showToast("تم تحديث مكتبتك بالأغاني الجديدة 🚀");
        }}
      />

      {/* ── MOVE SONG ── */}
      <AuraModal visible={!!movingSong} onClose={() => setMovingSong(null)}>
        <ModalIcon icon={<FolderInput size={17} color={Color.gold500} />} />
        <AuraText role="titleSm">نقل إلى مجلد</AuraText>
        <AuraText role="caption" color={Color.text_secondary} style={styles.modalBody} lines={1}>
          الأغنية: {movingSong?.title}
        </AuraText>
        <ScrollView style={styles.folderPicker} showsVerticalScrollIndicator={false}>
          {artists.map((a) => {
            const active = targetFolder === a.name;
            return (
              <AuraTouch
                key={a.name}
                onPress={() => setTargetFolder(a.name)}
                feedback="selection"
                pressedScale={1}
                style={[styles.folderOption, active && styles.folderOptionActive]}
              >
                <Folder size={14} color={active ? Color.gold500 : Color.text_muted} />
                <AuraText role="body" color={active ? Color.gold100 : Color.text_secondary} lines={1} style={{ flex: 1 }}>
                  {a.name}
                </AuraText>
                {active && <CheckCircle2 size={14} color={Color.gold500} />}
              </AuraTouch>
            );
          })}
        </ScrollView>
        <ModalButtons
          onCancel={() => setMovingSong(null)}
          confirmLabel="تأكيد النقل"
          onConfirm={async () => {
            if (movingSong && targetFolder) {
              await moveSongToFolder(movingSong.id, targetFolder);
              showToast(`تم النقل إلى “${targetFolder}”`);
            }
            setMovingSong(null);
          }}
        />
      </AuraModal>
    </AuraPageTransition>
  );
}

const LedgerMetric: React.FC<{ value: number; label: string; accent?: boolean }> = ({ value, label, accent }) => (
  <View style={styles.metric}>
    <AuraText role="displaySm" color={accent ? Color.gold500 : Color.text_primary} align="center" style={styles.metricValue}>
      {value}
    </AuraText>
    <AuraText role="tiny" color={Color.text_muted} align="center">
      {label}
    </AuraText>
  </View>
);

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; body: string }> = ({ icon, title, body }) => (
  <AuraSurface tone="base" radius={Radius.xl} style={styles.emptySurface}>
    <View style={styles.emptyIcon}>{icon}</View>
    <AuraText role="titleSm" align="center">
      {title}
    </AuraText>
    <AuraText role="caption" color={Color.text_secondary} align="center" style={styles.emptyBody}>
      {body}
    </AuraText>
  </AuraSurface>
);

const AlbumCard: React.FC<{
  name: string;
  sub: string;
  cover: string;
  width: number;
  onPress: () => void;
}> = ({ name, sub, cover, width, onPress }) => (
  <AuraTouch onPress={onPress} feedback="impact" style={{ width }}>
    <AuraArtwork
      uri={resolveArtworkUri(undefined, cover, undefined, "album")}
      placeholder={PLACEHOLDER_ALBUM}
      size={width}
      shape="arch"
      ring="hairline"
      scrim
    >
      <View style={styles.albumOverlay}>
        <AuraText role="label" lines={2}>
          {name}
        </AuraText>
        <AuraText role="tiny" color={Color.text_secondary} lines={1}>
          {sub}
        </AuraText>
      </View>
    </AuraArtwork>
  </AuraTouch>
);

function SongRow({
  song,
  index,
  onPlay,
  onDelete,
  onToggleHide,
  onMove,
  badge,
}: {
  song: Song;
  index: number;
  onPlay: () => void;
  onDelete: () => void;
  onToggleHide: () => void;
  onMove?: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <AuraTouch onPress={onPlay} feedback="impact" style={[styles.row, !!song.isHidden && styles.rowSecret]}>
      <AuraText role="numeric" color={Color.gold700} style={styles.rowIndex}>
        {index + 1}
      </AuraText>
      <AuraArtwork
        uri={resolveArtworkUri(song.localArtworkPath, song.thumbnailUrl, song.youtubeVideoId, "song", song.artist)}
        title={song.title}
        artist={song.artist}
        placeholder={PLACEHOLDER_SONG}
        size={46}
        shape="tile"
        ring="hairline"
      />
      <View style={styles.rowInfo}>
        <AuraText role="bodyStrong" lines={1}>
          {song.title}
        </AuraText>
        <View style={styles.rowMeta}>
          <AuraText role="caption" color={Color.text_muted} lines={1} style={styles.rowArtist}>
            {song.artist || "فنان"}
          </AuraText>
          {badge}
          {!!song.isHidden ? (
            <AuraBadge label="سري" tone="gold" />
          ) : (
            <View style={styles.offlineChip}>
              <CheckCircle2 size={10} color={Color.state_success} />
            </View>
          )}
        </View>
      </View>
      <View style={styles.rowActions}>
        {!!onMove && (
          <AuraTouch
            onPress={(e) => {
              e.stopPropagation?.();
              onMove();
            }}
            feedback="selection"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.rowAction}
          >
            <FolderInput size={14} color={Color.text_secondary} />
          </AuraTouch>
        )}
        <AuraTouch
          onPress={(e) => {
            e.stopPropagation?.();
            onToggleHide();
          }}
          feedback="selection"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.rowAction}
        >
          {song.isHidden ? <Eye size={14} color={Color.gold300} /> : <EyeOff size={14} color={Color.text_secondary} />}
        </AuraTouch>
        <AuraTouch
          onPress={(e) => {
            e.stopPropagation?.();
            onDelete();
          }}
          feedback="impact"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.rowAction}
        >
          <Trash2 size={14} color={Color.state_danger} />
        </AuraTouch>
      </View>
    </AuraTouch>
  );
}

const AuraModal: React.FC<{ visible: boolean; onClose: () => void; children: React.ReactNode }> = ({
  visible,
  onClose,
  children,
}) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.modalShell}>
        <AuraTouch
          onPress={onClose}
          feedback="selection"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.modalClose}
        >
          <X size={16} color={Color.text_secondary} />
        </AuraTouch>
        {children}
      </View>
    </View>
  </Modal>
);

const ModalIcon: React.FC<{ icon: React.ReactNode }> = ({ icon }) => <View style={styles.modalIcon}>{icon}</View>;

const ModalInput: React.FC<{
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  secure?: boolean;
  numeric?: boolean;
  centered?: boolean;
  autoFocus?: boolean;
}> = ({ value, onChangeText, placeholder, secure, numeric, centered, autoFocus }) => (
  <TextInput
    value={value}
    onChangeText={onChangeText}
    placeholder={placeholder}
    placeholderTextColor={Color.text_muted}
    secureTextEntry={secure}
    keyboardType={numeric ? "number-pad" : "default"}
    maxLength={numeric ? 8 : undefined}
    autoFocus={autoFocus}
    style={[styles.input, centered && styles.inputCentered]}
  />
);

const ModalButtons: React.FC<{
  onCancel?: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  hideCancel?: boolean;
}> = ({ onCancel, onConfirm, confirmLabel, hideCancel }) => (
  <View style={styles.btnRow}>
    {!hideCancel && (
      <AuraTouch onPress={onCancel} feedback="selection" style={styles.ghostBtn}>
        <AuraText role="label" color={Color.text_secondary}>
          إلغاء
        </AuraText>
      </AuraTouch>
    )}
    <AuraTouch onPress={onConfirm} feedback="medium" style={styles.goldBtn}>
      <LinearGradient colors={Gradient.signature} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={absFill} />
      <AuraText role="bodyStrong" color={Color.text_onBrand}>
        {confirmLabel}
      </AuraText>
    </AuraTouch>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.ink0 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: Space.s4,
    paddingTop: Space.s3,
    gap: Space.s5,
  },
  toast: {
    position: "absolute",
    left: Space.s5,
    right: Space.s5,
    paddingHorizontal: Space.s4,
    paddingVertical: Space.s3,
    borderRadius: Radius.md,
    backgroundColor: Color.ink3,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    zIndex: 40,
  },

  header: { gap: Space.s3 },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  vaultPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    paddingHorizontal: Space.s3,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
    backgroundColor: Color.ink1,
  },
  vaultPillActive: {
    borderColor: Color.veil_goldHairline,
    backgroundColor: Color.veil_goldTint,
  },
  livePill: { flexDirection: "row", alignItems: "center", gap: Space.s2 },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    alignSelf: "flex-start",
    paddingHorizontal: Space.s4,
    paddingVertical: Space.s3,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    backgroundColor: Color.veil_goldTint,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: Space.s2, marginTop: Space.s1 },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: Radius.pill,
    backgroundColor: Color.veil_hairlineStrong,
  },
  actionRail: { gap: Space.s2, paddingVertical: Space.s1 },

  ledgerHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: Space.s4,
    gap: Space.s3,
  },
  ledgerBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink0,
    borderWidth: 1,
    borderColor: Color.veil_hairlineSoft,
    overflow: "hidden",
    gap: 3,
  },
  ledgerSeg: { height: "100%" },
  ledgerCacheSeg: { backgroundColor: Color.gold900 },
  ledgerLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Space.s3,
    marginTop: Space.s3,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 6, height: 6, borderRadius: Radius.pill },
  ledgerDivider: { marginVertical: Space.s4 },
  ledgerMetrics: { flexDirection: "row" },
  metric: { flex: 1, gap: 2 },
  metricValue: { fontSize: 22, lineHeight: 28 },

  filterWrap: { gap: Space.s2 },

  searchWrap: { gap: Space.s3 },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    paddingHorizontal: Space.s4,
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: Color.ink1,
    borderWidth: 1,
    borderColor: Color.veil_hairline,
  },
  searchFieldFocused: {
    borderColor: Color.gold500,
    backgroundColor: Color.ink2,
    ...(Platform.OS === "web"
      ? ({
          boxShadow: "0 0 12px rgba(226,177,60, 0.2)",
        } as any)
      : null),
  },
  searchInput: {
    flex: 1,
    ...Type.body,
    color: Color.text_primary,
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
  searchFilters: { gap: Space.s2 },
  searchChips: { flexDirection: "row", flexWrap: "wrap", gap: Space.s2 },
  searchSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  searchPlay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Space.s4,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    backgroundColor: Color.gold500,
  },

  contentWrap: { gap: Space.s4 },
  songsList: { gap: Space.s2 },
  snippetBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s2,
    marginTop: 4,
    marginStart: Space.s5,
    paddingVertical: Space.s2,
    paddingStart: Space.s3,
    borderRadius: Radius.sm,
    backgroundColor: Color.veil_goldTint,
    borderRightWidth: 2,
    borderRightColor: Color.veil_goldHairline,
  },

  emptySurface: {
    alignItems: "center",
    gap: Space.s2,
    paddingVertical: Space.s6,
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
  emptyBody: { lineHeight: 21, marginTop: Space.s2, maxWidth: 300 },
  emptyCta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    alignSelf: "stretch",
    marginTop: Space.s4,
    paddingVertical: Space.s3,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },

  detailHero: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Space.s4,
  },
  detailCopy: { flex: 1, flexShrink: 1 },
  detailActions: { flexDirection: "row", alignItems: "center", gap: Space.s2 },
  primaryAction: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.s2,
    height: 48,
    borderRadius: Radius.pill,
    overflow: "hidden",
  },
  ghostAction: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    backgroundColor: Color.veil_goldTint,
  },
  dangerAction: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(224, 96, 60, 0.32)",
    backgroundColor: Color.veil_dangerGlow,
  },
  subSection: { gap: Space.s3 },
  subHead: { gap: 2 },

  artistGrid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    gap: Space.s3,
    justifyContent: "flex-start",
  },
  artistCell: {
    alignItems: "center",
    marginBottom: Space.s4,
  },
  artistCard: { alignItems: "center", gap: Space.s2, width: "100%" },
  artistName: { marginTop: Space.s1, maxWidth: "100%", fontWeight: "600" },
  artistPlay: {
    position: "absolute",
    left: -2,
    bottom: -2,
    width: 30,
    height: 30,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.gold500,
    borderWidth: 2,
    borderColor: Color.ink0,
  },
  artistDelete: {
    position: "absolute",
    top: -4,
    left: -4,
    width: 22,
    height: 22,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.ink3,
    borderWidth: 1,
    borderColor: Color.veil_hairlineStrong,
    zIndex: 10,
  },
  albumGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: Space.s4,
  },
  albumOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: Space.s3,
    gap: 2,
  },

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
  rowSecret: {
    borderColor: Color.veil_goldHairline,
    backgroundColor: Color.ink2,
  },
  rowIndex: { width: 16, textAlign: "center" },
  rowInfo: { flex: 1, flexShrink: 1, gap: 2 },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: Space.s2 },
  rowArtist: { flexShrink: 1, maxWidth: 150 },
  offlineChip: {
    width: 18,
    height: 18,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.veil_successGlow,
  },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  rowAction: { padding: 6 },

  downloadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    padding: Space.s3,
    borderRadius: Radius.md,
    backgroundColor: Color.ink1,
    borderWidth: 1,
    borderColor: Color.veil_hairlineSoft,
  },
  downloadInfo: { flex: 1, flexShrink: 1, gap: 3 },
  downloadTrack: {
    height: 4,
    borderRadius: Radius.pill,
    backgroundColor: Color.ink0,
    overflow: "hidden",
    marginTop: 3,
  },
  downloadFill: { height: "100%", borderRadius: Radius.pill },

  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.veil_scrim,
    padding: Space.s5,
  },
  modalShell: {
    width: "100%",
    maxWidth: 420,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
    backgroundColor: Color.ink2,
    padding: Space.s5,
    gap: Space.s3,
  },
  modalClose: {
    position: "absolute",
    top: Space.s4,
    right: Space.s4,
    width: 30,
    height: 30,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.veil_hairlineSoft,
    zIndex: 5,
  },
  modalIcon: {
    alignSelf: "flex-start",
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.veil_goldTintStrong,
    borderWidth: 1,
    borderColor: Color.veil_goldHairline,
  },
  modalBody: { lineHeight: 21 },
  input: {
    height: 50,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Color.veil_hairlineStrong,
    backgroundColor: Color.ink1,
    paddingHorizontal: Space.s4,
    ...Type.body,
    color: Color.text_primary,
    marginTop: Space.s2,
  },
  inputCentered: { textAlign: "center", fontSize: 17, letterSpacing: 3 },
  btnRow: { flexDirection: "row", gap: Space.s3, marginTop: Space.s3 },
  ghostBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Color.veil_hairlineStrong,
    backgroundColor: Color.ink1,
  },
  goldBtn: {
    flex: 2,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  folderPicker: { maxHeight: 190, marginVertical: Space.s2 },
  folderOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.s3,
    paddingHorizontal: Space.s3,
    paddingVertical: Space.s3,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Color.veil_hairlineSoft,
    backgroundColor: Color.ink1,
    marginBottom: Space.s2,
  },
  folderOptionActive: {
    borderColor: Color.veil_goldHairline,
    backgroundColor: Color.veil_goldTint,
  },
});
