"use client";

import { KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import { usePlayer } from "@/state/playerContext";
import { getProxyUrl } from "@/utils/media";
import { Search, X, Clock, Play, Music, Mic2, Disc, TrendingUp, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";

const RECENT_KEY = "aura-recent-searches";

function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch { return []; }
}
function pushRecent(q: string) {
  if (!q.trim()) return;
  const list = [q, ...getRecent().filter(x => x !== q)].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}
function clearRecent() { localStorage.removeItem(RECENT_KEY); }

// ─────────────────────────────────────────────
export function SmartSearchBar() {
  const router = useRouter();
  const { playNow, enqueueSongs } = usePlayer();
  const [term, setTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [songs, setSongs] = useState<any[]>([]);
  const [artists, setArtists] = useState<any[]>([]);
  const [albums, setAlbums] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce — 180 ms feels instant
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTerm(term), 180);
    return () => clearTimeout(t);
  }, [term]);

  // Fetch
  useEffect(() => {
    if (!debouncedTerm.trim()) { setSongs([]); setArtists([]); setAlbums([]); return; }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(debouncedTerm)}`)
      .then(r => r.json())
      .then(d => {
        if (!cancelled) {
          setSongs(d.data?.songs?.slice(0, 10) || []);
          setArtists(d.data?.artists?.slice(0, 5) || []);
          setAlbums(d.data?.albums?.slice(0, 4) || []);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedTerm]);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Ctrl+K shortcut
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen(true);
        setRecent(getRecent());
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const openSearch = () => { setIsOpen(true); setRecent(getRecent()); };

  const playSong = (song: any) => {
    playNow(song);
    pushRecent(term);
    setIsOpen(false);
  };

  const goSearch = (q = term) => {
    if (!q.trim()) return;
    pushRecent(q);
    setIsOpen(false);
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); if (songs[activeIdx]) playSong(songs[activeIdx]); else goSearch(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(p => Math.min(p + 1, songs.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(p => Math.max(p - 1, -1)); return; }
    if (e.key === "Escape") { setIsOpen(false); e.currentTarget.blur(); }
  };

  const showPanel = isOpen;
  const hasResults = songs.length > 0 || artists.length > 0 || albums.length > 0;

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* ── Input ── */}
      <div
        className={`flex items-center gap-3 px-4 py-2.5 rounded-full transition-all ${
          isOpen
            ? "border border-indigo-500/60 shadow-lg shadow-indigo-500/10"
            : "border border-white/10 hover:border-white/25"
        }`}
        style={{
          background: isOpen ? "rgba(18,20,32,0.98)" : "rgba(18,20,30,0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {loading
          ? <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
          : <Search className="w-4 h-4 text-gray-400 shrink-0" />
        }
        <input
          ref={inputRef}
          value={term}
          onChange={e => { setTerm(e.target.value); setActiveIdx(-1); }}
          onFocus={openSearch}
          onKeyDown={onKeyDown}
          placeholder="دوّر على أغاني، فنانين، ألبومات..."
          className="flex-1 bg-transparent text-sm outline-none placeholder-gray-500 text-white"
        />
        {term && (
          <button onClick={() => { setTerm(""); setSongs([]); setArtists([]); setAlbums([]); }} className="shrink-0 text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Dropdown Panel ── */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 left-0 mt-2 z-50 border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            style={{
              background: "rgba(12,13,20,0.99)",
              backdropFilter: "blur(30px)",
              WebkitBackdropFilter: "blur(30px)",
              maxHeight: "75vh",
              overflowY: "auto",
            }}
          >

            {/* ── Empty (show recent searches) ── */}
            {!term.trim() && (
              <div className="p-4 space-y-4">
                {recent.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">البحث الأخير</p>
                      <button onClick={() => { clearRecent(); setRecent([]); }} className="text-xs text-indigo-400 hover:text-indigo-300">مسح الكل</button>
                    </div>
                    {recent.map(q => (
                      <button key={q} onClick={() => { setTerm(q); setDebouncedTerm(q); }}
                        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group text-right">
                        <Clock className="w-4 h-4 text-gray-600 shrink-0" />
                        <span className="text-sm text-gray-300 group-hover:text-white transition-colors flex-1 text-right">{q}</span>
                        <X className="w-3.5 h-3.5 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={e => { e.stopPropagation(); const updated = recent.filter(x => x !== q); setRecent(updated); localStorage.setItem(RECENT_KEY, JSON.stringify(updated)); }} />
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center">
                    <Search className="w-8 h-8 mx-auto text-gray-700 mb-2" />
                    <p className="text-sm text-gray-500">ابدأ الكتابة للبحث...</p>
                  </div>
                )}

                {/* Quick genre chips */}
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">اكتشف</p>
                  <div className="flex flex-wrap gap-2">
                    {["عمرو دياب", "تامر عاشور", "محمد منير", "Mohamed Ramadan", "Taylor Swift", "Drake"].map(q => (
                      <button key={q} onClick={() => { setTerm(q); setDebouncedTerm(q); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-indigo-500/20 border border-white/10 hover:border-indigo-500/40 text-xs text-gray-400 hover:text-white transition-all">
                        <TrendingUp className="w-3 h-3" /> {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Loading skeleton ── */}
            {term.trim() && loading && !hasResults && (
              <div className="p-3 space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="flex items-center gap-3 px-2 py-2 animate-pulse">
                    <div className="w-10 h-10 rounded-lg bg-white/8 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-white/8 rounded-full w-3/4" />
                      <div className="h-2.5 bg-white/5 rounded-full w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── No results ── */}
            {term.trim() && !loading && !hasResults && (
              <div className="py-10 text-center">
                <Music className="w-10 h-10 mx-auto text-gray-700 mb-2" />
                <p className="text-sm text-gray-400">مفيش نتائج لـ «{term}»</p>
                <p className="text-xs text-gray-600 mt-1">جرب كلمة تانية</p>
              </div>
            )}

            {/* ── Results ── */}
            {term.trim() && hasResults && (
              <div className="p-2 space-y-1">

                {/* Artists */}
                {artists.length > 0 && (
                  <div className="pb-2">
                    <p className="px-3 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Mic2 className="w-3.5 h-3.5" /> فنانين
                    </p>
                    <div className="flex gap-3 px-3 pb-2 overflow-x-auto">
                      {artists.map(a => (
                        <Link key={a.artistId} href={`/artist/${a.artistId}`} onClick={() => { pushRecent(term); setIsOpen(false); }}
                          className="flex flex-col items-center gap-1.5 shrink-0 group">
                          <div className="w-14 h-14 rounded-full bg-white/5 overflow-hidden border-2 border-transparent group-hover:border-indigo-500/60 transition-all">
                            {a.thumbnailUrl
                              ? <img src={getProxyUrl(a.thumbnailUrl)} alt={a.artistName} className="w-full h-full object-cover" />
                              : <div className="w-full h-full bg-indigo-500/20 flex items-center justify-center text-xl">🎤</div>
                            }
                          </div>
                          <span className="text-[10px] text-gray-500 group-hover:text-white w-14 text-center truncate transition-colors">{a.artistName}</span>
                        </Link>
                      ))}
                    </div>
                    <div className="h-px bg-white/5 mx-3 mt-1" />
                  </div>
                )}

                {/* Songs */}
                {songs.length > 0 && (
                  <div>
                    <p className="px-3 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Music className="w-3.5 h-3.5" /> أغاني
                    </p>
                    {songs.map((song, i) => (
                      <div key={`${song.songId}-${i}`}
                        onClick={() => playSong(song)}
                        className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                          i === activeIdx ? "bg-indigo-500/15 border border-indigo-500/20" : "hover:bg-white/5"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 relative bg-white/5">
                          {song.thumbnailUrl
                            ? <img src={getProxyUrl(song.thumbnailUrl)} alt={song.title} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center"><Music className="w-4 h-4 text-gray-600" /></div>
                          }
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                            <Play className="w-4 h-4 text-white fill-current" />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate group-hover:text-indigo-400 transition-colors">{song.title}</p>
                          <p className="text-xs text-gray-500 truncate">{song.artist}</p>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); enqueueSongs([song]); }}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-400 hover:text-white border border-white/10 hover:border-white/30 px-2 py-1 rounded-full transition-all shrink-0">
                          + Queue
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Albums */}
                {albums.length > 0 && (
                  <div className="mt-1">
                    <div className="h-px bg-white/5 mx-1 mb-2" />
                    <p className="px-3 py-2 text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Disc className="w-3.5 h-3.5" /> ألبومات
                    </p>
                    {albums.map(alb => (
                      <Link key={alb.albumId} href={`/album/${alb.albumId}`} onClick={() => { pushRecent(term); setIsOpen(false); }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group">
                        <div className="w-10 h-10 rounded-lg bg-white/5 shrink-0 overflow-hidden border border-white/5">
                          {alb.coverUrl || alb.thumbnailUrl ? (
                            <img src={getProxyUrl(alb.coverUrl || alb.thumbnailUrl)} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Disc className="w-4 h-4 text-gray-600" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold truncate group-hover:text-indigo-400 transition-colors">{alb.title}</p>
                          <p className="text-xs text-gray-500 truncate">{alb.artist}</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                {/* View all results */}
                <button onClick={() => goSearch()}
                  className="w-full mt-2 py-2.5 text-sm text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-xl transition-all font-bold flex items-center justify-center gap-2">
                  <Search className="w-4 h-4" />
                  عرض كل نتائج «{term}»
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
