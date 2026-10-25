"use client";

import { Play, Pause, Music, MoreHorizontal, DownloadCloud, CheckCircle2 } from "lucide-react";
import { usePlayer } from "@/state/playerContext";
import { motion } from "framer-motion";
import { getProxyUrl } from "@/utils/media";
import { FavoriteButton } from "@/components/FavoriteButton";
import { downloadSong } from "@/services/offline/downloader";
import { getAllOfflineSongs } from "@/offline/indexedDbCache";
import { useEffect, useState } from "react";

export default function AlbumTrackList({ songs, albumArtist }: { songs: any[]; albumArtist?: string }) {
  const { playNow, setQueue, prewarm, state } = usePlayer();
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    let syncTimer: any = null;
    const syncOffline = () => {
      getAllOfflineSongs()
        .then((offlineSongs) => {
          if (!mounted) return;
          const ids = new Set<string>();
          for (const s of offlineSongs) {
            if (s.audioReady) {
              if (s.songId) ids.add(s.songId);
              if (s.id) ids.add(s.id);
              if (s.youtubeVideoId) ids.add(s.youtubeVideoId);
            }
          }
          setDownloadedIds(ids);
        })
        .catch(() => {});
    };

    syncOffline();

    const debouncedSync = () => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(syncOffline, 350);
    };

    window.addEventListener("aura-library-updated", debouncedSync);
    return () => {
      mounted = false;
      if (syncTimer) clearTimeout(syncTimer);
      window.removeEventListener("aura-library-updated", debouncedSync);
    };
  }, []);

  // ── Play song and load the whole album into the queue in order ──
  const playAlbumFrom = (index: number) => {
    const queueSongs = songs.map(song => ({
      songId: song.songId,
      title: song.title,
      artist: song.artist || song.artistName || albumArtist || "",
      youtubeVideoId: song.youtubeVideoId,
      thumbnailUrl: song.thumbnailUrl,
      metadata: { thumbnailUrl: song.thumbnailUrl },
    }));
    // Set the full album queue starting from the clicked song
    setQueue(queueSongs, index);
  };

  return (
    <>
      {/* ── Mobile list (swipeable, card-style) ── */}
      <div className="md:hidden divide-y divide-white/5">
        {songs.map((song: any, index: number) => {
          const isCurrentSong = state.currentSongId === song.songId;
          const isPlaying = isCurrentSong && state.isPlaying;

          return (
            <motion.div
              key={`${song.songId}-${index}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(index * 0.04, 0.6), duration: 0.3 }}
              className={`flex items-center gap-3 px-4 py-3 active:bg-white/5 transition-colors cursor-pointer ${
                isCurrentSong ? "bg-indigo-500/5" : ""
              }`}
              onMouseEnter={() => prewarm(song.youtubeVideoId)}
              onClick={() => playAlbumFrom(index)}
            >
              {/* Track number / playing indicator */}
              <div className="w-8 shrink-0 flex items-center justify-center">
                {isCurrentSong ? (
                  <div className="flex gap-[3px] items-end h-4">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-[3px] bg-indigo-400 rounded-full"
                        animate={isPlaying ? { height: [8, 16, 8] } : { height: 4 }}
                        transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15, ease: "easeInOut" }}
                        style={{ height: 4 }}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-gray-600 font-medium tabular-nums">{index + 1}</span>
                )}
              </div>

              {/* Thumbnail */}
              <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-white/5 shadow-md">
                {song.thumbnailUrl ? (
                  <img
                    src={getProxyUrl(song.thumbnailUrl)}
                    alt={song.title}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-song.jpg"; }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music className="w-4 h-4 text-gray-600" />
                  </div>
                )}
              </div>

              {/* Title + artist */}
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm truncate ${isCurrentSong ? "text-indigo-400" : "text-white"}`}>
                  {song.title}
                </p>
                {(song.artist || song.artistName) && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{song.artist || song.artistName}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                <FavoriteButton 
                  songId={song.songId}
                  title={song.title}
                  artist={song.artist || song.artistName || albumArtist || ""}
                  thumbnailUrl={song.thumbnailUrl}
                  youtubeVideoId={song.youtubeVideoId}
                  size={16}
                />
                {(() => {
                  const isReady = downloadedIds.has(song.songId) || (song.youtubeVideoId && downloadedIds.has(song.youtubeVideoId));
                  return (
                    <button
                      className={`p-2 transition-colors ${isReady ? "text-green-400" : "text-gray-600 hover:text-white"}`}
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if (isReady) return;
                        setDownloadedIds(prev => new Set(prev).add(song.songId));
                        downloadSong(song.songId, song.youtubeVideoId, {
                          title: song.title,
                          artist: song.artist || song.artistName || albumArtist || "",
                          thumbnailUrl: song.thumbnailUrl
                        });
                      }}
                      title={isReady ? "تم التحميل" : "تحميل"}
                    >
                      {isReady ? <CheckCircle2 className="w-5 h-5" /> : <DownloadCloud className="w-5 h-5" />}
                    </button>
                  );
                })()}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ── Desktop table (unchanged look) ── */}
      <div className="hidden md:block rounded-2xl overflow-hidden bg-black/20 border border-white/5 backdrop-blur-xl">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="border-b border-white/5 text-gray-500 text-sm uppercase">
              <th className="px-6 py-4 font-bold w-12 text-center">#</th>
              <th className="px-6 py-4 font-bold">العنوان</th>
            </tr>
          </thead>
          <tbody>
            {songs.map((song: any, index: number) => {
              const isCurrentSong = state.currentSongId === song.songId;
              const isPlaying = isCurrentSong && state.isPlaying;
              return (
                <tr
                  key={`${song.songId}-${index}`}
                  onClick={() => playAlbumFrom(index)}
                  className={`group hover:bg-white/5 transition-colors cursor-pointer border-b border-white/5 last:border-0 ${
                    isCurrentSong ? "bg-indigo-500/5" : ""
                  }`}
                >
                  <td className="px-6 py-4 text-center">
                    {isCurrentSong ? (
                      <div className="flex gap-[3px] items-end h-4 mx-auto w-fit">
                        {[0, 1, 2].map((i) => (
                          <motion.div
                            key={i}
                            className="w-[3px] bg-indigo-400 rounded-full"
                            animate={isPlaying ? { height: [6, 14, 6] } : { height: 4 }}
                            transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15, ease: "easeInOut" }}
                            style={{ height: 4 }}
                          />
                        ))}
                      </div>
                    ) : (
                      <>
                        <span className="text-gray-400 group-hover:hidden text-base font-medium">{index + 1}</span>
                        <Play className="w-5 h-5 text-indigo-400 fill-current hidden group-hover:block mx-auto" />
                      </>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded bg-white/5 flex items-center justify-center shrink-0 shadow-md overflow-hidden">
                          {song.thumbnailUrl ? (
                            <img 
                              src={getProxyUrl(song.thumbnailUrl)} 
                              alt={song.title} 
                              className="w-full h-full object-cover rounded" 
                              onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder-song.jpg"; }}
                            />
                          ) : (
                            <Music className="w-5 h-5 text-gray-600" />
                          )}
                        </div>
                        <div className="flex flex-col justify-center">
                          <span className={`font-bold text-base transition-colors ${isCurrentSong ? "text-indigo-400" : "text-white/90 group-hover:text-white"}`}>
                            {song.title}
                          </span>
                          <span className="text-sm text-gray-500">{song.artist || song.artistName}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <FavoriteButton 
                          songId={song.songId}
                          title={song.title}
                          artist={song.artist || song.artistName || albumArtist || ""}
                          thumbnailUrl={song.thumbnailUrl}
                          youtubeVideoId={song.youtubeVideoId}
                          size={18}
                        />
                        {(() => {
                          const isReady = downloadedIds.has(song.songId) || (song.youtubeVideoId && downloadedIds.has(song.youtubeVideoId));
                          return (
                            <button 
                              className={`p-2 transition-colors ${isReady ? "text-green-400" : "text-gray-500 hover:text-white"}`}
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                if (isReady) return;
                                setDownloadedIds(prev => new Set(prev).add(song.songId));
                                downloadSong(song.songId, song.youtubeVideoId, {
                                  title: song.title,
                                  artist: song.artist || song.artistName || albumArtist || "",
                                  thumbnailUrl: song.thumbnailUrl
                                });
                              }}
                              title={isReady ? "تم التحميل" : "تحميل"}
                            >
                              {isReady ? <CheckCircle2 className="w-5 h-5" /> : <DownloadCloud className="w-5 h-5" />}
                            </button>
                          );
                        })()}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
