import type { Song } from "@/types/music";
import { latinizeArtist, normalizeArabicName } from "@/utils/latinize";
import { stripSongNoise } from "@/utils/arabicSearch";

/**
 * Keeps the mobile catalog professional: only official releases by recognised
 * artists reach the home page, and clip/trend/fan-edit uploads are dropped
 * everywhere. Mirrors the junk rules the web site applies in
 * src/services/search/smartSearch.ts.
 */

const UNKNOWN_ARTIST = /^(فنان غير معروف|unknown artist|unknown|artist|فنان)$/i;

const UNOFFICIAL_TITLE =
  /(ترند|موال|دي\s*جي|\bdj\b|عزف|جلسة\s*عود|مسلسل|مشاهد\s*من|كليب\s*من\s*مسلسل|from\s+the\s+(tv\s+)?series|\btv\s+series\b|تيك\s*توك|tiktok|shorts|حالة\s*واتس|ستوري|ستوريات|ترجمة|مترجم|مترجمة|translation|subtitles|indonesian|spanish sub|\b8d\b|\b3d\b|بطيء|مسرع|slowed|sped\s*up|reverb|ريمكس|remix|معدل|تعديل|باس\s*بوست|bass\s*boosted|كاريوكي|karaoke|موسيقى\s*فقط|بدون\s*(موسيقى|صوت)|instrumental|backing\s*track|\bcover\b|كفر|بصوت|تقليد|أغاني?\s*أطفال|اغاني?\s*اطفال|كرتون|انمي|anime|\bkids\b|nursery|cocomelon|بودكاست|podcast|vlog|فلوج|تحدي|challenge|قيمنق|gaming|playstation)/i;

/** Normalises Arabic/Latin text so names compare reliably across scripts. */
export function normalizeName(value: string | undefined | null): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Established artists whose releases are safe to feature on the home page.
 * Arabic and Latin spellings are included because the charts mix both.
 */
const FAMOUS_ARTISTS = [
  // Egypt
  "عمرو دياب", "amr diab",
  "تامر عاشور", "tamer ashour",
  "تامر حسني", "tamer hosny", "tamer hosni",
  "محمد رمضان", "mohamed ramadan",
  "محمود العسيلي", "mahmoud el esseily", "el esseily", "esseily",
  "رضا البحراوي", "reda el bahrawy", "el bahrawy",
  "هدى ناصر", "هدي ناصر", "hoda nasser",
  "حسن شاكوش", "hassan shakosh",
  "احمد سعد", "ahmed saad",
  "عبد الباسط حموده", "abd el basset hamouda", "abd elbaset hamouda",
  "نانسي عجرم", "nancy ajram",
  "امينه", "amina",
  "بهاء سلطان", "bahaa sultan",
  "محمد حماقي", "حماقي", "mohamed hamaki", "hamaki",
  "شيرين", "شيرين عبد الوهاب", "sherine", "sherine abdel wahab",
  "انغام", "angham",
  "اليسا", "elissa",
  "اصاله", "assala",
  "وائل كفوري", "wael kfoury",
  "فضل شاكر", "fadel shaker",
  "رامي صبري", "ramy sabry",
  "حمزه نمره", "hamza namira",
  "حسين الجسمي", "hussain al jassmi",
  "محمد منير", "mohamed mounir",
  "كايروكي", "cairokee",
  "ويجز", "wegz",
  "مروان بابلو", "marwan pablo",
  "افروتو", "afroto",
  "ليجيسي", "lege cy", "lege-cy",
  "تولين", "tul8te",
  "مصطفي حجاج", "mostafa haggag",
  "محمد نور", "mohamed noor",
  "احمد شيبه", "ahmed sheba",
  "حماده هلال", "hamada helal",
  "مصطفي كامل", "mostafa kamel",
  "مدحت صالح", "medhat saleh",
  "هاني شاكر", "hany shaker",
  "محمد فؤاد", "mohamed fouad",
  "ايمان البحر درويش", "iman el bahr darwish",
  "علي الحجار", "ali el haggar",
  "محمد الحلو", "mohamed el helw",
  "خالد عجاج", "khaled agag",
  "حكيم", "hakim",
  "سعد الصغير", "saad el saghir",
  "بوسي", "bousy",
  "امينة", "amena",
  // Gulf & Levant
  "ماجد المهندس", "majid al muhandis",
  "كاظم الساهر", "kadim al sahir", "kadim alsaher",
  "راغب علامه", "ragheb alama",
  "وليد توفيق", "walid toufic",
  "فيروز", "fairuz",
  "ام كلثوم", "umm kulthum", "om kalthoum",
  "عبد الحليم حافظ", "abdel halim hafez",
  "محمد عبده", "mohammed abdo",
  "طلال مداح", "talal maddah",
  "عبد المجيد عبد الله", "abdul majeed abdullah",
  "راشد الماجد", "rashed al majed",
  "صابر الرباعي", "saber rebai",
  "اسماء لمنور", "asma lmnawar",
  "سعد لمجرد", "saad lamjarred",
  "الشاب خالد", "khaled",
  "نجوى كرم", "najwa karam",
  "هيفاء وهبي", "haifa wehbe",
  "ميريام فارس", "myriam fares",
  "اليسا زكريا", "elissa",
  "جورج وسوف", "george wassouf",
  // International
  "taylor swift", "drake", "ed sheeran", "the weeknd", "billie eilish",
  "ariana grande", "adele", "coldplay", "bruno mars", "eminem", "rihanna",
  "beyonce", "shakira", "bad bunny", "post malone", "david guetta",
  "selena gomez", "justin bieber", "dua lipa", "sza", "travis scott",
];

const FAMOUS_SET = new Set(FAMOUS_ARTISTS.map(normalizeName));

/** True when the artist string matches a well-known act (Arabic or Latin spelling). */
export function isFamousArtist(artist: string | undefined | null): boolean {
  const norm = normalizeName(artist);
  if (!norm) return false;
  if (FAMOUS_SET.has(norm)) return true;
  const padded = ` ${norm} `;
  for (const name of FAMOUS_ARTISTS) {
    const n = normalizeName(name);
    if (n && padded.includes(` ${n} `)) return true;
  }
  return false;
}

function durationOf(song: Song): number {
  return typeof song.duration === "number" && isFinite(song.duration) ? song.duration : 0;
}

/**
 * Drops clips, fan edits, DJ cuts, series scenes, translated/karaoke uploads
 * and unknown-artist rows. Unknown durations are kept (the resolver fills them).
 */
export function isJunkSong(song: Song | null | undefined): boolean {
  if (!song || !song.title || !song.youtubeVideoId) return true;
  if (!song.artist || UNKNOWN_ARTIST.test(song.artist.trim())) return true;
  const haystack = `${song.title} ${song.artist}`;
  if (UNOFFICIAL_TITLE.test(haystack)) return true;
  const dur = durationOf(song);
  if (dur > 0 && (dur < 40 || dur > 55 * 60)) return true;
  return false;
}

/** Stricter bar for the home page: official track by a recognised artist. */
export function isPrimeSong(song: Song): boolean {
  return !isJunkSong(song) && isFamousArtist(song.artist);
}

function dedupeKey(song: Song): string {
  return `${normalizeName(song.title)}|${normalizeName(song.artist)}`;
}

/** Removes duplicates while preserving the original chart order. */
export function dedupeSongs(list: Song[]): Song[] {
  const seen = new Set<string>();
  const out: Song[] = [];
  for (const song of list) {
    if (!song) continue;
    const key = dedupeKey(song);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(song);
  }
  return out;
}

/**
 * Chart curation for the home page: junk is removed, duplicates collapsed and
 * tracks by established artists are promoted. If the chart is unusually thin
 * the remaining clean rows fill the gap so the page never looks empty.
 */
export function curateHomeChart(list: Song[]): Song[] {
  const clean = dedupeSongs(list.filter((s) => !isJunkSong(s)));
  const prime = clean.filter(isPrimeSong);
  if (prime.length >= 6) return prime;
  const rest = clean.filter((s) => !isPrimeSong(s));
  return [...prime, ...rest];
}

function calculateRelevance(
  song: Song,
  normTitle: string,
  normArtist: string,
  latinTitle: string,
  cleanQ: string,
  normQuery: string,
  latinQ: string,
  words: string[]
): number {
  let score = 0;
  const rawTitle = (song.title || "").toLowerCase();
  const rawArtist = (song.artist || "").toLowerCase();

  // 1. Exact Title Match
  if (normTitle === cleanQ || latinTitle === latinQ) {
    score += 650;
  } else if (normTitle.startsWith(cleanQ) || latinTitle.startsWith(latinQ)) {
    score += 400;
  } else if (normTitle.includes(cleanQ) || latinTitle.includes(latinQ)) {
    score += 250;
  }

  // 2. Artist match
  if (normArtist.includes(cleanQ) || latinizeArtist(song.artist).toLowerCase().includes(latinQ)) {
    score += 180;
  }

  // 3. Official Release & Studio Indicators
  const isOfficial =
    rawTitle.includes("official") ||
    rawTitle.includes("audio") ||
    rawTitle.includes("video") ||
    rawTitle.includes("رسمي") ||
    rawTitle.includes("الأصلية") ||
    rawTitle.includes("الاصلية") ||
    rawTitle.includes("كليب") ||
    rawArtist.includes("topic");
  if (isOfficial) score += 200;

  // 4. Established / Famous Artist Bonus
  if (isFamousArtist(song.artist)) score += 120;

  // 5. Popularity / View count
  if (song.viewCount && song.viewCount > 1000000) {
    score += Math.min(100, Math.floor(Math.log10(song.viewCount) * 15));
  }

  // 6. Token matching
  for (const w of words) {
    if (normTitle.includes(w) || latinTitle.includes(w)) score += 40;
    if (normArtist.includes(w)) score += 20;
  }

  // 7. Unofficial / Cover / Live / Karaoke Penalties
  if (
    rawTitle.includes("remix") ||
    rawTitle.includes("ريمكس") ||
    rawTitle.includes("cover") ||
    rawTitle.includes("كفر") ||
    rawTitle.includes("بصوت") ||
    rawTitle.includes("تقليد") ||
    rawTitle.includes("karaoke") ||
    rawTitle.includes("كاريوكي") ||
    rawTitle.includes("slowed") ||
    rawTitle.includes("بطيء") ||
    rawTitle.includes("مسرع") ||
    rawTitle.includes("حفلة") ||
    rawTitle.includes("concert") ||
    rawTitle.includes("live") ||
    rawTitle.includes("لايف") ||
    rawTitle.includes("مهرجان")
  ) {
    score -= 350;
  }

  return score;
}

/**
 * Ranks and orders search results so that the original, official studio release
 * appears as result #1, demoting covers, remixes, and fan uploads.
 */
export function rankSearchSongs(songs: Song[], rawQuery: string): Song[] {
  const normQuery = normalizeArabicName(rawQuery);
  const cleanQ = stripSongNoise(normQuery);
  const latinQ = latinizeArtist(rawQuery).toLowerCase();
  const words = cleanQ.split(" ").filter((w) => w.length > 1);

  return [...songs].sort((a, b) => {
    const aNormTitle = normalizeArabicName(stripSongNoise(a.title));
    const bNormTitle = normalizeArabicName(stripSongNoise(b.title));

    const aNormArtist = normalizeArabicName(a.artist);
    const bNormArtist = normalizeArabicName(b.artist);

    const aLatinTitle = latinizeArtist(a.title).toLowerCase();
    const bLatinTitle = latinizeArtist(b.title).toLowerCase();

    const scoreA = calculateRelevance(a, aNormTitle, aNormArtist, aLatinTitle, cleanQ, normQuery, latinQ, words);
    const scoreB = calculateRelevance(b, bNormTitle, bNormArtist, bLatinTitle, cleanQ, normQuery, latinQ, words);

    return scoreB - scoreA;
  });
}
