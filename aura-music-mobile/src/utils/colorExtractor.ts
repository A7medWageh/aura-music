import { Platform } from "react-native";

export interface DominantColorResult {
  accent: string;
  bgGradient: [string, string, string];
  glowColor: string;
  secondary?: string;
}

// In-memory cache for fast lookups
const colorCache = new Map<string, DominantColorResult>();

const FALLBACK_PALETTE: DominantColorResult = {
  accent: "#E5A93C", // Aura signature gold
  bgGradient: ["rgba(229, 169, 60, 0.35)", "rgba(18, 14, 11, 0.95)", "#0A0908"],
  glowColor: "rgba(229, 169, 60, 0.55)",
  secondary: "#D97706",
};

/**
 * Signature vibrant brand palettes for top Arabic artists.
 * Used whenever artwork extraction is constrained or CORS-limited,
 * guaranteeing instantly gorgeous, distinct color schemes.
 */
const ARTIST_SIGNATURE_PALETTES: Record<string, DominantColorResult> = {
  // Amr Diab — Mediterranean Electric Cyan / Aegean Sea
  "عمرو دياب": {
    accent: "#00D2FF",
    bgGradient: ["rgba(0, 210, 255, 0.35)", "rgba(9, 21, 30, 0.95)", "#060A0E"],
    glowColor: "rgba(0, 210, 255, 0.55)",
    secondary: "#0284C7",
  },
  "amr diab": {
    accent: "#00D2FF",
    bgGradient: ["rgba(0, 210, 255, 0.35)", "rgba(9, 21, 30, 0.95)", "#060A0E"],
    glowColor: "rgba(0, 210, 255, 0.55)",
    secondary: "#0284C7",
  },

  // Sherine — Passionate Burgundy & Crimson Rose
  "شيرين عبدالوهاب": {
    accent: "#FF2A6D",
    bgGradient: ["rgba(255, 42, 109, 0.35)", "rgba(28, 10, 16, 0.95)", "#0D0508"],
    glowColor: "rgba(255, 42, 109, 0.55)",
    secondary: "#E11D48",
  },
  "شيرين": {
    accent: "#FF2A6D",
    bgGradient: ["rgba(255, 42, 109, 0.35)", "rgba(28, 10, 16, 0.95)", "#0D0508"],
    glowColor: "rgba(255, 42, 109, 0.55)",
    secondary: "#E11D48",
  },
  "sherine": {
    accent: "#FF2A6D",
    bgGradient: ["rgba(255, 42, 109, 0.35)", "rgba(28, 10, 16, 0.95)", "#0D0508"],
    glowColor: "rgba(255, 42, 109, 0.55)",
    secondary: "#E11D48",
  },

  // Tamer Hosny — Vibrant Amber & Golden Sun
  "تامر حسني": {
    accent: "#F59E0B",
    bgGradient: ["rgba(245, 158, 11, 0.35)", "rgba(26, 18, 9, 0.95)", "#0C0905"],
    glowColor: "rgba(245, 158, 11, 0.55)",
    secondary: "#D97706",
  },
  "tamer hosny": {
    accent: "#F59E0B",
    bgGradient: ["rgba(245, 158, 11, 0.35)", "rgba(26, 18, 9, 0.95)", "#0C0905"],
    glowColor: "rgba(245, 158, 11, 0.55)",
    secondary: "#D97706",
  },

  // Wegz — Cyber Neon Violet & Street Purple
  "ويجز": {
    accent: "#A855F7",
    bgGradient: ["rgba(168, 85, 247, 0.38)", "rgba(22, 12, 34, 0.95)", "#0B0612"],
    glowColor: "rgba(168, 85, 247, 0.55)",
    secondary: "#7E22CE",
  },
  "wegz": {
    accent: "#A855F7",
    bgGradient: ["rgba(168, 85, 247, 0.38)", "rgba(22, 12, 34, 0.95)", "#0B0612"],
    glowColor: "rgba(168, 85, 247, 0.55)",
    secondary: "#7E22CE",
  },

  // Cairokee — Underground Emerald & Rebel Mint
  "فرقة كايروكي": {
    accent: "#10B981",
    bgGradient: ["rgba(16, 185, 129, 0.35)", "rgba(8, 25, 19, 0.95)", "#040D0A"],
    glowColor: "rgba(16, 185, 129, 0.55)",
    secondary: "#059669",
  },
  "كايروكي": {
    accent: "#10B981",
    bgGradient: ["rgba(16, 185, 129, 0.35)", "rgba(8, 25, 19, 0.95)", "#040D0A"],
    glowColor: "rgba(16, 185, 129, 0.55)",
    secondary: "#059669",
  },
  "cairokee": {
    accent: "#10B981",
    bgGradient: ["rgba(16, 185, 129, 0.35)", "rgba(8, 25, 19, 0.95)", "#040D0A"],
    glowColor: "rgba(16, 185, 129, 0.55)",
    secondary: "#059669",
  },

  // Mohamed Hamaki — Sleek Royal Sapphire Blue
  "محمد حماقي": {
    accent: "#3B82F6",
    bgGradient: ["rgba(59, 130, 246, 0.35)", "rgba(10, 18, 33, 0.95)", "#060A12"],
    glowColor: "rgba(59, 130, 246, 0.55)",
    secondary: "#1D4ED8",
  },
  "حماقي": {
    accent: "#3B82F6",
    bgGradient: ["rgba(59, 130, 246, 0.35)", "rgba(10, 18, 33, 0.95)", "#060A12"],
    glowColor: "rgba(59, 130, 246, 0.55)",
    secondary: "#1D4ED8",
  },
  "hamaki": {
    accent: "#3B82F6",
    bgGradient: ["rgba(59, 130, 246, 0.35)", "rgba(10, 18, 33, 0.95)", "#060A12"],
    glowColor: "rgba(59, 130, 246, 0.55)",
    secondary: "#1D4ED8",
  },

  // Ahmed Saad — Radiant Sunset Orange
  "أحمد سعد": {
    accent: "#F97316",
    bgGradient: ["rgba(249, 115, 22, 0.38)", "rgba(28, 14, 8, 0.95)", "#0E0704"],
    glowColor: "rgba(249, 115, 22, 0.55)",
    secondary: "#C2410C",
  },
  "احمد سعد": {
    accent: "#F97316",
    bgGradient: ["rgba(249, 115, 22, 0.38)", "rgba(28, 14, 8, 0.95)", "#0E0704"],
    glowColor: "rgba(249, 115, 22, 0.55)",
    secondary: "#C2410C",
  },
  "ahmed saad": {
    accent: "#F97316",
    bgGradient: ["rgba(249, 115, 22, 0.38)", "rgba(28, 14, 8, 0.95)", "#0E0704"],
    glowColor: "rgba(249, 115, 22, 0.55)",
    secondary: "#C2410C",
  },

  // Um Kulthum — Imperial Antique Gold
  "أم كلثوم": {
    accent: "#D97706",
    bgGradient: ["rgba(217, 119, 6, 0.36)", "rgba(26, 17, 7, 0.95)", "#0D0904"],
    glowColor: "rgba(217, 119, 6, 0.55)",
    secondary: "#B45309",
  },
  "ام كلثوم": {
    accent: "#D97706",
    bgGradient: ["rgba(217, 119, 6, 0.36)", "rgba(26, 17, 7, 0.95)", "#0D0904"],
    glowColor: "rgba(217, 119, 6, 0.55)",
    secondary: "#B45309",
  },

  // Abdel Halim Hafez — Classic Nostalgic Bronze & Warm Amber
  "عبد الحليم حافظ": {
    accent: "#CA8A04",
    bgGradient: ["rgba(202, 138, 4, 0.35)", "rgba(24, 18, 6, 0.95)", "#0C0903"],
    glowColor: "rgba(202, 138, 4, 0.55)",
    secondary: "#A16207",
  },
  "عبد الحليم": {
    accent: "#CA8A04",
    bgGradient: ["rgba(202, 138, 4, 0.35)", "rgba(24, 18, 6, 0.95)", "#0C0903"],
    glowColor: "rgba(202, 138, 4, 0.55)",
    secondary: "#A16207",
  },

  // Fairuz — Morning Mist Azure
  "فيروز": {
    accent: "#06B6D4",
    bgGradient: ["rgba(6, 182, 212, 0.35)", "rgba(8, 22, 27, 0.95)", "#040B0E"],
    glowColor: "rgba(6, 182, 212, 0.55)",
    secondary: "#0891B2",
  },
  "fairuz": {
    accent: "#06B6D4",
    bgGradient: ["rgba(6, 182, 212, 0.35)", "rgba(8, 22, 27, 0.95)", "#040B0E"],
    glowColor: "rgba(6, 182, 212, 0.55)",
    secondary: "#0891B2",
  },

  // Nancy Ajram — Glamour Pink
  "نانسي عجرم": {
    accent: "#EC4899",
    bgGradient: ["rgba(236, 72, 153, 0.35)", "rgba(27, 10, 19, 0.95)", "#0E050A"],
    glowColor: "rgba(236, 72, 153, 0.55)",
    secondary: "#DB2777",
  },

  // Elissa — Velvet Scarlet
  "إليسا": {
    accent: "#F43F5E",
    bgGradient: ["rgba(244, 63, 94, 0.35)", "rgba(28, 9, 14, 0.95)", "#0E0407"],
    glowColor: "rgba(244, 63, 94, 0.55)",
    secondary: "#E11D48",
  },

  // Assala — Amethyst Violet
  "أصالة": {
    accent: "#8B5CF6",
    bgGradient: ["rgba(139, 92, 246, 0.35)", "rgba(18, 12, 31, 0.95)", "#0A0611"],
    glowColor: "rgba(139, 92, 246, 0.55)",
    secondary: "#6D28D9",
  },

  // Hussain Al Jassmi — Deep Arabian Teal
  "حسين الجسمي": {
    accent: "#14B8A6",
    bgGradient: ["rgba(20, 184, 166, 0.35)", "rgba(8, 24, 23, 0.95)", "#040C0B"],
    glowColor: "rgba(20, 184, 166, 0.55)",
    secondary: "#0D9488",
  },

  // Wael Kfoury — Mediterranean Cobalt
  "وائل كفوري": {
    accent: "#2563EB",
    bgGradient: ["rgba(37, 99, 235, 0.35)", "rgba(9, 15, 30, 0.95)", "#050810"],
    glowColor: "rgba(37, 99, 235, 0.55)",
    secondary: "#1D4ED8",
  },

  // Marwan Pablo — Electric Violet
  "مروان بابلو": {
    accent: "#7C3AED",
    bgGradient: ["rgba(124, 58, 237, 0.38)", "rgba(16, 9, 29, 0.95)", "#090510"],
    glowColor: "rgba(124, 58, 237, 0.55)",
    secondary: "#5B21B6",
  },

  // Muslim — Deep Forest Teal
  "مسلم": {
    accent: "#0D9488",
    bgGradient: ["rgba(13, 148, 136, 0.35)", "rgba(8, 22, 21, 0.95)", "#040C0B"],
    glowColor: "rgba(13, 148, 136, 0.55)",
    secondary: "#0F766E",
  },
};

/**
 * 16 Vivid high-chroma harmonic palettes for deterministic fallback
 * so every distinct song gets its own vibrant, customized aura.
 */
const VIBRANT_HARMONIC_PALETTES: DominantColorResult[] = [
  {
    accent: "#00E5FF", // Electric Cyan
    bgGradient: ["rgba(0, 229, 255, 0.34)", "rgba(9, 22, 28, 0.95)", "#05090C"],
    glowColor: "rgba(0, 229, 255, 0.55)",
    secondary: "#0284C7",
  },
  {
    accent: "#FF3366", // Neon Rose
    bgGradient: ["rgba(255, 51, 102, 0.34)", "rgba(28, 10, 16, 0.95)", "#0D0407"],
    glowColor: "rgba(255, 51, 102, 0.55)",
    secondary: "#E11D48",
  },
  {
    accent: "#F59E0B", // Pure Amber
    bgGradient: ["rgba(245, 158, 11, 0.35)", "rgba(26, 18, 9, 0.95)", "#0C0905"],
    glowColor: "rgba(245, 158, 11, 0.55)",
    secondary: "#D97706",
  },
  {
    accent: "#10B981", // Emerald
    bgGradient: ["rgba(16, 185, 129, 0.35)", "rgba(8, 25, 19, 0.95)", "#040D0A"],
    glowColor: "rgba(16, 185, 129, 0.55)",
    secondary: "#059669",
  },
  {
    accent: "#A855F7", // Purple Neon
    bgGradient: ["rgba(168, 85, 247, 0.36)", "rgba(22, 12, 34, 0.95)", "#0B0612"],
    glowColor: "rgba(168, 85, 247, 0.55)",
    secondary: "#7E22CE",
  },
  {
    accent: "#3B82F6", // Royal Blue
    bgGradient: ["rgba(59, 130, 246, 0.35)", "rgba(10, 18, 33, 0.95)", "#060A12"],
    glowColor: "rgba(59, 130, 246, 0.55)",
    secondary: "#1D4ED8",
  },
  {
    accent: "#F97316", // Sunset Orange
    bgGradient: ["rgba(249, 115, 22, 0.36)", "rgba(28, 14, 8, 0.95)", "#0E0704"],
    glowColor: "rgba(249, 115, 22, 0.55)",
    secondary: "#C2410C",
  },
  {
    accent: "#06B6D4", // Sea Breeze Cyan
    bgGradient: ["rgba(6, 182, 212, 0.35)", "rgba(8, 22, 27, 0.95)", "#040B0E"],
    glowColor: "rgba(6, 182, 212, 0.55)",
    secondary: "#0891B2",
  },
  {
    accent: "#E11D48", // Crimson Ruby
    bgGradient: ["rgba(225, 29, 72, 0.35)", "rgba(27, 9, 14, 0.95)", "#0D0407"],
    glowColor: "rgba(225, 29, 72, 0.55)",
    secondary: "#BE123C",
  },
  {
    accent: "#14B8A6", // Turquoise Teal
    bgGradient: ["rgba(20, 184, 166, 0.35)", "rgba(8, 24, 23, 0.95)", "#040C0B"],
    glowColor: "rgba(20, 184, 166, 0.55)",
    secondary: "#0F766E",
  },
  {
    accent: "#8B5CF6", // Violet Glow
    bgGradient: ["rgba(139, 92, 246, 0.35)", "rgba(18, 12, 31, 0.95)", "#0A0611"],
    glowColor: "rgba(139, 92, 246, 0.55)",
    secondary: "#6D28D9",
  },
  {
    accent: "#EAB308", // Sunlit Gold
    bgGradient: ["rgba(234, 179, 8, 0.35)", "rgba(25, 20, 8, 0.95)", "#0D0A04"],
    glowColor: "rgba(234, 179, 8, 0.55)",
    secondary: "#CA8A04",
  },
];

function getHashPalette(seed: string): DominantColorResult {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return VIBRANT_HARMONIC_PALETTES[Math.abs(hash) % VIBRANT_HARMONIC_PALETTES.length];
}

/**
 * Extracts dominant vibrant color from an image URL, with artist signature
 * and deterministic harmonic fallback so the player ALWAYS transforms into
 * an eye-catching, dynamic theme matching the song.
 */
export async function getDominantArtworkColor(
  imageUrl?: string | null,
  artistName?: string | null,
  songTitle?: string | null
): Promise<DominantColorResult> {
  const cacheKey = `${imageUrl || ""}:${artistName || ""}:${songTitle || ""}`;
  const cached = colorCache.get(cacheKey);
  if (cached) return cached;

  // 1. Check artist signature branding first if available
  if (artistName) {
    const cleanArtist = artistName.trim().toLowerCase();
    for (const [key, palette] of Object.entries(ARTIST_SIGNATURE_PALETTES)) {
      if (cleanArtist.includes(key.toLowerCase()) || key.toLowerCase().includes(cleanArtist)) {
        colorCache.set(cacheKey, palette);
        return palette;
      }
    }
  }

  // 2. On Web, attempt real pixel sampling via HTML5 Canvas
  if (Platform.OS === "web" && typeof window !== "undefined" && typeof document !== "undefined" && imageUrl) {
    try {
      const result = await new Promise<DominantColorResult | null>((resolve) => {
        const img = new (window as any).Image();
        // Set crossOrigin to anonymous so safe CDNs don't taint canvas
        img.crossOrigin = "anonymous";
        const timer = setTimeout(() => resolve(null), 800); // Max 800ms wait

        img.onload = () => {
          clearTimeout(timer);
          try {
            const canvas = document.createElement("canvas");
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve(null);
              return;
            }
            ctx.drawImage(img, 0, 0, 32, 32);
            const data = ctx.getImageData(0, 0, 32, 32).data;

            let r = 0, g = 0, b = 0, count = 0;
            for (let i = 0; i < data.length; i += 16) {
              const rv = data[i];
              const gv = data[i + 1];
              const bv = data[i + 2];
              const brightness = (rv + gv + bv) / 3;
              // Sample only colored pixels (ignore deep blacks and stark whites)
              if (brightness > 35 && brightness < 225) {
                r += rv;
                g += gv;
                b += bv;
                count++;
              }
            }

            if (count > 0) {
              r = Math.round(r / count);
              g = Math.round(g / count);
              b = Math.round(b / count);

              // Boost saturation and brightness for vivid player ambience
              const max = Math.max(r, g, b);
              const scale = max > 0 ? Math.min(1.85, 230 / max) : 1;
              const rB = Math.min(255, Math.round(r * scale));
              const gB = Math.min(255, Math.round(g * scale));
              const bB = Math.min(255, Math.round(b * scale));

              const hex = `#${rB.toString(16).padStart(2, "0")}${gB.toString(16).padStart(2, "0")}${bB.toString(16).padStart(2, "0")}`;
              const palette: DominantColorResult = {
                accent: hex,
                bgGradient: [
                  `rgba(${rB}, ${gB}, ${bB}, 0.38)`,
                  `rgba(15, 12, 10, 0.95)`,
                  `#080706`,
                ],
                glowColor: `rgba(${rB}, ${gB}, ${bB}, 0.55)`,
                secondary: hex,
              };
              resolve(palette);
              return;
            }
            resolve(null);
          } catch {
            // Tainted canvas or security error
            resolve(null);
          }
        };

        img.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };

        img.src = imageUrl;
      });

      if (result) {
        colorCache.set(cacheKey, result);
        return result;
      }
    } catch {
      // Ignore web canvas errors and proceed to fallback
    }
  }

  // 3. High-chroma harmonic fallback using song title, artist, or URL seed
  const seed = `${songTitle || ""}-${artistName || ""}-${imageUrl || ""}`.trim();
  const harmonic = seed ? getHashPalette(seed) : FALLBACK_PALETTE;
  colorCache.set(cacheKey, harmonic);
  return harmonic;
}
