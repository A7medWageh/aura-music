"use client";

import { usePlayer } from "@/state/playerContext";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Heart, TrendingUp, Star, Disc, DownloadCloud, CheckCircle2, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { getProxyUrl } from "@/utils/media";
import { downloadSong } from "@/services/offline/downloader";
import { FavoriteButton } from "@/components/FavoriteButton";
import { PremiumModal } from "@/components/PremiumModal";
import Link from "next/link";

type ArtistEntry = { name: string; artistId: string; thumbnailUrl: string };

// ───── Artist Card ─────
function ArtistCard({ artist }: { artist: ArtistEntry }) {
  return (
    <Link href={artist.artistId ? `/artist/${artist.artistId}` : "#"} className="flex flex-col items-center gap-2 group cursor-pointer">
      <div className="w-16 h-16 md:w-24 md:h-24 rounded-full overflow-hidden border-2 border-transparent group-hover:border-indigo-500 transition-all shadow-lg ring-2 ring-white/5 group-hover:ring-indigo-500/50 group-hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] shrink-0 relative">
        {artist.thumbnailUrl ? (
          <img
            src={getProxyUrl(artist.thumbnailUrl)}
            alt={artist.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            onError={(e) => { (e.target as HTMLImageElement).parentElement!.innerHTML = `<div class="w-full h-full bg-gradient-to-br from-indigo-500/20 to-purple-600/20 flex items-center justify-center text-3xl">🎤</div>`; }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-500/30 to-purple-600/30 flex items-center justify-center text-3xl">🎤</div>
        )}
      </div>
      <span className="text-xs font-bold text-center text-gray-400 group-hover:text-white group-hover:text-shadow-[0_0_10px_rgba(99,102,241,0.8)] transition-all leading-tight px-1 line-clamp-2">{artist.name}</span>
    </Link>
  );
}

function ArtistGrid({ artists, loading, count = 10 }: { artists: ArtistEntry[]; loading: boolean; count?: number }) {
  if (loading || artists.length === 0) {
    return (
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-x-4 gap-y-6">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/5 animate-pulse" />
            <div className="w-12 h-2.5 bg-white/5 animate-pulse rounded" />
          </div>
        ))}
      </div>
    );
  }
  // Deduplicate artists by artistId or name
  const seen = new Set<string>();
  const uniqueArtists = artists.filter(a => {
    const id = a.artistId || a.name;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-x-4 gap-y-6">
      {uniqueArtists.slice(0, count).map((a, idx) => (
        <ArtistCard key={`${a.artistId || a.name}-${idx}`} artist={a} />
      ))}
    </div>
  );
}

import { getClientCached, setClientCached } from "@/utils/clientCache";

export default function HomePage() {
  const { playNow } = usePlayer();
  const [greeting, setGreeting] = useState("مساء الخير");
  
  // Instantaneous state initialization from memory/session cache (0ms delay)
  const cachedTrending = getClientCached<any[]>("home_trending");
  const cachedArtists = getClientCached<{ egyptian: ArtistEntry[]; intl: ArtistEntry[] }>("home_artists");

  const [trending, setTrending] = useState<any[]>(() => cachedTrending || []);
  const [egyptianArtists, setEgyptianArtists] = useState<ArtistEntry[]>(() => cachedArtists?.egyptian || []);
  const [intlArtists, setIntlArtists] = useState<ArtistEntry[]>(() => cachedArtists?.intl || []);
  const [trendLoading, setTrendLoading] = useState(() => !cachedTrending || cachedTrending.length === 0);
  const [artistsLoading, setArtistsLoading] = useState(() => !cachedArtists || cachedArtists.egyptian.length === 0);
  const [toast, setToast] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumFeatureName, setPremiumFeatureName] = useState("");

  const CARDS_PER_SLIDE = 4;
  const totalSlides = Math.max(1, Math.ceil(trending.length / CARDS_PER_SLIDE));

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleDownload = async (e: React.MouseEvent, song: any) => {
    e.stopPropagation();
    if (!isPremium) {
      setPremiumFeatureName("تحميل الأغاني بدون إنترنت");
      setShowPremiumModal(true);
      return;
    }
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

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("صباح الخير");
    else if (hour < 18) setGreeting("طاب يومك");
    else setGreeting("مساء الخير");

    // Fetch and cache in background (Stale While Revalidate)
    fetch("/api/discovery/trending")
      .then(r => r.json())
      .then(res => {
        if (res.success && res.data) {
          const topSongs = res.data.slice(0, 12);
          setTrending(topSongs);
          setClientCached("home_trending", topSongs);
        }
      })
      .catch(() => {})
      .finally(() => setTrendLoading(false));

    fetch("/api/artists")
      .then(r => r.json())
      .then(res => {
        const eg = res.egyptian || [];
        const intl = res.intl || [];
        setEgyptianArtists(eg);
        setIntlArtists(intl);
        setClientCached("home_artists", { egyptian: eg, intl });
      })
      .catch(() => {})
      .finally(() => setArtistsLoading(false));

    setIsPremium(localStorage.getItem("aura_user_tier") === "premium");
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

      <PremiumModal 
        isOpen={showPremiumModal} 
        onClose={() => setShowPremiumModal(false)} 
        featureName={premiumFeatureName} 
      />

      {/* Hero */}
      <header>
        <h1 className="text-4xl font-extrabold mb-2">{greeting}، في Aura Music 🎧</h1>
        <p className="text-gray-400">مزيكا حقيقية 100% من مكتبة أورا السحابية</p>
      </header>

      {/* ─── Egyptian Artists ─── */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Star className="text-amber-400 w-6 h-6 drop-shadow-md" />
          <h2 className="text-2xl font-black">أشهر فنانين مصر 🎤</h2>
        </div>
        <ArtistGrid artists={egyptianArtists} loading={artistsLoading} count={50} />
      </section>

      {/* ─── International Artists ─── */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Star className="text-indigo-400 w-6 h-6 drop-shadow-md" />
          <h2 className="text-2xl font-black">نجوم عالميون 🌍</h2>
        </div>
        <ArtistGrid artists={intlArtists} loading={artistsLoading} count={50} />
      </section>

      {/* ─── Trending Slider ─── */}
      <section>
        <div className="flex items-center justify-between mb-4 px-2">
          <h2 className="text-2xl font-black flex items-center gap-2 bg-gradient-to-l from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            <TrendingUp className="text-indigo-400 w-6 h-6" /> الأغاني الأكثر استماعاً الآن 🔥
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={() => manualNav(goPrev)} className="w-9 h-9 rounded-full glass border border-white/10 flex items-center justify-center hover:border-indigo-400 hover:bg-indigo-400/20 transition-all">
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="text-xs text-gray-500 font-bold tabular-nums min-w-[40px] text-center">{currentSlide + 1}/{totalSlides}</span>
            <button onClick={() => manualNav(goNext)} className="w-9 h-9 rounded-full glass border border-white/10 flex items-center justify-center hover:border-indigo-400 hover:bg-indigo-400/20 transition-all">
              <ChevronLeft className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-hidden pb-4">
          <AnimatePresence mode="wait">
            <motion.div key={currentSlide} initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.3, ease: "easeOut" }} className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {trendLoading
                ? Array.from({ length: CARDS_PER_SLIDE }).map((_, i) => <div key={i} className="aspect-video bg-white/5 animate-pulse rounded-2xl" />)
                : currentSongs.map(item => (
                  <motion.div key={item.songId} whileHover={{ y: -5, scale: 1.02 }}
                    className="group cursor-pointer"
                    onClick={() => playNow(item)}
                  >
                    <div className="relative aspect-video rounded-2xl overflow-hidden glass mb-3 border border-transparent group-hover:border-indigo-500 group-hover:shadow-[0_0_25px_rgba(99,102,241,0.3)] transition-all">
                      <img src={getProxyUrl(item.thumbnailUrl)} alt={item.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.6)]">
                          <Play className="w-5 h-5 text-black fill-current ml-0.5" />
                        </div>
                      </div>
                      <div className="absolute top-2 left-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => handleDownload(e, item)} className="relative p-1.5 bg-black/50 backdrop-blur-sm rounded-full hover:text-indigo-400 text-white transition-colors">
                          {!isPremium && <Crown className="absolute -top-1.5 -right-1.5 w-3 h-3 text-amber-500 drop-shadow-md" />}
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
                    <div className="px-1">
                      <h3 className="font-bold text-sm truncate group-hover:text-indigo-400 transition-colors">{item.title}</h3>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{item.artist}</p>
                    </div>
                  </motion.div>
                ))}
            </motion.div>
          </AnimatePresence>
        </div>
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
        <div onClick={() => {
            if (!isPremium) {
               setPremiumFeatureName("تحميل الأغاني بدون إنترنت");
               setShowPremiumModal(true);
            } else {
               window.location.href = "/library";
            }
        }} className="relative premium-card bg-gradient-to-br from-orange-500/20 to-red-600/20 border-orange-500/20 flex flex-col justify-between h-40 group cursor-pointer">
          {!isPremium && <div className="absolute top-2 left-2 px-2 py-0.5 bg-amber-500/20 text-amber-500 text-[10px] font-black rounded flex items-center gap-1 border border-amber-500/30"><Crown className="w-3 h-3"/> PREMIUM</div>}
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
