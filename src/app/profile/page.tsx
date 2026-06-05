"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Music, Headphones, TrendingUp, Clock, Star, Heart, Users, BarChart3, Disc, CheckCircle2, Crown } from "lucide-react";
import { getProxyUrl } from "@/utils/media";
import { usePlayer } from "@/state/playerContext";
import {
  getListeningHistory, getTopArtists, getTopSongs, getRecentSongs, getTotalStats,
  PlayRecord
} from "@/services/user/listeningHistory";
import Link from "next/link";

export default function ProfilePage() {
  const { playNow, enqueueSongs } = usePlayer();
  const [user, setUser] = useState<any>(null);
  const [history, setHistory] = useState<PlayRecord[]>([]);
  const [topSongs, setTopSongs] = useState<PlayRecord[]>([]);
  const [recentSongs, setRecentSongs] = useState<PlayRecord[]>([]);
  const [topArtists, setTopArtists] = useState<{ artist: string; playCount: number }[]>([]);
  const [stats, setStats] = useState({ totalSongs: 0, totalPlays: 0, uniqueArtists: 0 });
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [followedCount, setFollowedCount] = useState(0);

  useEffect(() => {
    // Load user
    fetch("/api/auth/me").then(r => r.json()).then(d => setUser(d.data?.user || null)).catch(() => {});

    // Load listening data
    setHistory(getListeningHistory());
    setTopSongs(getTopSongs(10));
    setRecentSongs(getRecentSongs(10));
    setTopArtists(getTopArtists(8));
    setStats(getTotalStats());

    // Count followed artists
    const followed = JSON.parse(localStorage.getItem("aura-followed-artists") || "[]");
    setFollowedCount(followed.length);

    // Fetch personalized recommendations based on most-listened artist
    const topArtistName = getTopArtists(1)[0]?.artist;
    if (topArtistName) {
      setRecLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(topArtistName + " أغاني")}`)
        .then(r => r.json())
        .then(d => setRecommendations(d.data?.songs?.slice(0, 10) || []))
        .catch(() => {})
        .finally(() => setRecLoading(false));
    }
  }, []);

  const playQueue = (songs: PlayRecord[], startIndex: number) => {
    const song = songs[startIndex];
    playNow({ songId: song.songId, youtubeVideoId: song.youtubeVideoId, title: song.title, artist: song.artist, thumbnailUrl: song.thumbnailUrl });
    if (startIndex < songs.length - 1) {
      enqueueSongs(songs.slice(startIndex + 1).map(s => ({
        songId: s.songId, youtubeVideoId: s.youtubeVideoId, title: s.title, artist: s.artist, thumbnailUrl: s.thumbnailUrl
      })));
    }
  };

  const isEmpty = history.length === 0;

  return (
    <div className="space-y-12 pb-24 animate-in fade-in duration-500">
      {/* ── Profile Header ── */}
      <section className="relative overflow-hidden rounded-3xl">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 via-purple-900/40 to-pink-900/30" />
        <div className="absolute inset-0 backdrop-blur-sm" />

        <div className="relative z-10 p-8 md:p-12 flex items-center gap-8">
          {/* Avatar */}
          <div className="relative shrink-0">
            <div className={`w-24 h-24 md:w-32 md:h-32 rounded-full flex items-center justify-center shadow-2xl text-4xl font-black relative z-10 ${user?.tier === 'premium' ? 'bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 shadow-[0_0_40px_rgba(234,179,8,0.6)] border-4 border-yellow-300/50' : 'bg-gradient-to-br from-indigo-500 to-purple-600'}`}>
              {user ? user.displayName?.charAt(0)?.toUpperCase() : "🎧"}
              {user?.tier === 'premium' && (
                <div className="absolute -top-3 -right-3 rotate-12">
                  <Crown className="w-10 h-10 text-yellow-300 drop-shadow-lg" />
                </div>
              )}
            </div>
            {!isEmpty && (
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-500 border-2 border-black flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-1">الحساب الشخصي</p>
            <h1 className="text-4xl md:text-5xl font-black mb-2 flex items-center gap-3">
              {user ? user.displayName : "مستمع موسيقى"}
              {user?.tier === 'premium' && (
                <span title="حساب بريميوم موثق" className="relative flex items-center justify-center w-8 h-8">
                  <CheckCircle2 className="w-8 h-8 text-blue-500 fill-white drop-shadow-md z-10" />
                  <span className="absolute inset-0 bg-blue-500 blur-md opacity-50 rounded-full" />
                </span>
              )}
            </h1>
            {user && <p className="text-gray-400 text-sm">{user.email}</p>}
            {!user && (
              <p className="text-gray-500 text-sm mt-1">
                سجّل دخولك لحفظ بياناتك على الكلاود ومزامنتها على كل أجهزتك
              </p>
            )}
          </div>

          {/* Stats Pills */}
          <div className="hidden md:flex flex-col gap-3 shrink-0">
            <div className="glass rounded-2xl px-5 py-3 text-center">
              <p className="text-2xl font-black text-indigo-400">{stats.totalPlays}</p>
              <p className="text-xs text-gray-500 mt-0.5">مرة استماع</p>
            </div>
            <div className="glass rounded-2xl px-5 py-3 text-center">
              <p className="text-2xl font-black text-pink-400">{followedCount}</p>
              <p className="text-xs text-gray-500 mt-0.5">فنان متابَع</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats Row ── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <Music className="w-5 h-5" />, label: "أغاني", value: stats.totalSongs, color: "text-indigo-400" },
          { icon: <Headphones className="w-5 h-5" />, label: "تشغيلة", value: stats.totalPlays, color: "text-purple-400" },
          { icon: <Disc className="w-5 h-5" />, label: "فنان مختلف", value: stats.uniqueArtists, color: "text-pink-400" },
          { icon: <Users className="w-5 h-5" />, label: "متابَع", value: followedCount, color: "text-emerald-400" },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
            className="glass rounded-2xl p-5 flex items-center gap-4">
            <div className={`${s.color} opacity-80`}>{s.icon}</div>
            <div>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          </motion.div>
        ))}
      </section>

      {isEmpty ? (
        /* ── Empty State ── */
        <div className="glass rounded-3xl p-16 text-center space-y-4">
          <Headphones className="w-16 h-16 mx-auto text-indigo-400 opacity-50" />
          <h2 className="text-2xl font-bold">ما فيش سجل استماع لسه</h2>
          <p className="text-gray-500 max-w-sm mx-auto">ابدأ بالاستماع لأي أغنية وهيبدأ يسجل نشاطك هنا ويرشح ليك أغاني على حسب ذوقك</p>
          <Link href="/" className="inline-block mt-4 px-6 py-3 rounded-full bg-indigo-500 text-white font-bold hover:bg-indigo-400 transition-colors">
            اكتشف موسيقى الآن
          </Link>
        </div>
      ) : (
        <>
          {/* ── Personalized Recommendations ── */}
          {topArtists[0] && (
            <section>
              <div className="flex items-center gap-3 mb-6">
                <Star className="text-yellow-400 w-6 h-6" />
                <h2 className="text-2xl font-bold">
                  مقترح ليك بناءً على {topArtists[0]?.artist} ⚡
                </h2>
              </div>
              {recLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[...Array(5)].map((_, i) => <div key={i} className="aspect-video bg-white/5 animate-pulse rounded-xl" />)}
                </div>
              ) : recommendations.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {recommendations.map((song: any, i) => (
                    <motion.div key={`${song.songId}-${i}`} whileHover={{ y: -4 }}
                      onClick={() => playNow(song)}
                      className="group cursor-pointer">
                      <div className="aspect-video rounded-xl overflow-hidden bg-white/5 mb-2 relative">
                        <img src={getProxyUrl(song.thumbnailUrl)} alt={song.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center">
                            <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                          </div>
                        </div>
                      </div>
                      <p className="text-xs font-bold truncate group-hover:text-indigo-400 transition-colors">{song.title}</p>
                      <p className="text-[10px] text-gray-500 truncate">{song.artist}</p>
                    </motion.div>
                  ))}
                </div>
              ) : null}
            </section>
          )}

          {/* ── Top Artists (Most Played) ── */}
          {topArtists.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-6">
                <BarChart3 className="text-purple-400 w-6 h-6" />
                <h2 className="text-2xl font-bold">الفنانين الأكثر استماعاً</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {topArtists.map((a, i) => (
                  <div key={a.artist} className="glass rounded-2xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/30 to-purple-600/30 flex items-center justify-center text-lg font-black text-indigo-400 shrink-0">
                      {i + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm truncate">{a.artist}</p>
                      <p className="text-xs text-gray-500">{a.playCount} تشغيلة</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Most Played Songs ── */}
          {topSongs.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-6">
                <TrendingUp className="text-pink-400 w-6 h-6" />
                <h2 className="text-2xl font-bold">أكثر الأغاني تشغيلاً</h2>
              </div>
              <div className="space-y-1">
                {topSongs.map((song, i) => (
                  <div key={`${song.songId}-${i}`} onClick={() => playQueue(topSongs, i)}
                    className="group flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 cursor-pointer transition-all">
                    <span className="w-6 text-center text-sm text-gray-500 group-hover:hidden">{i + 1}</span>
                    <Play className="w-4 h-4 fill-current hidden group-hover:block shrink-0" />
                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0">
                      <img src={getProxyUrl(song.thumbnailUrl || "")} alt={song.title}
                        className="w-full h-full object-cover"
                        onError={e => { (e.target as HTMLImageElement).src = "/placeholder-song.jpg"; }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate group-hover:text-indigo-400 transition-colors">{song.title}</p>
                      <p className="text-xs text-gray-500 truncate">{song.artist}</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Heart className="w-3 h-3" />
                      <span>{song.playCount}×</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Recently Played ── */}
          {recentSongs.length > 0 && (
            <section>
              <div className="flex items-center gap-3 mb-6">
                <Clock className="text-indigo-400 w-6 h-6" />
                <h2 className="text-2xl font-bold">آخر ما استمعت إليه</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {recentSongs.slice(0, 10).map((song) => (
                  <motion.div key={`${song.songId}-recent`} whileHover={{ y: -4 }}
                    onClick={() => playNow({ songId: song.songId, youtubeVideoId: song.youtubeVideoId, title: song.title, artist: song.artist, thumbnailUrl: song.thumbnailUrl })}
                    className="group cursor-pointer">
                    <div className="aspect-square rounded-xl overflow-hidden bg-white/5 mb-2 relative">
                      <img src={getProxyUrl(song.thumbnailUrl || "")} alt={song.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        onError={e => { (e.target as HTMLImageElement).src = "/placeholder-song.jpg"; }} />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center shadow-xl">
                          <Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" />
                        </div>
                      </div>
                    </div>
                    <p className="text-xs font-bold truncate group-hover:text-indigo-400 transition-colors">{song.title}</p>
                    <p className="text-[10px] text-gray-500 truncate">{song.artist}</p>
                  </motion.div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
