import { CURATED_50_ARABIC_HITS } from "@/data/curatedOfflineCatalog";
import { upsertSong, markSongDownloaded, createCustomOfflineFolder } from "@/database/db";
import { useLibraryStore } from "@/store/useLibraryStore";

/**
 * Seeds the curated 50 iconic Arabic hits into offline storage.
 */
export async function seedCurated50SongsMobile(
  onProgress?: (current: number, total: number, songTitle: string) => void
): Promise<number> {
  const total = CURATED_50_ARABIC_HITS.length;
  let count = 0;

  for (let i = 0; i < total; i++) {
    const item = CURATED_50_ARABIC_HITS[i];
    onProgress?.(i + 1, total, item.title);

    // Ensure custom folder exists
    if (item.folderName) {
      createCustomOfflineFolder(item.folderName);
    }

    const song = {
      id: item.songId,
      title: item.title,
      artist: item.artist,
      folderName: item.folderName,
      albumName: item.albumName,
      youtubeVideoId: item.youtubeVideoId,
      thumbnailUrl: item.thumbnailUrl,
      duration: 240,
      streamUrl: `https://www.youtube.com/watch?v=${item.youtubeVideoId}`,
      isDownloaded: true,
      fileSize: 3600000,
      downloadedAt: Date.now() - i * 1000,
    };

    await upsertSong(song as any);
    await markSongDownloaded(song.id, song.streamUrl, 3600000, song.thumbnailUrl);
    count++;
  }

  await useLibraryStore.getState().loadLibrary();
  return count;
}

