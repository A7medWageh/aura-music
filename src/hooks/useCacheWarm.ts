"use client";

import { useEffect } from "react";

// ─── Shared cache-warming hook ───────────────────────────────────────
// Resolves songs in the background via /api/ytdownload?prefetch=true so the
// first click hits the cache and plays instantly. prefetch keeps @L_10_BOT
// out of it — no "يوتيوب" menu spam in the channel.
// A page-wide seen set avoids re-warming songs the user already saw.

type WarmSong = {
  songId?: string;
  youtubeVideoId?: string;
  title?: string;
  artist?: string;
};

export function useCacheWarm(songs: WarmSong[] | null | undefined, max = 12, stepMs = 700) {
  useEffect(() => {
    if (!songs?.length) return;
    const seen: Set<string> = ((window as any).__auraWarmed ??= new Set());
    const timers: number[] = [];
    songs.slice(0, max).forEach((s, i) => {
      const key = String(s.songId || `${s.title}-${s.artist}`);
      if (seen.has(key)) return;
      const id = window.setTimeout(() => {
        if (seen.has(key)) return;
        seen.add(key);
        const p = new URLSearchParams();
        if (s.youtubeVideoId) p.set("videoId", s.youtubeVideoId);
        if (s.title) p.set("title", s.title);
        if (s.artist) p.set("artist", s.artist);
        p.set("resolveOnly", "true");
        p.set("prefetch", "true");
        fetch(`/api/ytdownload?${p.toString()}`).catch(() => {});
      }, 2000 + i * stepMs);
      timers.push(id);
    });
    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs]);
}
