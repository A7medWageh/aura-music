/**
 * downloadStore.ts
 * Global reactive download progress store.
 * Uses a simple event-emitter pattern so any component can subscribe
 * without React context boilerplate.
 */

export type DownloadJob = {
  id: string;              // albumId or songId
  name: string;            // album name or song title
  type: "album" | "song";
  total: number;
  done: number;
  currentSong: string;     // name of song currently downloading
  progressBytes?: number;
  totalBytes?: number;
  failed: number;
  status: "downloading" | "done" | "error";
};

type Listener = (jobs: DownloadJob[]) => void;

const jobs = new Map<string, DownloadJob>();
const listeners = new Set<Listener>();

let lastNotify = 0;
let notifyTimeout: any = null;

function internalNotify() {
  lastNotify = Date.now();
  const snapshot = Array.from(jobs.values());
  
  // Persist to localStorage
  if (typeof window !== "undefined") {
    try { localStorage.setItem("aura-offline-jobs", JSON.stringify(snapshot)); } catch {}
  }
  
  listeners.forEach(l => {
    try { l(snapshot); } catch (e) { console.error(e); }
  });
}

export function notify(force = false) {
  if (force) {
    if (notifyTimeout) {
      clearTimeout(notifyTimeout);
      notifyTimeout = null;
    }
    internalNotify();
    return;
  }
  
  const now = Date.now();
  if (now - lastNotify < 50) {
    if (!notifyTimeout) {
      notifyTimeout = setTimeout(() => {
        notifyTimeout = null;
        internalNotify();
      }, 50);
    }
    return;
  }

  if (notifyTimeout) {
    clearTimeout(notifyTimeout);
    notifyTimeout = null;
  }
  internalNotify();
}

// Initial load from localStorage
if (typeof window !== "undefined") {
  try {
    const saved = localStorage.getItem("aura-offline-jobs");
    if (saved) {
      const parsed = JSON.parse(saved);
      parsed.forEach((j: DownloadJob) => {
        const pct =
          j.type === "song" && j.totalBytes && j.totalBytes > 0
            ? Math.round(((j.progressBytes || 0) / j.totalBytes) * 100)
            : j.total > 0
            ? Math.round((j.done / j.total) * 100)
            : 0;
        if (!isNaN(pct)) {
          jobs.set(j.id, j);
        }
      });
    }
  } catch {}
  notify(true);
}

export function subscribeDownloads(fn: Listener) {
  listeners.add(fn);
  fn(Array.from(jobs.values())); // immediate snapshot
  return () => { listeners.delete(fn); };
}

export function startJob(id: string, name: string, type: "album" | "song", total: number) {
  jobs.set(id, { id, name, type, total, done: 0, currentSong: "", failed: 0, status: "downloading" });
  notify(true);
}

export function updateJob(id: string, update: Partial<DownloadJob>) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, ...update });
  notify();
}

export function finishJob(id: string, success: boolean) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, status: success ? "done" : "error" });
  notify(true);
  // Auto-remove after 8 seconds
  setTimeout(() => { jobs.delete(id); notify(true); }, 8000);
}

export function getActiveJobs(): DownloadJob[] {
  return Array.from(jobs.values());
}
