"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  subscribeDownloads, 
  DownloadJob, 
  cancelJob, 
  pauseJob, 
  resumeJob, 
  deleteJob, 
  clearAllJobs 
} from "@/state/downloadStore";
import { 
  DownloadCloud, 
  CheckCircle2, 
  XCircle, 
  Music, 
  X, 
  Pause, 
  Play, 
  Trash2,
  Sparkles
} from "lucide-react";

export function DownloadProgressPanel() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isOverDismissZone, setIsOverDismissZone] = useState(false);
  const prevActiveCountRef = useRef(0);

  useEffect(() => {
    const unsub = subscribeDownloads((data: DownloadJob[]) => {
      setJobs(data);
      const activeCount = data.filter(j => j.status === "downloading").length;
      // Auto-reappear if a new download begins after being dismissed
      if (activeCount > prevActiveCountRef.current && activeCount > 0) {
        setIsDismissed(false);
      }
      prevActiveCountRef.current = activeCount;
    });
    return () => unsub();
  }, []);

  if (jobs.length === 0 || isDismissed) return null;

  const activeJobsCount = jobs.filter(j => j.status === "downloading").length;
  const isDone = activeJobsCount === 0 && jobs.some(j => j.status === "done");
  const overallPct = jobs.length > 0 ? (jobs.reduce((s, j) => {
    const p = j.totalBytes ? (j.progressBytes || 0) / j.totalBytes : (j.done / j.total);
    return s + p;
  }, 0) / jobs.length) * 100 : 0;

  return (
    <>
      {/* ─── Messenger-Style Bottom Dismiss Drop Target ─── */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0, scale: 0.6, y: 30 }}
            animate={{ 
              opacity: 1, 
              scale: isOverDismissZone ? 1.25 : 1, 
              y: 0 
            }}
            exit={{ opacity: 0, scale: 0.5, y: 30 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] flex flex-col items-center gap-1 pointer-events-none select-none`}
          >
            <div 
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 border shadow-2xl ${
                isOverDismissZone 
                  ? "bg-rose-600 border-rose-300 shadow-[0_0_30px_rgba(244,63,94,0.8)] scale-110" 
                  : "bg-black/80 backdrop-blur-xl border-white/20 text-white/70"
              }`}
            >
              <X className={`w-7 h-7 transition-transform ${isOverDismissZone ? "text-white scale-110" : "text-white/80"}`} />
            </div>
            <span className={`text-[10px] font-black tracking-wide ${isOverDismissZone ? "text-rose-300 font-bold" : "text-white/60"}`}>
              اسحب هنا للإخفاء
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Floating Draggable Chat-Head Container ─── */}
      {/* Positioned on the LEFT (left-5) by default so it NEVER collides with FloatingActionMenu (right-4) */}
      <div className="fixed left-5 bottom-28 z-[100] flex flex-col items-start gap-4 pointer-events-none">
        <motion.div
          drag
          dragMomentum={false}
          dragElastic={0.15}
          whileDrag={{ scale: 1.12, cursor: "grabbing" }}
          onDragStart={() => setIsDragging(true)}
          onDrag={(_, info) => {
            if (typeof window !== "undefined") {
              const nearBottom = info.point.y > window.innerHeight - 130;
              setIsOverDismissZone(nearBottom);
            }
          }}
          onDragEnd={(_, info) => {
            setIsDragging(false);
            if (typeof window !== "undefined" && info.point.y > window.innerHeight - 130) {
              // Dropped into dismiss zone!
              if (navigator.vibrate) {
                try { navigator.vibrate(50); } catch {}
              }
              setIsDismissed(true);
              setIsOpen(false);
            }
            setIsOverDismissZone(false);
          }}
          className="pointer-events-auto cursor-grab touch-none"
        >
          {/* ─── FLOATING TOGGLE BUTTON ─── */}
          <motion.button
            layout
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
            className="group relative w-16 h-16 flex items-center justify-center rounded-full"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            aria-label="مدير التحميلات"
          >
            {/* Ambient Aura / Glow */}
            <AnimatePresence>
              {activeJobsCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1.25 }}
                  exit={{ opacity: 0, scale: 1.5 }}
                  className="absolute -inset-3 bg-cyan-500/25 blur-2xl rounded-full animate-pulse"
                />
              )}
            </AnimatePresence>

            {/* Liquid / Orbital Container */}
            <div className={`relative w-full h-full rounded-full flex items-center justify-center transition-all duration-500 shadow-[0_12px_35px_rgba(0,0,0,0.6)] border ${
              activeJobsCount > 0 
                ? "bg-gradient-to-br from-cyan-500 via-indigo-600 to-violet-600 border-white/30" 
                : "bg-black/80 backdrop-blur-2xl border-white/15"
            }`}>
              {/* Progress Ring (SVG) */}
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <defs>
                  <linearGradient id="bubbleProgGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
                <circle cx="32" cy="32" r="27" stroke="rgba(255,255,255,0.08)" strokeWidth="3.5" fill="transparent" />
                {activeJobsCount > 0 && (
                  <motion.circle
                    cx="32" cy="32" r="27"
                    stroke="url(#bubbleProgGradient)" strokeWidth="4" strokeLinecap="round" fill="transparent"
                    strokeDasharray="169.6"
                    animate={{ strokeDashoffset: 169.6 - (169.6 * Math.min(100, Math.max(0, overallPct))) / 100 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                    className="drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                  />
                )}
              </svg>

              {/* Center Icon */}
              <AnimatePresence mode="wait">
                {activeJobsCount > 0 ? (
                  <motion.div
                    key="dl" 
                    initial={{ y: 10, opacity: 0 }} 
                    animate={{ y: 0, opacity: 1 }} 
                    exit={{ y: -10, opacity: 0 }}
                    className="relative z-10 flex flex-col items-center justify-center"
                  >
                    <DownloadCloud className="w-6 h-6 text-white drop-shadow-md animate-bounce" />
                  </motion.div>
                ) : isDone ? (
                  <motion.div key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} className="z-10">
                    <CheckCircle2 className="w-7 h-7 text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.6)]" />
                  </motion.div>
                ) : (
                  <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="z-10">
                    <DownloadCloud className="w-6 h-6 text-white/50 group-hover:text-white transition-colors" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Floating Badge Indicator */}
            <AnimatePresence>
              {activeJobsCount > 0 && !isOpen && (
                <motion.span
                  initial={{ scale: 0 }} 
                  animate={{ scale: 1 }} 
                  exit={{ scale: 0 }}
                  className="absolute -top-1 -right-1 w-6 h-6 bg-cyan-400 text-black text-[11px] font-black rounded-full flex items-center justify-center shadow-lg border border-white"
                >
                  {activeJobsCount}
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </motion.div>

        {/* ─── Expandable Details Panel ─── */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 15 }}
              transition={{ type: "spring", stiffness: 450, damping: 28 }}
              className="w-[92vw] sm:w-[410px] max-w-[430px] rounded-3xl overflow-hidden shadow-[0_25px_80px_rgba(0,0,0,0.85)] border border-white/15 pointer-events-auto"
              style={{ background: "rgba(12, 14, 26, 0.96)", backdropFilter: "blur(40px)" }}
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.03]">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
                  <h3 className="font-black text-sm uppercase tracking-wider text-white">مدير التحميلات</h3>
                  {activeJobsCount > 0 && (
                    <span className="text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 rounded-full">
                      {activeJobsCount} جاري
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => clearAllJobs()}
                    className="text-[11px] font-bold text-gray-400 hover:text-rose-400 px-2 py-1 rounded-lg hover:bg-white/5 transition-all"
                    title="مسح الكل"
                  >
                    مسح الكل
                  </button>
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white flex items-center justify-center transition-colors"
                    title="إغلاق اللوحة"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Jobs List */}
              <div className="max-h-[380px] overflow-y-auto divide-y divide-white/5 custom-scrollbar" dir="rtl">
                {jobs.map(job => (
                  <JobRow key={job.id} job={job} />
                ))}
              </div>

              {/* Footer Note */}
              {activeJobsCount > 0 ? (
                <div className="px-5 py-3 bg-cyan-500/10 border-t border-cyan-500/15 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-cyan-300 text-[11px] font-bold">
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>التحميل شغال في الخلفية ويمكنك قفل الشاشة</span>
                  </div>
                  <span className="text-[10px] text-cyan-200/70 tabular-nums font-mono font-bold">
                    {Math.round(overallPct)}%
                  </span>
                </div>
              ) : (
                <div className="px-5 py-2.5 bg-white/[0.02] border-t border-white/5 text-center">
                  <span className="text-[10px] text-gray-400">يمكنك سحب الدائرة لأسفل الشاشة لإخفائها في أي وقت</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

function JobRow({ job }: { job: DownloadJob }) {
  const [speed, setSpeed] = useState(0);
  const [lastBytes, setLastBytes] = useState(0);
  const [lastTime, setLastTime] = useState(Date.now());

  useEffect(() => {
    if (job.status !== "downloading") return;
    
    const now = Date.now();
    const dt = (now - lastTime) / 1000;
    if (dt < 0.6) return; 

    const currentBytes = job.progressBytes || 0;
    const db = currentBytes - lastBytes;
    const currentSpeed = db / dt; 
    
    if (currentSpeed > 0) {
      setSpeed(currentSpeed);
    }

    setLastBytes(currentBytes);
    setLastTime(now);
  }, [job.progressBytes]);

  const assumedTotal = job.totalBytes && job.totalBytes > 0 ? job.totalBytes : (3.5 * 1024 * 1024);
  const progress = job.progressBytes || 0;
  const isPending = job.status === "downloading" && progress <= 1;

  let pct = Math.min(100, Math.round((progress / assumedTotal) * 100));
  if (job.status === "done") pct = 100;

  const speedText = speed > 0 && !isPending && job.status === "downloading"
    ? `${(speed / (1024 * 1024)).toFixed(1)} MB/s` 
    : "";
  
  const etaSec = speed > 0 && assumedTotal > progress 
    ? Math.ceil((assumedTotal - progress) / speed) 
    : null;
  const etaText = etaSec && etaSec > 0 && etaSec < 3600 ? `متبقي ${etaSec} ث` : "";

  const progressSubText = job.type === "album"
    ? `${(progress / (1024 * 1024)).toFixed(1)} MB من ${(assumedTotal / (1024 * 1024)).toFixed(1)} MB`
    : `${(progress / (1024 * 1024)).toFixed(2)} MB من ${(assumedTotal / (1024 * 1024)).toFixed(2)} MB`;

  return (
    <div className="px-5 py-4 hover:bg-white/[0.02] transition-colors relative group text-right" dir="rtl">
      {/* Top Details */}
      <div className="flex items-center gap-3.5 mb-3">
        <div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center shrink-0 border border-white/10 shadow-inner group-hover:scale-105 transition-transform">
          <Music className={`w-5 h-5 ${
            job.status === "error" 
              ? "text-red-400" 
              : job.status === "done" 
                ? "text-emerald-400" 
                : "text-cyan-400"
          }`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-black text-white truncate leading-tight flex-1">
              {job.type === "album" ? `ألبوم: ${job.name}` : job.name}
            </p>
            <span className={`text-xs font-black tabular-nums shrink-0 ${
              job.status === "error" 
                ? "text-red-400" 
                : job.status === "done" 
                  ? "text-emerald-400" 
                  : "text-cyan-400"
            }`}>
               {isPending ? "⏳ جاري البدء" : `%${pct}`}
            </span>
          </div>
          
          <div className="flex flex-col gap-1 mt-1">
            {job.type === "album" && job.currentSong && job.status === "downloading" && (
              <div className="flex items-center gap-1.5 text-[11px] text-cyan-300 font-medium">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="truncate">{job.currentSong}</span>
              </div>
            )}
            
            <div className="flex items-center justify-between mt-0.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold">
                {job.status === "downloading" ? (
                  <div className="flex items-center gap-1.5 text-gray-400">
                    <span className="text-cyan-300 font-black">
                      {isPending ? "جاري معالجة الروابط وتجهيز الصوت..." : "جاري التحميل"}
                    </span>
                    {speedText && <span className="text-gray-500 px-1 border-r border-white/10 mx-1">{speedText}</span>}
                  </div>
                ) : job.status === "paused" ? (
                  <div className="flex items-center gap-1 text-orange-400 font-bold">
                    <Pause className="w-3 h-3 mr-0.5" /> تم الإيقاف مؤقتاً
                  </div>
                ) : job.status === "done" ? (
                  <div className="flex items-center gap-1 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-3 h-3 mr-0.5" /> اكتمل التحميل وحُفظت بالأوفلاين
                  </div>
                ) : job.status === "cancelled" ? (
                  <div className="flex items-center gap-1 text-orange-400 font-bold">
                    <XCircle className="w-3 h-3 mr-0.5" /> تم الإلغاء
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-red-400 font-bold">
                    <XCircle className="w-3 h-3 mr-0.5" /> فشل التحميل
                  </div>
                )}
              </div>
              
              {/* Controls: Pause / Resume / Cancel / Delete */}
              <div className="flex items-center gap-1.5">
                {(job.status === "downloading" || job.status === "paused") && (
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      if (job.status === "paused") resumeJob(job.id);
                      else pauseJob(job.id);
                    }}
                    className="w-7 h-7 rounded-full bg-white/5 hover:bg-orange-500/20 text-gray-300 hover:text-orange-400 flex items-center justify-center transition-colors active:scale-90"
                    title={job.status === "paused" ? "استئناف" : "إيقاف مؤقت"}
                  >
                    {job.status === "paused" ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
                  </button>
                )}
                {job.status === "downloading" && (
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      cancelJob(job.id); 
                    }}
                    className="w-7 h-7 rounded-full bg-white/5 hover:bg-rose-500/20 text-gray-300 hover:text-rose-400 flex items-center justify-center transition-colors active:scale-90"
                    title="إلغاء التحميل"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {(job.status === "done" || job.status === "cancelled" || job.status === "error") && (
                  <button 
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      deleteJob(job.id); 
                    }}
                    className="w-7 h-7 rounded-full bg-white/5 hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 flex items-center justify-center transition-colors active:scale-90"
                    title="حذف من القائمة"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar with Liquid Shimmer */}
      <div className="space-y-1.5">
        <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
          {isPending ? (
            <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent animate-shimmer" 
                 style={{ backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
          ) : (
            <motion.div
              className={`absolute left-0 top-0 h-full rounded-full ${
                job.status === "done" 
                  ? "bg-emerald-500" 
                  : job.status === "error" 
                    ? "bg-red-500" 
                    : job.status === "cancelled"
                      ? "bg-orange-500"
                      : "bg-gradient-to-r from-cyan-400 to-indigo-500 shadow-[0_0_12px_rgba(34,211,238,0.7)]"
              }`}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          )}
        </div>

        <div className="flex justify-between items-center px-0.5 text-[10px]" dir="ltr">
          <span className="text-cyan-200 font-mono font-bold">{progressSubText}</span>
          {job.status === "downloading" && etaText && (
            <span className="text-gray-400 font-medium">{etaText}</span>
          )}
        </div>
      </div>
    </div>
  );
}
