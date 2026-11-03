/**
 * Studio sound profiles shared by the player UI and the Web Audio engine.
 * Band tables are the same recipes the web player applies, so a preset sounds
 * identical on both surfaces.
 */

export type SoundPreset =
  | "off"
  | "crystal"
  | "bass"
  | "vocal"
  | "spatial"
  | "concert"
  | "noise_cancel";

export type EqBandType = "lowshelf" | "peaking" | "highshelf" | "highpass";

export interface EqBand {
  type: EqBandType;
  freq: number;
  gain: number;
  Q?: number;
}

export interface SoundPresetConfig {
  bands: EqBand[];
  comp: { threshold: number; ratio: number; attack: number; release: number };
  postGain: number;
}

export interface SoundPresetMeta {
  id: SoundPreset;
  label: string;
  desc: string;
  icon: "off" | "gem" | "bass" | "vocal" | "orbit" | "stage" | "shield";
}

export const SOUND_PRESETS: SoundPresetMeta[] = [
  {
    id: "off",
    label: "الصوت الأصلي",
    desc: "بدون أي معالجة — أنقى مسار كما صدر من الاستوديو",
    icon: "off",
  },
  {
    id: "crystal",
    label: "نقاء بلوري",
    desc: "تفاصيل واضحة وشيمر نقي مثل سبوتيفاي Hi-Fi",
    icon: "gem",
  },
  {
    id: "bass",
    label: "بيس عميق",
    desc: "نبضات بيز ضخمة تهز الأذن بنعومة",
    icon: "bass",
  },
  {
    id: "vocal",
    label: "صوت غنائي نقي",
    desc: "المطرب في وجهك مع عزل الآلات — مثالي للطرب",
    icon: "vocal",
  },
  {
    id: "spatial",
    label: "محيطي 8D",
    desc: "دوران حول الرأس بين الأذنين بتأثير فضائي",
    icon: "orbit",
  },
  {
    id: "concert",
    label: "مسرح حي",
    desc: "صوت سينمائي واسع كأنك في حفلة لايف",
    icon: "stage",
  },
  {
    id: "noise_cancel",
    label: "عزل الضوضاء",
    desc: "فلترة ضوضاء الشارع والمواصلات ورفع وضوح الكلمات",
    icon: "shield",
  },
];

export const SOUND_PRESET_IDS: SoundPreset[] = SOUND_PRESETS.map((p) => p.id);

export const SOUND_PRESET_CONFIG: Record<SoundPreset, SoundPresetConfig> = {
  off: {
    bands: [
      { type: "lowshelf", freq: 60, gain: 0 },
      { type: "peaking", freq: 240, gain: 0, Q: 1 },
      { type: "peaking", freq: 1000, gain: 0, Q: 1 },
      { type: "peaking", freq: 3000, gain: 0, Q: 1 },
      { type: "highshelf", freq: 11000, gain: 0 },
    ],
    comp: { threshold: 0, ratio: 1, attack: 0.003, release: 0.25 },
    postGain: 1,
  },
  crystal: {
    bands: [
      { type: "lowshelf", freq: 50, gain: 5.0 },
      { type: "peaking", freq: 380, gain: -6.0, Q: 1.4 },
      { type: "peaking", freq: 2800, gain: 7.5, Q: 0.9 },
      { type: "peaking", freq: 6500, gain: 9.0, Q: 0.85 },
      { type: "highshelf", freq: 13000, gain: 14.0 },
    ],
    comp: { threshold: -12, ratio: 2.2, attack: 0.015, release: 0.15 },
    postGain: 1.34,
  },
  bass: {
    bands: [
      { type: "lowshelf", freq: 45, gain: 15.0 },
      { type: "peaking", freq: 90, gain: 8.5, Q: 1.2 },
      { type: "peaking", freq: 450, gain: -7.0, Q: 1.4 },
      { type: "peaking", freq: 3500, gain: -2.5, Q: 1.2 },
      { type: "highshelf", freq: 10000, gain: 3.0 },
    ],
    comp: { threshold: -18, ratio: 3.5, attack: 0.02, release: 0.2 },
    postGain: 1.4,
  },
  vocal: {
    bands: [
      { type: "lowshelf", freq: 80, gain: -12.0 },
      { type: "peaking", freq: 250, gain: -4.0, Q: 1.2 },
      { type: "peaking", freq: 1200, gain: 6.0, Q: 1.0 },
      { type: "peaking", freq: 3200, gain: 13.0, Q: 0.85 },
      { type: "highshelf", freq: 11500, gain: 6.5 },
    ],
    comp: { threshold: -14, ratio: 2.8, attack: 0.01, release: 0.12 },
    postGain: 1.36,
  },
  spatial: {
    bands: [
      { type: "lowshelf", freq: 55, gain: 6.0 },
      { type: "peaking", freq: 250, gain: 3.0, Q: 0.9 },
      { type: "peaking", freq: 500, gain: -4.0, Q: 1.3 },
      { type: "peaking", freq: 2800, gain: 6.0, Q: 0.8 },
      { type: "highshelf", freq: 12000, gain: 8.0 },
    ],
    comp: { threshold: -15, ratio: 2.4, attack: 0.015, release: 0.16 },
    postGain: 1.35,
  },
  concert: {
    bands: [
      { type: "lowshelf", freq: 60, gain: 9.0 },
      { type: "peaking", freq: 160, gain: 5.0, Q: 0.9 },
      { type: "peaking", freq: 800, gain: -4.0, Q: 1.2 },
      { type: "peaking", freq: 3600, gain: 8.0, Q: 0.8 },
      { type: "highshelf", freq: 14000, gain: 11.0 },
    ],
    comp: { threshold: -16, ratio: 2.6, attack: 0.02, release: 0.35 },
    postGain: 1.38,
  },
  noise_cancel: {
    bands: [
      { type: "highpass", freq: 100, gain: 0, Q: 0.7 },
      { type: "peaking", freq: 220, gain: -5.0, Q: 1.0 },
      { type: "peaking", freq: 1800, gain: 11.0, Q: 0.8 },
      { type: "peaking", freq: 3500, gain: 8.0, Q: 0.9 },
      { type: "highshelf", freq: 8500, gain: -7.0 },
    ],
    comp: { threshold: -20, ratio: 4.0, attack: 0.006, release: 0.1 },
    postGain: 1.36,
  },
};

export function isSoundPreset(value: unknown): value is SoundPreset {
  return typeof value === "string" && (SOUND_PRESET_IDS as string[]).includes(value);
}
