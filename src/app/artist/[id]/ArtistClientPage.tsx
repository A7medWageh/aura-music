"use client";

import { useEffect, useState } from "react";
import {
  Play, MoreHorizontal, BadgeCheck, Music,
  Disc, Users, Share2, BellOff, DownloadCloud, Shuffle, Crown
} from "lucide-react";
import Link from "next/link";
import { getProxyUrl } from "@/utils/media";
import { usePlayer } from "@/state/playerContext";
import { motion, AnimatePresence } from "framer-motion";
import { downloadSong } from "@/services/offline/downloader";
import { trackPlay } from "@/services/user/listeningHistory";
import { FavoriteButton } from "@/components/FavoriteButton";
import { PremiumModal } from "@/components/PremiumModal";

export default function ArtistClientPage({ id }: { id: string }) {
  const { playNow, enqueueSongs } = usePlayer();
  const [artist, setArtist] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>("default");
  const [isPremium, setIsPremium] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumFeatureName, setPremiumFeatureName] = useState("");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    const followed = JSON.parse(localStorage.getItem("aura-followed-artists") || "[]");
    setIsFollowing(followed.includes(id));
    if ("Notification" in window) setNotifPermission(Notification.permission);

    fetch(`/api/artist/${id}`)
      .then(r => r.json())
      .then(data => { if (data.error) setError(true); else setArtist(data); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));

    setIsPremium(localStorage.getItem("aura_user_tier") === "premium");
  }, [id]);

  const toggleFollow = async () => {
    const followed: string[] = JSON.parse(localStorage.getItem("aura-followed-artists") || "[]");
    const nowFollowing = !isFollowing;
    const updated = nowFollowing ? [...followed, id] : followed.filter(x => x !== id);
    localStorage.setItem("aura-followed-artists", JSON.stringify(updated));
    setIsFollowing(nowFollowing);
    showToast(nowFollowing ? `أنت تتابع ${artist?.artistName} 🎤` : `تم إلغاء المتابعة`);

    if (nowFollowing) {
      // Auto-request notification permission on follow
      await tryRequestNotification();
    }
  };

  const tryRequestNotification = async () => {
    if (!("Notification" in window)) {
      showToast("متصفحك لا يدعم الإشعارات");
      return;
    }
    if (Notification.permission === "granted") {
      setNotifPermission("granted");
      return;
    }
    if (Notification.permission === "denied") {
      showToast("🔕 الإشعارات محجوبة — فعّلها من إعدادات المتصفح");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotifPermission(perm);
      if (perm === "granted") showToast("🔔 تم تفعيل الإشعارات!");
      else if (perm === "denied") showToast("تم رفض الإشعارات من الإعدادات");
    } catch {
      showToast("تعذّر طلب إذن الإشعارات");
    }
  };

  const requestNotif = () => tryRequestNotification();

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: artist?.artistName, url });
    } else {
      await navigator.clipboard.writeText(url);
      showToast("تم نسخ الرابط 🔗");
    }
  };

  const allSongs = artist?.songs || [];
  const allAlbums = [...(artist?.newReleases || []), ...(artist?.oldAlbums || [])];

  const playSong = (song: any, rest: any[]) => {
    playNow(song);
    trackPlay(song);
    if (rest.length) enqueueSongs(rest);
  };

  const playAll = (shuffle = false) => {
    const songs = [...allSongs];
    if (shuffle) songs.sort(() => Math.random() - 0.5);
    if (songs.length) playSong(songs[0], songs.slice(1));
    else showToast("اختر ألبوماً للتشغيل");
  };

  if (loading) return (
    <div className="animate-pulse space-y-8 pb-20">
      <div className="h-[55vh] bg-white/5 rounded-3xl" />
      <div className="space-y-3 px-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl" />)}
      </div>
    </div>
  );

  if (error || !artist) return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-gray-500">
      <Music className="w-16 h-16 mb-4 opacity-20" />
      <p className="text-xl font-bold">الفنان غير موجود</p>
    </div>
  );

  return (
    <div className="animate-in fade-in duration-500 pb-32">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-28 right-8 z-50 px-5 py-3 glass rounded-full border border-indigo-500/30 flex items-center gap-2 shadow-xl text-sm font-bold whitespace-nowrap">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <PremiumModal 
        isOpen={showPremiumModal} 
        onClose={() => setShowPremiumModal(false)} 
        featureName={premiumFeatureName} 
      />

      {/* ═══ HERO ═══════════════════════════════ */}
      <section className="relative h-[60vh] -mx-8 -mt-8 flex items-end overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={artist.artistImage ? getProxyUrl(artist.artistImage) : "/placeholder-artist.jpg"}
            alt={artist.artistName}
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
        </div>

        <div className="relative z-10 w-full px-8 pb-8 flex items-end gap-8">
          {/* ── Circular Artist Photo (simple, no ring) ── */}
          <div className="shrink-0">
            <div className="w-32 h-32 md:w-44 md:h-44 rounded-full overflow-hidden border-4 border-black/50 shadow-2xl">
              <img src={artist.artistImage ? getProxyUrl(artist.artistImage) : "/placeholder-artist.jpg"}
                alt={artist.artistName} className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Artist Name + Spinning Verified Badge */}
          <div className="pb-2 space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white drop-shadow-2xl">
                {artist.artistName}
              </h1>
              {/* Verified badge — spinning serrated seal + static checkmark */}
              {artist.isVerified && (
                <div className="relative w-12 h-12 shrink-0" title="فنان موثق">
                  {/* ── Spinning outer seal (20 teeth) ── */}
                  <svg
                    className="absolute inset-0 w-full h-full animate-spin"
                    style={{ animationDuration: "8s", animationTimingFunction: "linear" }}
                    viewBox="0 0 100 100"
                  >
                    <polygon
                      fill="#1d9bf0"
                      points="
                        50,4    55.9,12.5  64.2,6.2   67.3,16.1
                        77,12.8  76.9,23.1  87.2,22.9  83.9,32.7
                        93.8,35.8 87.5,44.1 96,50      87.5,55.9
                        93.8,64.2 83.9,67.3 87.2,77.1  76.9,76.9
                        77,87.2  67.3,83.9  64.2,93.8  55.9,87.5
                        50,96   44.1,87.5  35.8,93.8  32.7,83.9
                        23,87.2  23.1,76.9  12.8,77   16.1,67.3
                        6.2,64.2 12.5,55.9  4,50      12.5,44.1
                        6.2,35.8 16.1,32.7  12.8,22.9 23.1,23.1
                        23,12.8  32.7,16.1  35.8,6.2  44.1,12.5
                      "
                    />
                  </svg>
                  {/* ── Static white checkmark on top ── */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
                    <polyline
                      points="30,52 44,66 70,32"
                      fill="none"
                      stroke="white"
                      strokeWidth="10"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </div>
            <p className="text-white/50 font-medium">
              {artist.subscribers ? `${artist.subscribers} مشترك` : "فنان موسيقى"}
            </p>
          </div>
        </div>
      </section>

      {/* ═══ ACTION BAR ══════════════════════════ */}
      <div className="sticky top-0 z-20 glass-dark border-b border-white/5 px-8 py-4 -mx-8 backdrop-blur-xl">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => playAll(false)}
            className="w-13 h-13 w-[52px] h-[52px] rounded-full bg-indigo-500 hover:bg-indigo-400 flex items-center justify-center transition-all hover:scale-105 active:scale-95 shadow-xl shadow-indigo-500/30">
            <Play className="w-5 h-5 text-white fill-current ml-0.5" />
          </button>
          <button onClick={() => playAll(true)}
            className="w-10 h-10 rounded-full border border-white/15 hover:border-indigo-500/60 hover:bg-indigo-500/10 flex items-center justify-center transition-all"
            title="تشغيل عشوائي">
            <Shuffle className="w-4 h-4 text-gray-300" />
          </button>

          {/* Follow button */}
          <motion.button onClick={toggleFollow} whileTap={{ scale: 0.93 }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all ${
              isFollowing
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                : "border border-white/20 text-gray-300 hover:border-white/40 hover:bg-white/5"
            }`}>
            {isFollowing
              ? <><BellOff className="w-4 h-4" /> متابَع ✓</>
              : <><Users className="w-4 h-4" /> متابعة</>}
          </motion.button>

          {/* Enable notifications (only when following + notifications not yet granted) */}
          {isFollowing && notifPermission !== "granted" && (
            <motion.button initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              onClick={requestNotif}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 text-xs font-bold transition-all">
              🔔 فعّل الإشعارات
            </motion.button>
          )}

          <div className="mr-auto flex items-center gap-2">
            <button onClick={handleShare}
              className="p-2.5 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
              title="مشاركة">
              <Share2 className="w-5 h-5" />
            </button>
            <button className="p-2.5 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-12 space-y-20">

        {/* ═══ LATEST RELEASES (first) ════════════ */}
        {artist.newReleases?.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-3xl font-black">أحدث الإصدارات</h2>
              <span className="text-xs text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full">
                {artist.newReleases.length} إصدار
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {artist.newReleases.map((alb: any) => <AlbumCard key={alb.albumId} album={alb} />)}
            </div>
          </section>
        )}

        {/* ═══ POPULAR SONGS (second) ═════════════ */}
        <section>
          <h2 className="text-3xl font-black mb-6">أشهر الأغاني</h2>
          {allSongs.length === 0 ? (
            <div className="glass rounded-2xl py-12 text-center text-gray-500 space-y-2">
              <Music className="w-10 h-10 mx-auto opacity-20" />
              <p className="text-sm">لا توجد أغاني ظاهرة للفنان حالياً</p>
              {allAlbums.length > 0 && (
                <p className="text-xs text-gray-600">جرّب فتح أحد الألبومات للاستماع</p>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {allSongs.map((song: any, i: number) => (
                <SongRow key={song.songId || i} song={song} index={i} isPremium={isPremium}
                  onPlay={() => playSong(song, allSongs.slice(i + 1))}
                  onDownload={() => {
                    if (!isPremium) {
                      setPremiumFeatureName("تحميل الأغاني بدون إنترنت");
                      setShowPremiumModal(true);
                      return;
                    }
                    showToast(`جاري تحميل "${song.title}"...`);
                    downloadSong(song.songId, song.youtubeVideoId, {
                      title: song.title, artist: song.artist, thumbnailUrl: song.thumbnailUrl
                    }).then(ok => showToast(ok ? "تم الحفظ ✅" : "فشل التحميل ❌"));
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* ═══ ALL ALBUMS ═════════════════════════ */}
        {artist.oldAlbums?.length > 0 && (
          <section>
            <h2 className="text-3xl font-black mb-6">ألبومات أخرى</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
              {artist.oldAlbums.map((alb: any) => <AlbumCard key={alb.albumId} album={alb} />)}
            </div>
          </section>
        )}

        {/* ═══ ABOUT ══════════════════════════════ */}
        <section className="relative overflow-hidden rounded-3xl">
          <div className="absolute inset-0">
            <img src={getProxyUrl(artist.artistImage)} alt=""
              className="w-full h-full object-cover blur-3xl opacity-20 scale-110" />
            <div className="absolute inset-0 bg-black/60" />
          </div>
          <div className="relative z-10 p-8 md:p-12">
            <h2 className="text-3xl font-black mb-4 flex items-center gap-3">
              <Disc className="w-7 h-7 text-indigo-400" /> عن الفنان
            </h2>
            <p className="text-gray-300 leading-loose text-base mb-8 max-w-3xl">
              {artist.description ||
                `${artist.artistName} فنان استثنائي ترك بصمة واضحة في عالم الموسيقى. يتميز بأسلوبه الفريد وقدرته على إيصال المشاعر من خلال ألحانه وكلماته، ويحتل مكانة متميزة في قلوب ملايين المستمعين حول العالم.`}
            </p>
            <div className="flex flex-wrap gap-10">
              {artist.subscribers && (
                <div>
                  <p className="text-3xl font-black text-indigo-400">{artist.subscribers}</p>
                  <p className="text-sm text-gray-500 mt-1">مشترك</p>
                </div>
              )}
              <div>
                <p className="text-3xl font-black text-pink-400">{allAlbums.length}+</p>
                <p className="text-sm text-gray-500 mt-1">ألبوم</p>
              </div>
              <div>
                <p className="text-3xl font-black text-emerald-400">{allSongs.length || "∞"}</p>
                <p className="text-sm text-gray-500 mt-1">أغنية</p>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

function SongRow({ song, index, onPlay, onDownload, isPremium }: {
  song: any; index: number; onPlay: () => void; onDownload: () => void; isPremium: boolean;
}) {
  return (
    <div className="group flex items-center gap-4 px-4 py-3 rounded-2xl hover:bg-white/5 cursor-pointer transition-all" onClick={onPlay}>
      <div className="w-7 text-center shrink-0">
        <span className="text-sm text-gray-500 group-hover:hidden block">{index + 1}</span>
        <Play className="w-4 h-4 text-white fill-current hidden group-hover:block mx-auto" />
      </div>
      <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0">
        <img src={getProxyUrl(song.thumbnailUrl)} alt={song.title}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          onError={e => { (e.target as HTMLImageElement).src = "/placeholder-song.jpg"; }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm truncate group-hover:text-indigo-400 transition-colors">{song.title}</p>
        <p className="text-xs text-gray-500 truncate mt-0.5">{song.views || song.artist || ""}</p>
      </div>
      <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <FavoriteButton 
          songId={song.songId}
          title={song.title}
          artist={song.artist}
          thumbnailUrl={song.thumbnailUrl}
          youtubeVideoId={song.youtubeVideoId}
          size={18}
        />
        <button onClick={e => { e.stopPropagation(); onDownload(); }}
          className="relative p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-indigo-400 transition-colors">
          {!isPremium && <Crown className="absolute -top-1 -right-1 w-3 h-3 text-amber-500 drop-shadow-md" />}
          <DownloadCloud className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function AlbumCard({ album }: { album: any }) {
  return (
    <Link href={`/album/${album.albumId}`} className="group block">
      <div className="aspect-square rounded-2xl overflow-hidden bg-white/5 mb-3 relative shadow-lg">
        <img src={album.thumbnailUrl ? getProxyUrl(album.thumbnailUrl) : "/placeholder-album.jpg"}
          alt={album.title}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-3">
          <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center shadow-xl translate-y-2 group-hover:translate-y-0 transition-transform">
            <Play className="w-4 h-4 text-white fill-current ml-0.5" />
          </div>
        </div>
      </div>
      <h4 className="font-bold text-sm truncate group-hover:text-indigo-400 transition-colors">{album.title}</h4>
      <p className="text-xs text-gray-500 mt-0.5">{album.year || "ألبوم"}</p>
    </Link>
  );
}
