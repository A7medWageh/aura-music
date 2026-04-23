"use client";
import { getCsrfToken } from "@/services/security/clientCsrf";

type OfflineSyncItem = {
  userId: string;
  songId: string;
  cacheKey: string;
  byteSize: number;
};

const QUEUE_KEY = "musicweb.offline.sync.queue";

function readQueue(): OfflineSyncItem[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as OfflineSyncItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: OfflineSyncItem[]) {
  window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export function enqueueOfflineSync(item: OfflineSyncItem) {
  const queue = readQueue();
  const exists = queue.some((entry) => entry.userId === item.userId && entry.songId === item.songId);
  if (exists) return;
  writeQueue([...queue, item]);
}

export async function flushOfflineSyncQueue() {
  const queue = readQueue();
  if (!queue.length) return;
  const csrfToken = await getCsrfToken();

  const response = await fetch("/api/offline/sync", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify({ items: queue })
  });

  if (!response.ok) {
    throw new Error("Offline sync failed");
  }

  writeQueue([]);
}
