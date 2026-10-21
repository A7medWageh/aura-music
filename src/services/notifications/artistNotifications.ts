"use client";

/**
 * ArtistNotificationsService
 * Checks followed artists for new releases and fires browser / in-app notifications.
 * Runs in the background on every page open (via AppShell).
 */

import { useEffect } from "react";

const CHECK_KEY = "aura-notif-last-check";
const NOTIFS_KEY = "aura-notifications";
const MIN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour between checks

export type AuraNotification = {
  id: string;
  artistId: string;
  artistName: string;
  artistImage?: string;
  releaseTitle: string;
  releaseId: string;
  publishedAt?: number;
  videoId?: string | null;
  kind?: "song" | "album";
  seenAt: number | null;
  createdAt: number;
};

export function releaseAgeLabel(publishedAt?: number): string {
  if (!publishedAt) return "";
  const h = Math.max(0, Math.round((Date.now() - publishedAt) / 3600e3));
  if (h < 1) return "نزلت دلوقتي 🔥";
  if (h < 24) return `منذ ${h} ساعة`;
  const d = Math.round(h / 24);
  return d === 1 ? "أمبارح" : `منذ ${d} أيام`;
}

export function getStoredNotifications(): AuraNotification[] {
  try {
    return JSON.parse(localStorage.getItem(NOTIFS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function markAllSeen() {
  const notifs = getStoredNotifications().map(n => ({ ...n, seenAt: Date.now() }));
  localStorage.setItem(NOTIFS_KEY, JSON.stringify(notifs));
}

export async function runReleaseCheck(force = false): Promise<void> {
  if (typeof window === "undefined") return;
  const lastCheck = parseInt(localStorage.getItem(CHECK_KEY) || "0");
  if (!force && Date.now() - lastCheck < MIN_INTERVAL_MS) return;

  const followed: string[] = JSON.parse(localStorage.getItem("aura-followed-artists") || "[]");
  if (followed.length === 0) return;

  localStorage.setItem(CHECK_KEY, String(Date.now()));

  // Server verifies REAL YouTube publish dates (release must be ≤36h old)
  const knownReleases: string[] = JSON.parse(localStorage.getItem("aura-known-releases") || "[]");
  const newNotifications: AuraNotification[] = [];

  try {
    const res = await fetch(
      `/api/releases/check?artists=${encodeURIComponent(followed.slice(0, 12).join(","))}&maxAgeHours=36`
    );
    const data = await res.json();
    const artistImageCache = new Map<string, string>();

    for (const r of data.releases || []) {
      const key = `${r.artistId}:${r.albumId}:${r.publishedAt}`;
      if (knownReleases.includes(key)) continue;
      knownReleases.push(key);

      let artistImage = r.thumbnailUrl;
      if (!artistImageCache.has(r.artistId)) {
        try {
          const a = await fetch(`/api/artist/${r.artistId}`).then((x) => x.json());
          const ad = a?.data || a;
          artistImageCache.set(r.artistId, ad?.artistImage || "");
        } catch { artistImageCache.set(r.artistId, ""); }
      }
      artistImage = artistImageCache.get(r.artistId) || artistImage;

          newNotifications.push({
            id: key,
            artistId: r.artistId,
            artistName: r.artist,
            artistImage: artistImage || undefined,
            releaseTitle: r.title,
            releaseId: r.albumId,
            publishedAt: r.publishedAt,
            videoId: r.videoId || null,
            kind: r.kind,
            seenAt: null,
            createdAt: Date.now(),
          });
        }
      } catch { /* network hiccup — try again next hour */ }

      if (newNotifications.length > 0) {
        const existing = getStoredNotifications();
        const merged = [...newNotifications, ...existing].slice(0, 50); // keep last 50
        localStorage.setItem(NOTIFS_KEY, JSON.stringify(merged));
        localStorage.setItem("aura-known-releases", JSON.stringify(knownReleases.slice(-300)));

        // Browser notification (if permitted)
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          newNotifications.slice(0, 3).forEach(async n => {
            const what = n.kind === "album" ? "ألبوم" : "أغنية";
            const title = `${what} جديدة من ${n.artistName} 🎤`;
            const options: any = {
              body: `${n.releaseTitle} — ${releaseAgeLabel(n.publishedAt)}`,
              icon: n.artistImage || "/logo-v2.png",
              badge: "/logo-v2.png",
              tag: n.id,
              vibrate: [200, 100, 200, 100, 200],
              data: { url: `/album/${n.releaseId}` },
              requireInteraction: true
            };

            // Try Service Worker for professional native Android Push
            if ("serviceWorker" in navigator) {
              const reg = await navigator.serviceWorker.getRegistration();
              if (reg && reg.showNotification) {
                reg.showNotification(title, options);
                return;
              }
            }

            // Fallback
            new Notification(title, options);
          });
        }
  }
}

export function useArtistNotifications() {
  useEffect(() => {
    runReleaseCheck().catch(() => {});
  }, []);
}
