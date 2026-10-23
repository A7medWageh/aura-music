"use client";

import { useEffect } from "react";

// ─── Shared cache-warming hook ───────────────────────────────────────
// Queues songs for the extraction worker via /api/ytdownload?ingestNow=true so
// the first click hits the Telegram cache and plays instantly. The worker runs
// the download+upload detached (no serverless time cap) and returns at once,
// and @L_10_BOT stays out of it — no "يوتيوب" menu spam in the channel.
// A page-wide seen set avoids re-warming songs the user already saw.

type WarmSong = {
  songId?: string;
  youtubeVideoId?: string;
  title?: string;
  artist?: string;
};

export function useCacheWarm(songs: WarmSong[] | null | undefined, max = 5, stepMs = 900) {
  useEffect(() => {
    if (!songs?.length) return;
    const seen: Set<string> = ((window as any).__auraWarmed ??= new Set());
    const timers: number[] = [];
    songs.slice(0, max).forEach((s, i) => {
      const vid = s.youtubeVideoId || (s.songId && /^[a-zA-Z0-9_-]{11}$/.test(s.songId) ? s.songId : "");
      if (!vid) return;
      const key = String(s.songId || `${s.title}-${s.artist}`);
      if (seen.has(key)) return;
      const id = window.setTimeout(() => {
        if (seen.has(key)) return;
        seen.add(key);
        const p = new URLSearchParams();
        p.set("videoId", vid);
        if (s.title) p.set("title", s.title);
        if (s.artist) p.set("artist", s.artist);
        p.set("ingestNow", "true");
        fetch(`/api/ytdownload?${p.toString()}`).catch(() => {});
      }, 2000 + i * stepMs);
      timers.push(id);
    });
    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs]);
}
