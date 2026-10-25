"use client";

import { DownloadCloud, CheckCircle2, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { downloadAlbum } from "@/services/offline/downloader";
import { getAllOfflineSongs } from "@/offline/indexedDbCache";
import { subscribeDownloads } from "@/state/downloadStore";

export default function DownloadAlbumButton({ albumId, songs, metadata }: { albumId: string, songs: any[], metadata: any }) {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkOfflineStatus = async () => {
      try {
        const offlineSongs = await getAllOfflineSongs();
        if (!mounted) return;
        const offlineSet = new Set(
          offlineSongs.filter((s) => s.audioReady).map((s) => s.songId)
        );
        const isFullyDownloaded =
          songs.length > 0 && songs.every((s) => offlineSet.has(s.songId));
        if (mounted) {
          setDownloaded(isFullyDownloaded);
        }
      } catch {}
    };

    checkOfflineStatus();

    const unsubscribe = subscribeDownloads((jobs) => {
      if (!mounted) return;
      const albumJob = jobs.find((j) => j.id === albumId);
      if (albumJob) {
        if (albumJob.status === "downloading") {
          setDownloading(true);
        } else if (albumJob.status === "done") {
          setDownloading(false);
          setDownloaded(true);
        } else {
          setDownloading(false);
        }
      }
    });

    let checkTimeout: any = null;
    const handleUpdate = () => {
      if (checkTimeout) clearTimeout(checkTimeout);
      checkTimeout = setTimeout(() => {
        checkOfflineStatus();
      }, 350);
    };
    window.addEventListener("aura-library-updated", handleUpdate);

    return () => {
      mounted = false;
      if (checkTimeout) clearTimeout(checkTimeout);
      unsubscribe();
      window.removeEventListener("aura-library-updated", handleUpdate);
    };
  }, [albumId, songs]);

  const handleDownload = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (downloading || downloaded) return;
    setDownloading(true);
    try {
      const success = await downloadAlbum(albumId, songs, metadata);
      if (success) setDownloaded(true);
    } catch(e) {
      console.error(e);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button 
      type="button"
      onClick={handleDownload}
      className="relative p-4 text-gray-400 hover:text-white transition-all text-center rounded-full hover:bg-white/5 disabled:opacity-50"
      title="تحميل الألبوم للأوفلاين"
      disabled={downloading || downloaded}
    >
      {downloading ? (
        <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
      ) : downloaded ? (
        <CheckCircle2 className="w-7 h-7 text-green-400" />
      ) : (
        <DownloadCloud className="w-7 h-7" />
      )}
    </button>
  );
}
