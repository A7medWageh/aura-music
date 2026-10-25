/**
 * downloadStore.ts
 * Global reactive download progress store.
 * Uses a simple event-emitter pattern so any component can subscribe
 * without React context boilerplate.
 */

import { startBackgroundKeepAlive, stopBackgroundKeepAlive } from "@/services/offline/backgroundKeepAlive";

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
  status: "downloading" | "paused" | "done" | "error" | "cancelled";
};

// Keep controllers out of state so they aren't serialized
const abortControllers = new Map<string, AbortController>();

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
        // Skip restoring completed or failed jobs so the panel stays clean
        if (j.status === "done" || j.status === "cancelled" || j.status === "error") return;

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

export function hasActiveDownloadJobs(): boolean {
  return Array.from(jobs.values()).some(j => j.status === "downloading");
}

export function startJob(id: string, name: string, type: "album" | "song", total: number) {
  jobs.set(id, { id, name, type, total, done: 0, currentSong: "", failed: 0, status: "downloading" });
  try { startBackgroundKeepAlive(name); } catch {}
  notify(true);
}

export function updateJob(id: string, update: Partial<DownloadJob>) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, ...update });
  notify();
}

export function finishJob(id: string, success: boolean, cancelled = false) {
  const job = jobs.get(id);
  if (!job) return;
  jobs.set(id, { ...job, status: cancelled ? "cancelled" : success ? "done" : "error" });
  abortControllers.delete(id);

  // If no other downloads are currently running, release iOS background audio session
  const remainingActive = Array.from(jobs.values()).some(j => j.id !== id && j.status === "downloading");
  if (!remainingActive) {
    try { stopBackgroundKeepAlive(); } catch {}
  }

  notify(true);
  // Auto-remove very fast so the panel hides
  setTimeout(() => { jobs.delete(id); notify(true); }, 2000);
}

export function setJobController(id: string, ctrl: AbortController) {
  abortControllers.set(id, ctrl);
}

export function cancelJob(id: string) {
  const ctrl = abortControllers.get(id);
  if (ctrl) {
    ctrl.abort();
  }
  finishJob(id, false, true);
}

export function pauseJob(id: string) {
  const job = jobs.get(id);
  if (job && job.status === "downloading") {
    jobs.set(id, { ...job, status: "paused" });
    const remainingActive = Array.from(jobs.values()).some(j => j.id !== id && j.status === "downloading");
    if (!remainingActive) {
      try { stopBackgroundKeepAlive(); } catch {}
    }
    notify();
  }
}

export function resumeJob(id: string) {
  const job = jobs.get(id);
  if (job && job.status === "paused") {
    jobs.set(id, { ...job, status: "downloading" });
    try { startBackgroundKeepAlive(job.name); } catch {}
    notify();
  }
}

export function isJobPaused(id: string): boolean {
  return jobs.get(id)?.status === "paused";
}

export function getActiveJobs(): DownloadJob[] {
  return Array.from(jobs.values());
}
