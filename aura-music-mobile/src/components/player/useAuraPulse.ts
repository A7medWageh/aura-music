import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

export type SceneId = "halo" | "arches" | "vinyl" | "aurora" | "warp" | "calm";

export const SCENES: { id: SceneId; label: string }[] = [
  { id: "halo", label: "هالة" },
  { id: "arches", label: "أقواس" },
  { id: "vinyl", label: "أسطوانة" },
  { id: "aurora", label: "شفق" },
  { id: "warp", label: "نجوم" },
  { id: "calm", label: "هادئ" },
];

export const BAND_COUNT = 32;

export type AuraPulse = {
  clock: SharedValue<number>; // visual time in seconds
  energy: SharedValue<number>; // 0 paused → 1 playing, eased
  kick: SharedValue<number>; // jumps to 1 on a beat, then decays
  beats: SharedValue<number>; // beats since mount
  phase: SharedValue<number>; // 0..1 inside the current beat
  travel: SharedValue<number>; // distance flown by the warp stars, surges on beats
  spin: SharedValue<number>; // vinyl angle in degrees, coasts to a stop on pause
};

function hashSeed(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The clock behind every player effect. It runs on the UI thread, so nothing here re-renders React.
 *
 * The rhythm is synthesized from the song id (each song gets its own tempo): playback doesn't read audio
 * levels, so these visuals move with playback but do not follow the actual sound.
 */
export function useAuraPulse(playing: boolean, seed: string, enabled: boolean): AuraPulse {
  const clock = useSharedValue(0);
  const energy = useSharedValue(0);
  const kick = useSharedValue(0);
  const beats = useSharedValue(0);
  const phase = useSharedValue(0);
  const travel = useSharedValue(0);
  const spin = useSharedValue(0);

  const playingFlag = useSharedValue(playing);
  const beatLength = useSharedValue(0.5);
  const averageMs = useSharedValue(16);
  const frameNo = useSharedValue(0);

  useEffect(() => {
    playingFlag.value = playing;
  }, [playing, playingFlag]);

  useEffect(() => {
    beatLength.value = 60 / (84 + (hashSeed(seed) % 44)); // 84-127 BPM
  }, [seed, beatLength]);

  const frame = useFrameCallback((info) => {
    const elapsedMs = info.timeSincePreviousFrame ?? 16;
    averageMs.value += (elapsedMs - averageMs.value) * 0.05;
    frameNo.value += 1;
    // Struggling device: commit every other frame so the music UI stays responsive.
    if (averageMs.value > 24 && frameNo.value % 2 === 1) return;

    const dt = Math.min(0.1, (averageMs.value > 24 ? elapsedMs * 2 : elapsedMs) / 1000);
    clock.value += dt;

    const target = playingFlag.value ? 1 : 0;
    energy.value += (target - energy.value) * (1 - Math.exp(-dt * 3.2));

    if (playingFlag.value) {
      phase.value += dt / beatLength.value;
      if (phase.value >= 1) {
        phase.value -= 1;
        beats.value += 1;
        kick.value = 1;
      } else {
        kick.value *= Math.exp(-dt * 5.5);
      }
    } else {
      kick.value *= Math.exp(-dt * 5.5);
    }

    travel.value += dt * (0.18 + kick.value * 0.55) * energy.value;
    spin.value = (spin.value + dt * 72 * energy.value) % 360;
  }, false);

  useEffect(() => {
    if (!enabled) {
      frame.setActive(false);
      return;
    }
    if (playing) {
      frame.setActive(true);
      return;
    }
    // Let everything ease to rest, then stop spending frames while paused.
    frame.setActive(true);
    const timer = setTimeout(() => frame.setActive(false), 1800);
    return () => clearTimeout(timer);
  }, [enabled, playing, frame]);

  return useMemo(
    () => ({ clock, energy, kick, beats, phase, travel, spin }),
    [clock, energy, kick, beats, phase, travel, spin],
  );
}

/** Level 0..1 of one spectrum band at this moment. Low bands follow the beat, high bands shimmer. */
export function bandLevel(
  band: number,
  clock: number,
  energy: number,
  kick: number,
  phase: number,
): number {
  "worklet";
  const x = band / (BAND_COUNT - 1);
  const low = Math.pow(1 - x, 2.2) * (0.3 + 0.7 * kick);
  const body =
    (0.5 + 0.5 * Math.sin(clock * 1.7 + band * 0.82)) *
    (0.5 + 0.5 * Math.sin(clock * 0.37 + band * 0.26)) *
    0.85 *
    (1 - x * 0.25);
  const hat = x * Math.exp(-((phase + 0.5) % 1) * 7) * 0.4;
  return Math.min(1, low + body + hat) * energy;
}

const SCENE_KEY = "aura_player_scene";

/** The chosen scene, remembered across launches. Reduced-motion users start on the calm one. */
export function useAuraScene() {
  const reducedMotion = useReducedMotion();
  const [scene, setScene] = useState<SceneId>(reducedMotion ? "calm" : "halo");

  useEffect(() => {
    AsyncStorage.getItem(SCENE_KEY)
      .then((saved) => {
        if (saved && SCENES.some((s) => s.id === saved)) setScene(saved as SceneId);
      })
      .catch(() => {});
  }, []);

  const pickScene = (next: SceneId) => {
    setScene(next);
    AsyncStorage.setItem(SCENE_KEY, next).catch(() => {});
  };

  return [scene, pickScene] as const;
}
