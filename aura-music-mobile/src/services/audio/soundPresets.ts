/**
 * AURA SOUND ENGINE — Studio Presets
 * Calibrated 10-Band Parametric Equalization & Acoustic Profiles
 * Frequencies: [32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1000Hz, 2200Hz, 4500Hz, 9000Hz, 16000Hz]
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
  /** 10-band gains in dB */
  eq10Bands: [number, number, number, number, number, number, number, number, number, number];
  vocalWeight: number;    // 0.0 to 1.0
  bassWeight: number;     // 0.0 to 1.0
  spatialWidth: number;   // 0.8 to 1.6
}

export const SOUND_PRESETS: SoundPresetMeta[] = [
  {
    id: "off",
    label: "الصوت الأصلي",
    desc: "بدون أي معالجة — أنقى مسار استوديو كما سجله الفنان",
    icon: "off",
    eq10Bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    vocalWeight: 0.0,
    bassWeight: 0.0,
    spatialWidth: 1.0,
  },
  {
    id: "crystal",
    label: "نقاء بلوري",
    desc: "تفاصيل فائقة ونقاء بلوري عالي وشيمر كريستالي بدون أي حدة",
    icon: "gem",
    eq10Bands: [2.0, 3.5, 1.0, -3.5, -2.0, 1.0, 4.5, 6.0, 8.0, 9.5],
    vocalWeight: 0.45,
    bassWeight: 0.25,
    spatialWidth: 1.35,
  },
  {
    id: "bass",
    label: "بيس عميق",
    desc: "نبضات صب-بيس عميقة وقوية مع حماية كاملة من تشويه السماعات",
    icon: "bass",
    eq10Bands: [9.0, 10.0, 7.5, 2.0, -2.5, -1.0, 1.0, 2.0, 3.5, 4.0],
    vocalWeight: 0.15,
    bassWeight: 0.95,
    spatialWidth: 1.1,
  },
  {
    id: "vocal",
    label: "صوت غنائي نقي",
    desc: "إبراز خامة صوت المطرب في المقدمة بوضوح استثنائي وعزل نقي للآلات",
    icon: "vocal",
    eq10Bands: [-4.0, -2.0, 0.5, -2.5, 2.0, 5.5, 8.5, 5.0, 3.0, 2.0],
    vocalWeight: 0.95,
    bassWeight: 0.2,
    spatialWidth: 1.15,
  },
  {
    id: "spatial",
    label: "محيطي 8D",
    desc: "مسرح صوتي ثلاثي الأبعاد يدور بانسيابية مذهلة بين الأذنين",
    icon: "orbit",
    eq10Bands: [3.0, 4.0, 3.0, -1.0, 0.0, 2.0, 4.5, 5.5, 6.5, 7.0],
    vocalWeight: 0.4,
    bassWeight: 0.4,
    spatialWidth: 1.6,
  },
  {
    id: "concert",
    label: "مسرح حي",
    desc: "صوت سينمائي فسيح وضخم يعطيك إحساس التواجد في قلب الحفل الحي",
    icon: "stage",
    eq10Bands: [4.0, 6.0, 4.0, 1.0, -2.0, 2.5, 5.0, 6.5, 8.0, 8.5],
    vocalWeight: 0.5,
    bassWeight: 0.6,
    spatialWidth: 1.5,
  },
  {
    id: "noise_cancel",
    label: "عزل الضوضاء",
    desc: "تصفية الترددات المزعجة وضوضاء الشارع ورفع نقاء مخارج الكلمات",
    icon: "shield",
    eq10Bands: [-8.0, -4.0, 0.0, -4.0, 1.0, 4.0, 7.5, 6.0, -2.0, -6.0],
    vocalWeight: 0.8,
    bassWeight: 0.0,
    spatialWidth: 0.9,
  },
];

export const SOUND_PRESET_IDS: SoundPreset[] = SOUND_PRESETS.map((p) => p.id);

export function getAuraPreset(id: string): SoundPresetMeta {
  const found = SOUND_PRESETS.find((p) => p.id === id);
  return found || SOUND_PRESETS[0];
}

// Legacy compatibility table for Web Audio fallback
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
