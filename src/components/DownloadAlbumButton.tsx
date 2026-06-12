"use client";

import { DownloadCloud, CheckCircle2, Loader2 } from "lucide-react";
import { useState } from "react";
import { downloadAlbum } from "@/services/offline/downloader";

export default function DownloadAlbumButton({ albumId, songs, metadata }: { albumId: string, songs: any[], metadata: any }) {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const handleDownload = async () => {
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
