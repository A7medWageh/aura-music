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
  seenAt: number | null;
  createdAt: number;
};

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

export function useArtistNotifications() {
  useEffect(() => {
    const init = async () => {
      const lastCheck = parseInt(localStorage.getItem(CHECK_KEY) || "0");
      if (Date.now() - lastCheck < MIN_INTERVAL_MS) return;

      const followed: string[] = JSON.parse(localStorage.getItem("aura-followed-artists") || "[]");
      if (followed.length === 0) return;

      localStorage.setItem(CHECK_KEY, String(Date.now()));

      // Store known release IDs to avoid duplicate notifications
      const knownReleases: string[] = JSON.parse(localStorage.getItem("aura-known-releases") || "[]");
      const newNotifications: AuraNotification[] = [];

      for (const artistId of followed) {
        try {
          const res = await fetch(`/api/artist/${artistId}`);
          const data = await res.json();
          if (!data || data.error) continue;

          const allReleases = [...(data.newReleases || []), ...(data.oldAlbums || [])].slice(0, 3);

          for (const release of allReleases) {
            if (!release.albumId || knownReleases.includes(release.albumId)) continue;
            // This release is genuinely NEW (not seen before)
            newNotifications.push({
              id: `${artistId}-${release.albumId}`,
              artistId,
              artistName: data.artistName,
              artistImage: data.artistImage,
              releaseTitle: release.title,
              releaseId: release.albumId,
              seenAt: null,
              createdAt: Date.now(),
            });
            knownReleases.push(release.albumId);
          }
        } catch { /* skip artist on error */ }
      }

      if (newNotifications.length > 0) {
        const existing = getStoredNotifications();
        const merged = [...newNotifications, ...existing].slice(0, 50); // keep last 50
        localStorage.setItem(NOTIFS_KEY, JSON.stringify(merged));
        localStorage.setItem("aura-known-releases", JSON.stringify(knownReleases.slice(-200)));

        // Browser notification (if permitted)
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          newNotifications.slice(0, 3).forEach(n => {
            new Notification(`🎵 إصدار جديد من ${n.artistName}`, {
              body: n.releaseTitle,
              icon: n.artistImage || "/icons/icon-192.png",
              tag: n.id,
            });
          });
        }
      }
    };

    init();
  }, []);
}
