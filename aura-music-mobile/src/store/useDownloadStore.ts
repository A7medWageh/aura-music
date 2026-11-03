import { create } from "zustand";
import { Song, DownloadProgress } from "@/types/music";
import { downloadManager } from "@/services/offline/downloadManager";
import { useLibraryStore } from "./useLibraryStore";

interface DownloadStoreState {
  progressMap: Record<string, DownloadProgress>;
  isPanelOpen: boolean;
  setIsPanelOpen: (open: boolean) => void;
  downloadSong: (song: Song) => Promise<boolean>;
  cancelDownload: (songId: string) => Promise<void>;
  pauseDownload: (songId: string) => Promise<void>;
  resumeDownload: (songId: string, song?: Song) => Promise<void>;
  retryDownload: (song: Song) => Promise<boolean>;
  deleteDownloadedSong: (song: Song) => Promise<void>;
  getProgress: (songId: string) => DownloadProgress | undefined;
  isDownloading: (songId: string) => boolean;
  clearCompleted: () => void;
  clearAll: () => void;
  removeJob: (songId: string) => void;
}

let isSubscribed = false;

export const useDownloadStore = create<DownloadStoreState>((set, get) => {
  if (!isSubscribed) {
    isSubscribed = true;
    downloadManager.subscribe((progress) => {
      set((state) => ({
        progressMap: {
          ...state.progressMap,
          [progress.songId]: progress,
        },
      }));

      // When a download finishes or fails, refresh the library
      if (progress.status === "completed" || progress.status === "failed") {
        useLibraryStore.getState().loadLibrary();
      }
    });
  }

  return {
    progressMap: {},
    isPanelOpen: false,

    setIsPanelOpen: (open: boolean) => {
      set({ isPanelOpen: open });
    },

    downloadSong: async (song: Song) => {
      // Immediate optimistic update so download bubble appears with zero delay
      set((state) => ({
        progressMap: {
          ...state.progressMap,
          [song.id]: {
            songId: song.id,
            title: song.title,
            artist: song.artist,
            thumbnailUrl: song.thumbnailUrl,
            bytesWritten: 0,
            totalBytes: 100,
            progress: 0.05,
            status: "downloading",
          },
        },
      }));
      return await downloadManager.downloadSong(song);
    },

    cancelDownload: async (songId: string) => {
      await downloadManager.cancelDownload(songId);
      set((state) => {
        const next = { ...state.progressMap };
        delete next[songId];
        return { progressMap: next };
      });
    },

    pauseDownload: async (songId: string) => {
      await downloadManager.pauseDownload(songId);
    },

    resumeDownload: async (songId: string, song?: Song) => {
      await downloadManager.resumeDownload(songId, song);
    },

    retryDownload: async (song: Song) => {
      return await downloadManager.downloadSong(song);
    },

    deleteDownloadedSong: async (song: Song) => {
      await downloadManager.deleteDownloadedSong(song);
      set((state) => {
        const next = { ...state.progressMap };
        delete next[song.id];
        return { progressMap: next };
      });
      useLibraryStore.getState().loadLibrary();
    },

    getProgress: (songId: string) => {
      return get().progressMap[songId];
    },

    isDownloading: (songId: string) => {
      const p = get().progressMap[songId];
      return p?.status === "downloading";
    },

    clearCompleted: () => {
      set((state) => {
        const next: Record<string, DownloadProgress> = {};
        Object.entries(state.progressMap).forEach(([id, job]) => {
          if (job.status !== "completed") {
            next[id] = job;
          }
        });
        return { progressMap: next };
      });
    },

    clearAll: () => {
      set({ progressMap: {} });
    },

    removeJob: (songId: string) => {
      set((state) => {
        const next = { ...state.progressMap };
        delete next[songId];
        return { progressMap: next };
      });
    },
  };
});

