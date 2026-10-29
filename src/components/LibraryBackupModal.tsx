"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DownloadCloud,
  UploadCloud,
  X,
  FileCheck2,
  HardDrive,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Share2,
  Smartphone,
  Music,
  FolderDown,
  ArrowRight,
} from "lucide-react";
import {
  createOfflineLibraryBackup,
  importOfflineLibrary,
  type BackupProgress,
} from "@/offline/backupTransfer";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  songsCount: number;
  totalSizeMB: number;
  onSuccess?: () => void;
};

type ReadyFile = {
  blob: Blob;
  fileName: string;
  sizeMB: number;
  blobUrl: string;
};

export function LibraryBackupModal({
  isOpen,
  onClose,
  songsCount,
  totalSizeMB,
  onSuccess,
}: Props) {
  const [activeTab, setActiveTab] = useState<"export" | "import">("export");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [readyFile, setReadyFile] = useState<ReadyFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      if (readyFile?.blobUrl) {
        URL.revokeObjectURL(readyFile.blobUrl);
      }
    };
  }, [readyFile]);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setReadyFile(null);

    try {
      const result = await createOfflineLibraryBackup((p) => {
        setProgress(p);
      });

      const blobUrl = URL.createObjectURL(result.blob);
      const ready: ReadyFile = {
        blob: result.blob,
        fileName: result.fileName,
        sizeMB: result.sizeMB,
        blobUrl,
      };
      setReadyFile(ready);

      // Attempt immediate share if iOS allows it
      tryShareFile(ready);
    } catch (err: any) {
      setErrorMessage(err?.message || "حدث خطأ أثناء تجهيز ملف الأغاني.");
    } finally {
      setIsProcessing(false);
    }
  };

  const tryShareFile = async (targetFile: ReadyFile) => {
    try {
      const file = new File([targetFile.blob], targetFile.fileName, {
        type: "application/octet-stream",
      });

      if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "Aura Music Backup",
          text: "ملف النسخة الاحتياطية لمكتبة الأغاني الأوفلاين",
        });
        setStatusMessage("تم فتح قائمة المشاركة. اختر 'حفظ في الملفات' (Save to Files) لاختيار المجلد وحفظه.");
        return;
      }
    } catch (shareErr: any) {
      if (shareErr?.name === "AbortError") {
        return; // User dismissed sheet
      }
      console.warn("[LibraryBackup] Share failed:", shareErr);
    }

    // Fallback: trigger anchor download
    const a = document.createElement("a");
    a.href = targetFile.blobUrl;
    a.download = targetFile.fileName;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const result = await importOfflineLibrary(file, (p) => {
        setProgress(p);
      });
      setStatusMessage(`تم بنجاح نقل واستيراد ${result.importedCount} أغنية إلى مكتبة هذا التطبيق! 🎉`);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setErrorMessage(err?.message || "حدث خطأ أثناء قراءة ملف النسخة الاحتياطية.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-slate-900/95 border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="relative p-5 pb-3 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">نقل الأغاني لتطبيق الآيفون 📲</h3>
              <p className="text-xs text-gray-400">تصدير واستيراد الأغاني بدون إنترنت وبدون فقدان أي ملف</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 p-1 bg-black/40 rounded-2xl border border-white/5">
            <button
              onClick={() => {
                if (!isProcessing) {
                  setActiveTab("export");
                  setErrorMessage(null);
                  setStatusMessage(null);
                }
              }}
              className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                activeTab === "export"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <UploadCloud className="w-4 h-4" />
              <span>1. تصدير من المتصفح (PWA)</span>
            </button>
            <button
              onClick={() => {
                if (!isProcessing) {
                  setActiveTab("import");
                  setErrorMessage(null);
                  setStatusMessage(null);
                }
              }}
              className={`py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 ${
                activeTab === "import"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <DownloadCloud className="w-4 h-4" />
              <span>2. استيراد في تطبيق الآيفون</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {activeTab === "export" ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-indigo-300">
                  <span className="flex items-center gap-1.5">
                    <Music className="w-4 h-4" /> الأغاني المحملة: {songsCount} أغنية
                  </span>
                  <span className="flex items-center gap-1.5">
                    <HardDrive className="w-4 h-4" /> الحجم التقريبي: {totalSizeMB.toFixed(1)} MB
                  </span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  سيتم دمج أغانيك بالكامل مع الملفات الصوتية والبوسترات في ملف واحد وحفظه في تطبيق{" "}
                  <strong className="text-white">"الملفات" (Files)</strong> على الآيفون لتتمكن من فتحه في تطبيق الآيفون المثبت.
                </p>
              </div>

              {/* Ready File Action Card */}
              {readyFile ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 space-y-3"
                >
                  <div className="flex items-center gap-2 text-emerald-300 font-black text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <span>تم تجهيز الملف بنجاح ({readyFile.sizeMB.toFixed(1)} MB)</span>
                  </div>
                  <p className="text-xs text-gray-200 leading-relaxed">
                    اضغط على الزر الأخضر بالأسفل، وستظهر لك قائمة الآيفون، اختر منها{" "}
                    <strong className="text-white underline">"حفظ في الملفات" (Save to Files)</strong>:
                  </p>

                  <button
                    onClick={() => tryShareFile(readyFile)}
                    className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/25 active:scale-[0.98] transition-all"
                  >
                    <FolderDown className="w-5 h-5" />
                    <span>📁 حفظ في تطبيق الملفات (Save to Files)</span>
                  </button>

                  {/* Direct HTML Download Anchor Link */}
                  <a
                    href={readyFile.blobUrl}
                    download={readyFile.fileName}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all block text-center"
                  >
                    <span>⬇️ أو اضغط هنا للتنزيل المباشر كملف</span>
                  </a>
                </motion.div>
              ) : (
                <button
                  onClick={handleStartExport}
                  disabled={isProcessing || songsCount === 0}
                  className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/25 active:scale-[0.98] transition-all disabled:opacity-50"
                >
                  <UploadCloud className="w-5 h-5" />
                  <span>{isProcessing ? "جارٍ تجميع الأغاني في ملف..." : "تجهيز وتجميع ملف الأغاني (.aurapack)"}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-2">
                <p className="text-xs text-purple-200 leading-relaxed font-bold">
                  📥 افتح هذه الصفحة من داخل <strong className="text-white">تطبيق الآيفون المثبت</strong> على جهازك، ثم اضغط على الزر بالأسفل واختر ملف <strong className="text-white">.aurapack</strong> من تطبيق الملفات.
                </p>
                <p className="text-[11px] text-gray-400">
                  ستنتقل كل الأغاني مباشرة إلى ذاكرة التطبيق، وتعمل أوفلاين مع تحكم كامل 100% من شاشة القفل والـ AirPods!
                </p>
              </div>

              {/* Allow all files so iOS Files picker never greys out the backup file */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelected}
                accept="*/*"
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-xl shadow-purple-600/25 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <DownloadCloud className="w-5 h-5" />
                <span>{isProcessing ? "جارٍ استيراد الأغاني إلى التطبيق..." : "اختر ملف الأغاني (.aurapack) من الملفات"}</span>
              </button>
            </div>
          )}

          {/* Live Progress Bar */}
          {isProcessing && progress && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-black/50 border border-white/10 space-y-2.5"
            >
              <div className="flex items-center justify-between text-xs font-bold text-gray-300">
                <span className="truncate max-w-[200px]">
                  {progress.phase === "exporting" ? "تجميع:" : "استيراد:"} {progress.currentSongTitle}
                </span>
                <span className="text-indigo-400">{progress.percentage}%</span>
              </div>

              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress.percentage}%` }}
                  transition={{ ease: "easeOut", duration: 0.2 }}
                />
              </div>

              <p className="text-[11px] text-gray-400 text-center">
                {progress.current} من أصل {progress.total} أغنية
              </p>
            </motion.div>
          )}

          {/* Success Message */}
          {statusMessage && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <div className="whitespace-pre-line leading-relaxed">{statusMessage}</div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-bold flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <div className="whitespace-pre-line leading-relaxed">{errorMessage}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-black/20 flex items-center justify-end">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all disabled:opacity-50"
          >
            إغلاق
          </button>
        </div>
      </motion.div>
    </div>
  );
}
