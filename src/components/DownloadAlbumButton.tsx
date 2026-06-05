"use client";

import { DownloadCloud, CheckCircle2, Loader2, Crown } from "lucide-react";
import { useState, useEffect } from "react";
import { PremiumModal } from "@/components/PremiumModal";
import { downloadAlbum } from "@/services/offline/downloader";

export default function DownloadAlbumButton({ albumId, songs, metadata }: { albumId: string, songs: any[], metadata: any }) {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);

  useEffect(() => {
    setIsPremium(localStorage.getItem("aura_user_tier") === "premium");
  }, []);

  const handleDownload = async () => {
    if (downloading || downloaded) return;
    if (!isPremium) {
      setShowPremiumModal(true);
      return;
    }
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
    <>
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
          <>
            {!isPremium && <Crown className="absolute top-2 right-2 w-4 h-4 text-amber-500 drop-shadow-md" />}
            <DownloadCloud className="w-7 h-7" />
          </>
        )}
      </button>

      <PremiumModal 
        isOpen={showPremiumModal} 
        onClose={() => setShowPremiumModal(false)} 
        featureName="تحميل الألبومات بالكامل" 
      />
    </>
  );
}
