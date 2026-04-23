"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayer } from "@/state/playerContext";

type CommandItem = {
  id: string;
  icon: string;
  category: "تنقل" | "تشغيل" | "ذكاء اصطناعي";
  label: string;
  keywords: string[];
  run: () => void | Promise<void>;
};

const RECENT_STORAGE_KEY = "musicweb.palette.recent";
const PINNED_STORAGE_KEY = "musicweb.palette.pinned";

export function GlobalCommandPalette() {
  const router = useRouter();
  const { togglePlay, next, prev, setQueue, state } = usePlayer();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [status, setStatus] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: "go-home",
        icon: "🏠",
        category: "تنقل",
        label: "روح للرئيسية",
        keywords: ["home", "dashboard", "main"],
        run: () => router.push("/")
      },
      {
        id: "go-onboarding",
        icon: "👤",
        category: "تنقل",
        label: "روح لصفحة التهيئة",
        keywords: ["onboarding", "preferences", "setup"],
        run: () => router.push("/onboarding")
      },
      {
        id: "play-pause",
        icon: "⏯️",
        category: "تشغيل",
        label: state.isPlaying ? "إيقاف التشغيل" : "تشغيل",
        keywords: ["play", "pause", "player"],
        run: () => togglePlay()
      },
      {
        id: "next-track",
        icon: "⏭️",
        category: "تشغيل",
        label: "الأغنية اللي بعديها",
        keywords: ["next", "skip", "song"],
        run: () => next()
      },
      {
        id: "prev-track",
        icon: "⏮️",
        category: "تشغيل",
        label: "الأغنية اللي قبلها",
        keywords: ["prev", "previous", "song", "back"],
        run: () => prev()
      },
      {
        id: "load-ai-dj",
        icon: "🤖",
        category: "ذكاء اصطناعي",
        label: "حمّل صف الدي جي الذكي",
        keywords: ["ai", "dj", "queue", "recommendations"],
        run: async () => {
          const me = await fetch("/api/auth/me");
          if (!me.ok) {
            setStatus("لازم تسجل دخول");
            return;
          }
          const mePayload = (await me.json()) as { data?: { user?: { id: string } } };
          const userId = mePayload.data?.user?.id;
          if (!userId) {
            setStatus("الجلسة مش متاحة");
            return;
          }
          setStatus("بيحمل صف الدي جي...");
          const response = await fetch(`/api/ai-dj/${userId}`);
          if (!response.ok) {
            setStatus("فشل تحميل صف الدي جي");
            return;
          }
          const payload = (await response.json()) as {
            data: {
              queue: Array<{
                song_id: string;
                title: string;
                youtube_video_id: string;
                artist_name: string;
                mood_tag?: string | null;
                energy_score?: number | null;
              }>;
            };
          };
          setQueue(
            payload.data.queue.map((item) => ({
              songId: item.song_id,
              title: item.title,
              artist: item.artist_name,
              youtubeVideoId: item.youtube_video_id,
              moodTag: item.mood_tag ?? null,
              energyScore: item.energy_score ?? null
            }))
          );
          setStatus(`اتحمل ${payload.data.queue.length} أغنية`);
        }
      }
    ],
    [next, prev, router, setQueue, state.isPlaying, togglePlay]
  );

  useEffect(() => {
    try {
      const recent = window.localStorage.getItem(RECENT_STORAGE_KEY);
      const pinned = window.localStorage.getItem(PINNED_STORAGE_KEY);
      setRecentIds(recent ? JSON.parse(recent) : []);
      setPinnedIds(pinned ? JSON.parse(pinned) : []);
    } catch {
      setRecentIds([]);
      setPinnedIds([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentIds.slice(0, 8)));
  }, [recentIds]);

  useEffect(() => {
    window.localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(pinnedIds));
  }, [pinnedIds]);

  const commandMap = useMemo(() => new Map(commands.map((item) => [item.id, item])), [commands]);

  const runCommand = async (command: CommandItem) => {
    await command.run();
    setRecentIds((prev) => [command.id, ...prev.filter((item) => item !== command.id)].slice(0, 8));
  };

  const togglePin = (commandId: string) => {
    setPinnedIds((prev) => {
      if (prev.includes(commandId)) return prev.filter((id) => id !== commandId);
      return [commandId, ...prev];
    });
  };

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? commands
      : commands.filter((command) => {
          if (command.label.toLowerCase().includes(q)) return true;
          return command.keywords.some((keyword) => keyword.includes(q));
        });

    const pinned = base.filter((item) => pinnedIds.includes(item.id));
    const recent = recentIds
      .map((id) => commandMap.get(id))
      .filter((item): item is CommandItem => item !== undefined)
      .filter((item) => base.some((x) => x.id === item.id));
    const remaining = base.filter((item) => !pinned.some((p) => p.id === item.id) && !recent.some((r) => r.id === item.id));

    return [...pinned, ...recent, ...remaining];
  }, [commandMap, commands, pinnedIds, query, recentIds]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  useEffect(() => {
    const onGlobalKeyDown = (event: globalThis.KeyboardEvent) => {
      const isPaletteShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "p";
      if (!isPaletteShortcut) return;
      event.preventDefault();
      setOpen((prevOpen) => !prevOpen);
    };

    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((prevIndex) => (prevIndex + 1) % Math.max(filteredCommands.length, 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((prevIndex) => (prevIndex - 1 + Math.max(filteredCommands.length, 1)) % Math.max(filteredCommands.length, 1));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const selected = filteredCommands[activeIndex];
        if (!selected) return;
        void Promise.resolve(runCommand(selected)).finally(() => setOpen(false));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, filteredCommands, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 p-4 pt-24">
      <div className="w-full max-w-2xl rounded-xl border border-white/15 bg-panel p-3 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <input
            autoFocus
            className="w-full rounded-lg border border-white/15 bg-surface px-3 py-2 text-sm outline-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="نفّذ أمر... (Ctrl/Cmd + Shift + P)"
            value={query}
          />
          <button className="rounded-md bg-white/10 px-3 py-2 text-xs" onClick={() => setOpen(false)} type="button">
            قفل
          </button>
        </div>

        <div className="max-h-72 space-y-1 overflow-auto">
          {filteredCommands.length === 0 && <p className="p-2 text-sm text-white/60">مفيش أوامر مطابقة.</p>}
          {filteredCommands.map((command, index) => (
            <div
              className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                index === activeIndex ? "bg-accent text-black" : "bg-white/5 text-white"
              }`}
              key={command.id}
            >
              <button
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => {
                  void Promise.resolve(runCommand(command)).finally(() => setOpen(false));
                }}
                type="button"
              >
                <span>{command.icon}</span>
                <span className="truncate">{command.label}</span>
                <span className="rounded bg-black/20 px-2 py-0.5 text-[10px]">{command.category}</span>
              </button>
              <button
                className="ml-2 rounded bg-black/20 px-2 py-1 text-xs"
                onClick={() => togglePin(command.id)}
                type="button"
              >
                {pinnedIds.includes(command.id) ? "فك التثبيت" : "ثبّت"}
              </button>
            </div>
          ))}
        </div>

        {status && <p className="mt-3 text-xs text-white/70">{status}</p>}
      </div>
    </div>
  );
}
