/**
 * Smart Artist Normalizer and Consolidator
 * 
 * Solves the issue of multiple folders for the same artist caused by
 * typos, transliteration differences (Arabic vs English), or source metadata variations.
 * 
 * Example:
 *   "Wael Jassar", "Wael Gassar", "WAEL JASSAP", "وائل جسار"
 *   -> Consolidated into ONE single canonical folder: "وائل جسار (Wael Jassar)"
 */

// Canonical dictionary mapping various spelling variants to a unified canonical name
const CANONICAL_ARTIST_MAP: Record<string, string> = {
  // Wael Jassar
  "wael jassar": "وائل جسار (Wael Jassar)",
  "wael gassar": "وائل جسار (Wael Jassar)",
  "wael jassap": "وائل جسار (Wael Jassar)",
  "wael jasar": "وائل جسار (Wael Jassar)",
  "وائل جسار": "وائل جسار (Wael Jassar)",
  "وائل جسار قديم": "وائل جسار (Wael Jassar)",

  // Jannat
  "jannat": "جنات",
  "janat": "جنات",
  "جنات": "جنات",
  "جنات قديم": "جنات",

  // Hamada Magrashi
  "حماده مجرشي": "حماده مجرشي",
  "حمادة مجرشي": "حماده مجرشي",
  "hamada magrashi": "حماده مجرشي",
  "hamada megrashi": "حماده مجرشي",

  // Amr Diab
  "amr diab": "عمرو دياب",
  "amr deab": "عمرو دياب",
  "عمرو دياب": "عمرو دياب",

  // Tamer Hosny
  "tamer hosny": "تامر حسني",
  "tamer hosni": "تامر حسني",
  "تامر حسني": "تامر حسني",
  "تامر حسنى": "تامر حسني",

  // Sherine
  "sherine": "شيرين عبد الوهاب",
  "shereen": "شيرين عبد الوهاب",
  "شيرين": "شيرين عبد الوهاب",
  "شيرين عبد الوهاب": "شيرين عبد الوهاب",

  // Elissa
  "elissa": "إليسا",
  "elisa": "إليسا",
  "إليسا": "إليسا",
  "اليسا": "إليسا",

  // Mohamed Hamaki
  "mohamed hamaki": "محمد حماقي",
  "hamaki": "محمد حماقي",
  "محمد حماقي": "محمد حماقي",
  "محمد حماقى": "محمد حماقي",

  // Angham
  "angham": "أنغام",
  "أنغام": "أنغام",
  "انغام": "أنغام",

  // Nancy Ajram
  "nancy ajram": "نانسي عجرم",
  "نانسي عجرم": "نانسي عجرم",
  "نانسى عجرم": "نانسي عجرم",

  // Ragheb Alama
  "ragheb alama": "راغب علامة",
  "راغب علامة": "راغب علامة",
  "راغب علامه": "راغب علامة",

  // George Wassouf
  "george wassouf": "جورج وسوف",
  "جورج وسوف": "جورج وسوف",

  // Assala
  "assala": "أصالة نصري",
  "asala": "أصالة نصري",
  "أصالة": "أصالة نصري",
  "اصالة": "أصالة نصري",
  "أصالة نصري": "أصالة نصري",

  // Bahaa Sultan
  "bahaa sultan": "بهاء سلطان",
  "بهاء سلطان": "بهاء سلطان",

  // Cairokee
  "cairokee": "كايروكي",
  "كايروكي": "كايروكي",
  "كايروكى": "كايروكي",

  // Wegz
  "wegz": "ويجز",
  "ويجز": "ويجز",

  // Marwan Pablo
  "marwan pablo": "مروان بابلو",
  "مروان بابلو": "مروان بابلو",

  // Marwan Moussa
  "marwan moussa": "مروان موسى",
  "مروان موسى": "مروان موسى",

  // Kadim Al Sahir
  "kadim al sahir": "كاظم الساهر",
  "kazem el saher": "كاظم الساهر",
  "كاظم الساهر": "كاظم الساهر",

  // Majid Al Mohandis
  "majid al mohandis": "ماجد المهندس",
  "ماجد المهندس": "ماجد المهندس",

  // Hussain Al Jassmi
  "hussain al jassmi": "حسين الجسمي",
  "حسين الجسمي": "حسين الجسمي",
  "حسين الجسمى": "حسين الجسمي",

  // Fadel Shaker
  "fadel shaker": "فضل شاكر",
  "فضل شاكر": "فضل شاكر",

  // Mostafa Amar
  "mostafa amar": "مصطفى قمر",
  "moustafa amar": "مصطفى قمر",
  "مصطفى قمر": "مصطفى قمر",

  // Mohamed Mounir
  "mohamed mounir": "محمد منير",
  "محمد منير": "محمد منير",

  // Ehab Tawfik
  "ehab tawfik": "إيهاب توفيق",
  "إيهاب توفيق": "إيهاب توفيق",
  "ايهاب توفيق": "إيهاب توفيق",
};

/**
 * Clean and simplify string for comparison.
 */
export function cleanArtistString(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ؤئ]/g, "ء")
    .replace(/[\u064B-\u065F]/g, "") // remove arabic diacritics
    .replace(/[-_.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  const aLen = a.length;
  const bLen = b.length;

  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  for (let i = 0; i <= bLen; i++) matrix[i] = [i];
  for (let j = 0; j <= aLen; j++) matrix[0][j] = j;

  for (let i = 1; i <= bLen; i++) {
    for (let j = 1; j <= aLen; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[bLen][aLen];
}

/**
 * Check if two cleaned artist strings are so similar that they are almost certainly typos of each other.
 * e.g. "wael jassar" vs "wael gassar" (distance 1)
 *      "wael jassar" vs "wael jassap" (distance 1)
 */
function isFuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;

  const dist = levenshteinDistance(a, b);
  // If strings are 7+ characters and differ by <= 2 characters
  if (Math.min(a.length, b.length) >= 7 && dist <= 2) return true;
  // If strings are 5+ characters and differ by 1 character
  if (Math.min(a.length, b.length) >= 5 && dist <= 1) return true;

  return false;
}

/**
 * Get the standardized canonical name for an artist.
 */
export function getCanonicalArtistName(rawName: string): string {
  if (!rawName) return "أخرى";
  const trimmed = rawName.trim();
  const cleaned = cleanArtistString(trimmed);

  // 1. Direct dictionary match
  if (CANONICAL_ARTIST_MAP[cleaned]) {
    return CANONICAL_ARTIST_MAP[cleaned];
  }

  // 2. Fuzzy match against dictionary keys
  for (const [key, canonical] of Object.entries(CANONICAL_ARTIST_MAP)) {
    if (isFuzzyMatch(cleaned, key)) {
      return canonical;
    }
  }

  // 3. Fallback: Clean up casing / spacing
  // If English, capitalize words
  if (/^[a-zA-Z\s]+$/.test(trimmed)) {
    return trimmed
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }

  return trimmed;
}

/**
 * Cluster and group a list of artist names so that spelling variations and typos
 * (e.g. Wael Jassar, Wael Gassar, WAEL JASSAP) are unified into ONE master name.
 */
export function clusterArtistNames(artistNames: string[]): Map<string, string> {
  const nameToCanonicalMap = new Map<string, string>();
  const canonicalClusters: string[] = [];

  for (const rawName of artistNames) {
    if (!rawName) continue;
    const canonical = getCanonicalArtistName(rawName);

    // Check if canonical matches an existing cluster
    let matchedCluster: string | null = null;
    const cleanedCanonical = cleanArtistString(canonical);

    for (const existing of canonicalClusters) {
      const cleanedExisting = cleanArtistString(existing);
      if (cleanedCanonical === cleanedExisting || isFuzzyMatch(cleanedCanonical, cleanedExisting)) {
        matchedCluster = existing;
        break;
      }
    }

    if (matchedCluster) {
      nameToCanonicalMap.set(rawName, matchedCluster);
    } else {
      canonicalClusters.push(canonical);
      nameToCanonicalMap.set(rawName, canonical);
    }
  }

  return nameToCanonicalMap;
}
