"use client";

import { motion } from "framer-motion";
import { usePlayer } from "@/state/playerContext";

type FullPlayerProps = {
  open: boolean;
  onClose: () => void;
};

export function FullPlayer({ open, onClose }: FullPlayerProps) {
  const { currentSong, state, prev, next, togglePlay, setShuffle, cycleRepeat, setSpeed, setVolume, seekTo } =
    usePlayer();

  if (!open) return null;

  return (
    <motion.div
      className="fixed inset-0 z-50 bg-gradient-to-b from-black/90 via-[#11131a] to-black/95 p-6"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.2 }}
    >
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold">التشغيل الحالي</h2>
          <button className="rounded-md bg-white/10 px-3 py-2 text-sm" onClick={onClose} type="button">
            قفل
          </button>
        </div>

        <div className="grid flex-1 gap-8 lg:grid-cols-[360px_1fr]">
          <div className="rounded-2xl bg-white/10 p-4">
            <div className="aspect-square rounded-xl bg-gradient-to-br from-emerald-500/40 to-fuchsia-600/40" />
          </div>

          <div className="flex flex-col justify-between rounded-2xl bg-white/5 p-6">
            <div>
              <p className="text-2xl font-bold">{currentSong?.title ?? "مفيش أغنية مختارة"}</p>
              <p className="mt-2 text-white/70">{currentSong?.artist ?? "ابدأ بصف مقترح الأول"}</p>
            </div>

            <div className="space-y-5">
              <div className="h-16 rounded-lg bg-white/10 p-2">
                <div className="h-full w-full rounded bg-gradient-to-r from-emerald-400/50 to-cyan-400/50" />
              </div>

              <div>
                <input
                  className="w-full accent-green-400"
                  max={state.duration || 0}
                  min={0}
                  onChange={(event) => seekTo(Number(event.target.value))}
                  type="range"
                  value={state.currentTime}
                />
                <div className="mt-1 flex justify-between text-xs text-white/60">
                  <span>{formatTime(state.currentTime)}</span>
                  <span>{formatTime(state.duration)}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <button className="rounded-md bg-white/10 px-3 py-2" onClick={prev}>
                  السابق
                </button>
                <button className="rounded-md bg-accent px-3 py-2 font-semibold text-black" onClick={togglePlay}>
                  {state.isPlaying ? "إيقاف" : "تشغيل"}
                </button>
                <button className="rounded-md bg-white/10 px-3 py-2" onClick={next}>
                  التالي
                </button>
                <button
                  className={`rounded-md px-3 py-2 ${state.shuffle ? "bg-accent text-black" : "bg-white/10"}`}
                  onClick={() => setShuffle(!state.shuffle)}
                >
                  خلط
                </button>
                <button className="rounded-md bg-white/10 px-3 py-2" onClick={cycleRepeat}>
                  إعادة: {state.repeat}
                </button>
                <button className="rounded-md bg-white/10 px-3 py-2" onClick={() => setSpeed(state.speed + 0.25)}>
                  السرعة {state.speed.toFixed(2)}x
                </button>
                <button className="rounded-md bg-white/10 px-3 py-2" onClick={() => setVolume(state.volume + 0.1)}>
                  الصوت {Math.round(state.volume * 100)}%
                </button>
              </div>
              {state.isBuffering && <p className="text-sm text-white/70">بيجهز البث...</p>}
              {state.error && <p className="text-sm text-rose-300">{state.error}</p>}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
