import { create } from "zustand";
import { Song, Playlist } from "@/types/music";
import {
  getDownloadedSongs,
  getFavoriteSongs,
  getPlaylists,
  getRecentlyPlayedSongs,
  toggleFavorite as dbToggleFavorite,
  isFavorite as dbIsFavorite,
  clearFavoriteSongs as dbClearFavoriteSongs,
  createPlaylist as dbCreatePlaylist,
  deletePlaylist as dbDeletePlaylist,
  toggleSongHidden as dbToggleSongHidden,
  renameOfflineFolder as dbRenameOfflineFolder,
  moveSongToOfflineFolder as dbMoveSongToOfflineFolder,
  deleteOfflineFolder as dbDeleteOfflineFolder,
  deleteArtist as dbDeleteArtist,
  deleteAlbum as dbDeleteAlbum,
  deleteOfflineSong as dbDeleteOfflineSong,
  getCustomOfflineFolders as dbGetCustomOfflineFolders,
  createCustomOfflineFolder as dbCreateCustomOfflineFolder,
} from "@/database/db";
import { downloadManager } from "@/services/offline/downloadManager";
import { FileManager } from "@/services/storage/fileManager";
import { MusicApi } from "@/services/api/musicApi";

interface LibraryState {
  downloadedSongs: Song[];
  favorites: Song[];
  playlists: Playlist[];
  recentSongs: Song[];
  customFolders: string[];
  storageUsage: { totalBytes: number; fileCount: number; formattedSize: string };
  isLoading: boolean;

  // Actions
  loadLibrary: () => Promise<void>;
  toggleFavorite: (song: Song) => Promise<boolean>;
  clearFavorites: () => Promise<void>;
  isFavorite: (songId: string) => boolean;
  createPlaylist: (name: string, description?: string) => Promise<Playlist>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  deleteDownloadedSong: (song: Song) => Promise<void>;
  toggleSongHidden: (songId: string, isHidden: boolean) => Promise<void>;
  renameFolder: (oldName: string, newName: string) => Promise<void>;
  moveSongToFolder: (songId: string, targetFolder: string) => Promise<void>;
  deleteFolder: (folderName: string) => Promise<void>;
  deleteArtist: (artistName: string) => Promise<void>;
  deleteAlbum: (albumName: string, artistName?: string) => Promise<void>;
  createCustomFolder: (folderName: string) => boolean;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  downloadedSongs: [],
  favorites: [],
  playlists: [],
  recentSongs: [],
  customFolders: [],
  storageUsage: { totalBytes: 0, fileCount: 0, formattedSize: "0 MB" },
  isLoading: false,

  loadLibrary: async () => {
    set({ isLoading: true });
    try {
      const [downloaded, favs, pls, recents, storage, custom] = await Promise.all([
        getDownloadedSongs(),
        getFavoriteSongs(),
        getPlaylists(),
        getRecentlyPlayedSongs(20),
        FileManager.getStorageUsage(),
        Promise.resolve(dbGetCustomOfflineFolders()),
      ]);

      set({
        downloadedSongs: downloaded,
        favorites: favs,
        playlists: pls,
        recentSongs: recents,
        customFolders: custom,
        storageUsage: storage,
        isLoading: false,
      });
    } catch (err) {
      console.warn("[useLibraryStore.loadLibrary] Error:", err);
      set({ isLoading: false });
    }
  },

  toggleFavorite: async (song: Song) => {
    const isNowFav = await dbToggleFavorite(song);
    const favs = await getFavoriteSongs();
    set({ favorites: favs });
    MusicApi.toggleLike(song.id).catch(() => {});
    return isNowFav;
  },

  clearFavorites: async () => {
    await dbClearFavoriteSongs();
    set({ favorites: [] });
  },

  isFavorite: (songId: string) => {
    return get().favorites.some((f) => f.id === songId);
  },

  createPlaylist: async (name: string, description?: string) => {
    const newPl = await dbCreatePlaylist(name, description);
    const pls = await getPlaylists();
    set({ playlists: pls });
    return newPl;
  },

  deletePlaylist: async (playlistId: string) => {
    await dbDeletePlaylist(playlistId);
    const pls = await getPlaylists();
    set({ playlists: pls });
  },

  deleteDownloadedSong: async (song: Song) => {
    await downloadManager.deleteDownloadedSong(song);
    await dbDeleteOfflineSong(song.id);
    await get().loadLibrary();
  },

  toggleSongHidden: async (songId: string, isHidden: boolean) => {
    await dbToggleSongHidden(songId, isHidden);
    await get().loadLibrary();
  },

  renameFolder: async (oldName: string, newName: string) => {
    await dbRenameOfflineFolder(oldName, newName);
    await get().loadLibrary();
  },

  moveSongToFolder: async (songId: string, targetFolder: string) => {
    await dbMoveSongToOfflineFolder(songId, targetFolder);
    await get().loadLibrary();
  },

  deleteFolder: async (folderName: string) => {
    await dbDeleteOfflineFolder(folderName, true);
    await get().loadLibrary();
  },

  deleteArtist: async (artistName: string) => {
    await dbDeleteArtist(artistName);
    await get().loadLibrary();
  },

  deleteAlbum: async (albumName: string, artistName?: string) => {
    await dbDeleteAlbum(albumName, artistName);
    await get().loadLibrary();
  },

  createCustomFolder: (folderName: string) => {
    const ok = dbCreateCustomOfflineFolder(folderName);
    if (ok) {
      set({ customFolders: dbGetCustomOfflineFolders() });
    }
    return ok;
  },
}));
