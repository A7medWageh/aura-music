"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { subscribeDownloads, DownloadJob, cancelJob } from "@/state/downloadStore";
import { DownloadCloud, CheckCircle2, XCircle, Music, X } from "lucide-react";

export function DownloadProgressPanel() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const unsub = subscribeDownloads((data: DownloadJob[]) => {
      setJobs(data);
    });
    return () => unsub();
  }, []);

  if (jobs.length === 0) return null;

  const activeJobsCount = jobs.filter(j => j.status === "downloading").length;
  const isDone = activeJobsCount === 0 && jobs.some(j => j.status === "done");
  const overallPct = jobs.length > 0 ? (jobs.reduce((s, j) => {
    const p = j.totalBytes ? (j.progressBytes || 0) / j.totalBytes : (j.done / j.total);
    return s + p;
  }, 0) / jobs.length) * 100 : 0;

  return (
    <div className="fixed bottom-24 right-6 z-[100] flex flex-col items-end gap-6 pointer-events-none">
      {/* ─── STUNNING FLOATING TOGGLE BUTTON ─── */}
      <motion.button
        layout
        onClick={() => setIsOpen(!isOpen)}
        className="group relative w-16 h-16 pointer-events-auto"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
      >
        {/* Outer Glow / Aura */}
        <AnimatePresence>
          {activeJobsCount > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1.2 }}
              exit={{ opacity: 0, scale: 1.5 }}
              className="absolute -inset-4 bg-indigo-500/20 blur-2xl rounded-full animate-pulse"
            />
          )}
        </AnimatePresence>

        {/* Liquid / Orbital Container */}
        <div className={`relative w-full h-full rounded-full flex items-center justify-center transition-all duration-700 shadow-[0_10px_40px_rgba(0,0,0,0.5)] border ${
          activeJobsCount > 0 
          ? "bg-gradient-to-br from-indigo-600 via-indigo-500 to-violet-600 border-white/20" 
          : "bg-black/60 backdrop-blur-3xl border-white/10"
        }`}>
          {/* Progress Ring (SVG) */}
          <svg className="absolute inset-0 w-full h-full -rotate-90">
            <defs>
              <linearGradient id="progGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#818cf8" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
            </defs>
            <circle cx="32" cy="32" r="28" stroke="rgba(255,255,255,0.05)" strokeWidth="3" fill="transparent" />
            {activeJobsCount > 0 && (
              <motion.circle
                cx="32" cy="32" r="28"
                stroke="url(#progGradient)" strokeWidth="4" strokeLinecap="round" fill="transparent"
                strokeDasharray="175.8"
                animate={{ strokeDashoffset: 175.8 - (175.8 * overallPct) / 100 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="drop-shadow-[0_0_8px_rgba(129,140,248,0.8)]"
              />
            )}
          </svg>

          {/* Icon Section */}
          <AnimatePresence mode="wait">
            {activeJobsCount > 0 ? (
              <motion.div
                key="dl" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }}
                className="relative z-10"
              >
                <DownloadCloud className="w-7 h-7 text-white drop-shadow-md" />
                {/* Floating Dots Animation */}
                <motion.div 
                  animate={{ y: [0, 4, 0] }} 
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full"
                />
              </motion.div>
            ) : isDone ? (
              <motion.div key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} className="z-10">
                <CheckCircle2 className="w-7 h-7 text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]" />
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="z-10">
                <DownloadCloud className="w-7 h-7 text-white/30 group-hover:text-white transition-colors" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Floating Indicator Badge */}
        <AnimatePresence>
          {activeJobsCount > 0 && !isOpen && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 w-6 h-6 bg-white text-indigo-600 text-xs font-black rounded-full flex items-center justify-center shadow-2xl skew-x-2"
            >
              {activeJobsCount}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Main Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="w-[90vw] md:w-[400px] rounded-3xl overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.9)] border border-white/10 pointer-events-auto"
            style={{ background: "rgba(10,11,20,0.95)", backdropFilter: "blur(40px)" }}
          >
            <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <h3 className="font-black text-sm uppercase tracking-widest text-white">مدير التحميلات</h3>
              </div>
              <button 
                onClick={() => setJobs([])}
                className="text-[10px] font-bold text-gray-500 hover:text-white transition-colors"
                title="مسح الكل"
              >
                مسح الكل
              </button>
            </div>

            <div className="max-h-[400px] overflow-y-auto divide-y divide-white/5 custom-scrollbar" dir="rtl">
              {jobs.map(job => (
                <JobRow key={job.id} job={job} />
              ))}
            </div>
            
            {activeJobsCount > 0 && (
              <div className="px-6 py-3 bg-indigo-500/10 border-t border-indigo-500/10">
                <p className="text-[10px] text-indigo-300 font-bold text-center animate-pulse">
                  ⚠️ جاري معالجة الروابط.. انتظر قليلاً وستبدأ الأغنية في التحميل دفعة واحدة
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function JobRow({ job }: { job: DownloadJob }) {
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState<number | null>(null);
  const [lastBytes, setLastBytes] = useState(0);
  const [lastTime, setLastTime] = useState(Date.now());

  useEffect(() => {
    if (job.status !== "downloading") return;
    
    const now = Date.now();
    const dt = (now - lastTime) / 1000;
    if (dt < 0.8) return; 

    const currentBytes = job.progressBytes || 0;
    const db = currentBytes - lastBytes;
    const currentSpeed = db / dt; 
    
    setSpeed(currentSpeed);
    if (currentSpeed > 0 && job.totalBytes) {
      const remaining = job.totalBytes - currentBytes;
      setEta(Math.ceil(remaining / currentSpeed));
    }

    setLastBytes(currentBytes);
    setLastTime(now);
  }, [job.progressBytes]);

  const progress = job.totalBytes ? (job.progressBytes || 0) : job.done;
  const total = job.totalBytes || job.total;
  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
  
  const isPending = job.status === "downloading" && pct === 0;

  const speedText = speed > 0 ? `${(speed / (1024 * 1024)).toFixed(1)} MB/s` : "";
  const etaText = eta !== null && eta < 3600 ? `متبقي ${eta} ثانية` : "";

  const progressSubText =
    job.totalBytes
      ? `${((job.progressBytes || 0) / (1024 * 1024)).toFixed(1)} / ${(
          job.totalBytes /
          (1024 * 1024)
        ).toFixed(1)} MB`
      : job.progressBytes && job.progressBytes > 0
      ? `${((job.progressBytes || 0) / (1024 * 1024)).toFixed(1)} MB`
      : `${job.done}/${job.total}`;

  return (
    <div className="px-6 py-6 hover:bg-white/[0.02] transition-colors relative group text-right" dir="rtl">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center shrink-0 border border-white/5 shadow-inner group-hover:scale-105 transition-transform">
          <Music className={`w-6 h-6 ${job.status === "error" ? "text-red-400" : "text-cyan-400"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-black text-white truncate leading-tight flex-1">{job.name}</p>
            <span className={`text-xs font-black tabular-nums ${job.status === "error" ? "text-red-400" : "text-cyan-400"}`}>
               {isPending ? "⏳" : `%${pct}`}
            </span>
          </div>
          
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-2">
              {job.status === "downloading" ? (
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  {isPending ? "بانتظار الرابط..." : "جاري التحميل"}
                  {speedText && !isPending && <span className="text-gray-500 px-1 border-r border-white/10 mx-2">{speedText}</span>}
                </div>
              ) : job.status === "done" ? (
                <p className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 uppercase tracking-widest">
                  <CheckCircle2 className="w-3 h-3 mr-1" /> تم الحفظ
                </p>
              ) : job.status === "cancelled" ? (
                <p className="text-[10px] text-orange-400 font-bold flex items-center gap-1 uppercase tracking-widest">
                  <XCircle className="w-3 h-3 mr-1" /> تم الإلغاء
                </p>
              ) : (
                <p className="text-[10px] text-red-400 font-bold flex items-center gap-1 uppercase tracking-widest">
                  <XCircle className="w-3 h-3 mr-1" /> فشل التحميل
                </p>
              )}
            </div>
            
            {/* Cancel Button */}
            {job.status === "downloading" && (
              <button 
                onClick={(e) => { e.stopPropagation(); cancelJob(job.id); }}
                className="w-6 h-6 rounded-full bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 flex items-center justify-center transition-colors"
                title="إلغاء التحميل"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className={`absolute left-0 top-0 h-full rounded-full ${
              job.status === "done" ? "bg-emerald-500" : job.status === "error" ? "bg-red-500" : "bg-cyan-400 shadow-[0_0_15px_rgba(0,229,255,0.6)]"
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <div className="flex justify-between items-center px-0.5" dir="ltr">
          <span className="text-[10px] text-cyan-200 font-black uppercase tracking-wider">{progressSubText}</span>
          {job.status === "downloading" && etaText && (
            <span className="text-[10px] text-gray-400 font-medium">{etaText}</span>
          )}
        </div>
      </div>
      
      {isPending && (
         <p className="mt-3 text-[10px] text-white/30 italic text-center leading-relaxed">
           سيتم بدء التحميل خلال ثوانٍ بعد الحصول على بيانات الأغنية من خوادم أورا..
         </p>
      )}
    </div>
  );
}
