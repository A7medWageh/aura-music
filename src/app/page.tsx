"use client";

import { usePlayer } from "@/state/playerContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Heart, TrendingUp, Star, Disc, DownloadCloud, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { getProxyUrl } from "@/utils/media";
import { downloadSong } from "@/services/offline/downloader";
import { FavoriteButton } from "@/components/FavoriteButton";
import Link from "next/link";

type ArtistEntry = { name: string; artistId: string; thumbnailUrl: string };

// ───── Artist Card ─────
function ArtistCard({ artist }: { artist: ArtistEntry }) {
  return (
    <Link href={artist.artistId ? `/artist/${artist.artistId}` : "#"} className="flex flex-col items-center gap-2 group cursor-pointer">
      <div className="w-16 h-16 md:w-24 md:h-24 rounded-full overflow-hidden border-2 border-transparent group-hover:border-cyan-400 transition-all shadow-lg ring-2 ring-white/5 group-hover:ring-cyan-400/50 group-hover:shadow-[0_0_20px_rgba(0,229,255,0.4)] shrink-0 relative">
        {artist.thumbnailUrl ? (
          <img
            src={getProxyUrl(artist.thumbnailUrl)}
            alt={artist.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            onError={(e) => { (e.target as HTMLImageElement).parentElement!.innerHTML = `<div class="w-full h-full bg-cyan-500/20 flex items-center justify-center text-2xl">🎤</div>`; }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 flex items-center justify-center text-2xl">🎤</div>
        )}
      </div>
      <span className="text-xs font-bold text-center text-gray-400 group-hover:text-white group-hover:text-shadow-[0_0_8px_rgba(0,229,255,0.8)] transition-all leading-tight px-1 line-clamp-2">{artist.name}</span>
    </Link>
  );
}

function ArtistGrid({ artists, loading, count = 10 }: { artists: ArtistEntry[]; loading: boolean; count?: number }) {
  if (loading || artists.length === 0) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-6 pt-2 snap-x hide-scrollbar px-2">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 shrink-0 snap-start">
            <div className="w-16 h-16 md:w-24 md:h-24 rounded-full bg-white/5 animate-pulse" />
            <div className="w-12 h-2.5 bg-white/5 animate-pulse rounded" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex gap-4 md:gap-6 overflow-x-auto pb-6 pt-2 snap-x hide-scrollbar px-2 -mx-2">
      {artists.map(a => (
        <div key={a.artistId || a.name} className="shrink-0 snap-start w-[72px] md:w-[100px]">
          <ArtistCard artist={a} />
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const { playNow } = usePlayer();
  const [greeting, setGreeting] = useState("مساء الخير");
  const [trending, setTrending] = useState<any[]>([]);
  const [egyptianArtists, setEgyptianArtists] = useState<ArtistEntry[]>([]);
  const [intlArtists, setIntlArtists] = useState<ArtistEntry[]>([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [artistsLoading, setArtistsLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const CARDS_PER_SLIDE = 4;
  const totalSlides = Math.max(1, Math.ceil(trending.length / CARDS_PER_SLIDE));

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleDownload = async (e: React.MouseEvent, song: any) => {
    e.stopPropagation();
    showToast(`جاري تحميل "${song.title}"...`);
    const ok = await downloadSong(song.songId, song.youtubeVideoId, { title: song.title, artist: song.artist, thumbnailUrl: song.thumbnailUrl });
    showToast(ok ? `تم حفظ "${song.title}" ✅` : `فشل التحميل ❌`);
  };

  const goNext = useCallback(() => setCurrentSlide(s => (s + 1) % totalSlides), [totalSlides]);
  const goPrev = useCallback(() => setCurrentSlide(s => (s - 1 + totalSlides) % totalSlides), [totalSlides]);

  useEffect(() => {
    if (!trending.length) return;
    autoPlayRef.current = setInterval(goNext, 4000);
    return () => { if (autoPlayRef.current) clearInterval(autoPlayRef.current); };
  }, [trending.length, goNext]);

  const manualNav = (fn: () => void) => {
    if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    fn();
    autoPlayRef.current = setInterval(goNext, 4000);
  };

  // Pre-warm stream cache on hover → instant playback
  const onSongHover = (videoId?: string) => {
    if (!videoId) return;
    fetch(`/api/stream/${videoId}`).catch(() => {});
  };

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("صباح الخير");
    else if (hour < 18) setGreeting("طاب يومك");
    else setGreeting("مساء الخير");

    // ─── ONLY 2 parallel API calls ───
    fetch("/api/discovery/trending")
      .then(r => r.json())
      .then(res => { if (res.success) setTrending(res.data.slice(0, 12)); })
      .catch(() => {})
      .finally(() => setTrendLoading(false));

    fetch("/api/artists")
      .then(r => r.json())
      .then(res => {
        setEgyptianArtists(res.egyptian || []);
        setIntlArtists(res.intl || []);
      })
      .catch(() => {})
      .finally(() => setArtistsLoading(false));
  }, []);

  const currentSongs = trending.slice(currentSlide * CARDS_PER_SLIDE, (currentSlide + 1) * CARDS_PER_SLIDE);

  return (
    <div className="space-y-12 pb-24">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-6 py-3 glass rounded-full border border-indigo-500/30 flex items-center gap-3 shadow-2xl">
            <CheckCircle2 className="w-5 h-5 text-indigo-400" />
            <span className="text-sm font-bold">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero */}
      <header>
        <h1 className="text-4xl font-extrabold mb-2">{greeting}، في Aura Music 🎧</h1>
        <p className="text-gray-400">مزيكا حقيقية 100% من مكتبة أورا السحابية</p>
      </header>

      {/* ─── Egyptian Artists ─── */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Star className="text-yellow-400 w-6 h-6" />
          <h2 className="text-2xl font-bold">أشهر فنانين مصر 🎤</h2>
        </div>
        <ArtistGrid artists={egyptianArtists} loading={artistsLoading} count={30} />
      </section>

      {/* ─── International Artists ─── */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Star className="text-blue-400 w-6 h-6" />
          <h2 className="text-2xl font-bold">نجوم عالميون 🌍</h2>
        </div>
        <ArtistGrid artists={intlArtists} loading={artistsLoading} count={20} />
      </section>

      {/* ─── Trending Slider (Horizontal scroll for native feel) ─── */}
      <section>
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-2xl font-black flex items-center gap-2 text-gradient">
            <TrendingUp className="text-cyan-400 w-6 h-6" /> الأغاني الأكثر استماعاً الآن 🔥
          </h2>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-8 pt-2 snap-x hide-scrollbar px-2 -mx-2">
          {trendLoading
            ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="w-[240px] md:w-[300px] aspect-video shrink-0 bg-white/5 animate-pulse rounded-2xl snap-start" />)
            : trending.map(item => (
                  <motion.div key={item.songId} whileHover={{ y: -5, scale: 1.02 }}
                    className="group cursor-pointer shrink-0 w-[240px] md:w-[300px] snap-start"
                    onMouseEnter={() => onSongHover(item.youtubeVideoId)}
                    onClick={() => playNow(item)}
                  >
                    <div className="relative aspect-video rounded-2xl overflow-hidden glass mb-3 border-transparent group-hover:border-cyan-400/50 group-hover:shadow-[0_0_25px_rgba(0,229,255,0.3)] transition-all">
                      <img src={getProxyUrl(item.thumbnailUrl)} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-cyan-500 flex items-center justify-center shadow-[0_0_20px_rgba(0,229,255,0.6)]">
                          <Play className="w-5 h-5 text-black fill-current ml-0.5" />
                        </div>
                      </div>
                      <div className="absolute top-2 left-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => handleDownload(e, item)} className="p-1.5 bg-black/50 backdrop-blur-sm rounded-full hover:text-cyan-400 text-white transition-colors">
                          <DownloadCloud className="w-4 h-4" />
                        </button>
                        <FavoriteButton 
                          songId={item.songId}
                          title={item.title}
                          artist={item.artist}
                          thumbnailUrl={item.thumbnailUrl}
                          youtubeVideoId={item.youtubeVideoId}
                          size={16}
                          className="p-1.5 bg-black/50 backdrop-blur-sm rounded-full"
                        />
                      </div>
                    </div>
                    <h3 className="font-bold text-sm truncate group-hover:text-indigo-400 transition-colors">{item.title}</h3>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{item.artist}</p>
                  </motion.div>
                ))}
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-1.5 mt-5">
          {Array.from({ length: totalSlides }).map((_, i) => (
            <button key={i} onClick={() => manualNav(() => setCurrentSlide(i))}
              className={`transition-all rounded-full ${i === currentSlide ? "w-6 h-1.5 bg-indigo-500" : "w-1.5 h-1.5 bg-white/20 hover:bg-white/40"}`} />
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="premium-card bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border-indigo-500/20 flex flex-col justify-between h-40 group cursor-pointer">
          <Star className="w-8 h-8 text-indigo-400 group-hover:rotate-12 transition-transform" />
          <div><h3 className="text-xl font-bold">كل مرة شكل</h3><p className="text-sm text-gray-400">بيتغير التريند كل ما تفتح الواجهة</p></div>
        </div>
        <div className="premium-card bg-gradient-to-br from-orange-500/20 to-red-600/20 border-orange-500/20 flex flex-col justify-between h-40 group cursor-pointer">
          <DownloadCloud className="text-orange-400 w-8 h-8 group-hover:scale-110 transition-transform" />
          <div><h3 className="text-xl font-bold">دعم الأوفلاين</h3><p className="text-sm text-gray-400">حمل أي أغنية واسمعها بدون نت</p></div>
        </div>
        <Link href="/library">
          <div className="premium-card bg-gradient-to-br from-teal-500/20 to-emerald-600/20 border-teal-500/20 flex flex-col justify-between h-40 group cursor-pointer">
            <Disc className="text-teal-400 w-8 h-8 group-hover:animate-spin" />
            <div><h3 className="text-xl font-bold">مكتبتي الموسيقية</h3><p className="text-sm text-gray-400">مكان واحد لكل اللي حملته</p></div>
          </div>
        </Link>
      </section>
    </div>
  );
}
