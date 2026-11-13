import type { Song } from "@/types/music";
import { latinizeArtist, normalizeArabicName } from "@/utils/latinize";
import { normalizeArabic, normalizeColloquialArabic, stripSongNoise } from "@/utils/arabicSearch";

/**
 * Keeps the mobile catalog professional: only official releases by recognised
 * artists reach the home page, and clip/trend/fan-edit uploads are dropped
 * everywhere. Mirrors the junk rules the web site applies in
 * src/services/search/smartSearch.ts.
 */

const UNKNOWN_ARTIST = /^(فنان غير معروف|unknown artist|unknown|artist|فنان)$/i;

const JUNK_MEDIA_PATTERN =
  /(أ?غاني?\s*أ?طفال|كرتون|انمي|anime|\bkids\b|nursery|cocomelon|baby\s*(shark|bus|yin)?|طيور\s*الجنة|عصافير|كاريوكي|karaoke|بودكاست|podcast|vlog|فلوج|تحدي|challenge|بريك|مقاطع\s*قصيرة|shorts|جيم|قيمنق|gaming|playstation|حالة\s*واتس|ستوري|ستوريات|ترجمة|مترجم|مترجمة|translation|subtitles|indonesian|spanish sub|\b8d\b|\b3d\b|بطيء|مسرع|slowed|sped\s*up|reverb|ريمكس|remix|معدل|تعديل|باس\s*بوست|bass\s*boosted|موسيقى\s*فقط|بدون\s*(موسيقى|صوت)|instrumental|backing\s*track|\bcover\b|كفر|تقليد|تصوير\s*و?الليزر|تنظيم\s*الحفلات|مليونية|مواهب\s*الحظ|عفاريت\s*الحظ|\bحظ\b|استوديو\s*تصوير|فيديو\s*سيرفيس|عازف\s*أ?ورج|أ?ورج\s*مصر|تسجيلات\s*(أفراح|الحظ)|معزوفات)/i;

const DRAMA_SCENE_JUNK =
  /(مشهد\s*من|مشاهد\s*من|لقطة\s*من|لقطات\s*من|كواليس|الحلقة\s*\d+|حلقة\s*\d+|ملخص\s*مسلسل|لحظة\s*(قبض|وفاة|مقتل|ضرب|انتقام|طلاق)|خناقة|مواجهة|أقوى\s*مشاهد)/i;

const OFFICIAL_SONG_OVERRIDE =
  /(تتر|شارة|أغنية|اغنية|كليب|فيديو\s*كليب|غناء|أداء|بصوت|audio|music\s*video|official)/i;

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
  "ابراهيم الحكمي", "إبراهيم الحكمي", "ابراهيم الحكمى", "إبراهيم الحكمى", "ibrahim al hakami", "ibrahim el hakami",
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

  // 1. Explicit Junk Media Pattern (Cartoons, Kids, Podcasts, Shorts, etc.)
  if (JUNK_MEDIA_PATTERN.test(haystack)) return true;

  // 2. Drama scene cuts (reject scene cuts, keep authentic soundtracks & TV theme songs!)
  if (DRAMA_SCENE_JUNK.test(haystack)) {
    if (!OFFICIAL_SONG_OVERRIDE.test(haystack)) return true;
    if (/(مشهد\s*من|لقطة\s*من|كواليس|لحظة\s*قبض|خناقة|مواجهة)/i.test(haystack)) return true;
  }

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
  words: string[],
  detectedArtist: string,
  detectedTitle: string
): number {
  let score = 0;
  const rawTitle = (song.title || "").toLowerCase();
  const rawArtist = (song.artist || "").toLowerCase();
  const combined = `${rawTitle} ${rawArtist}`;

  // Strict junk channel check
  if (/(تصوير\s*و?الليزر|تنظيم\s*الحفلات|مليونية|مواهب\s*الحظ|عفاريت\s*الحظ|استوديو\s*تصوير|فيديو\s*سيرفيس|عازف\s*أ?ورج|أ?ورج\s*مصر|تسجيلات\s*(أفراح|الحظ)|معزوفات)/i.test(combined)) {
    return -99999;
  }

  // 1. Dual Target Match (When user requested Title + Artist, e.g. "يا زين يا ولد الزين ابراهيم الحكمي")
  if (detectedArtist && detectedTitle) {
    const hasTitlePart = normTitle.includes(detectedTitle) || rawTitle.includes(detectedTitle);
    const hasArtistPart = normArtist.includes(detectedArtist) || normTitle.includes(detectedArtist) || rawArtist.includes(detectedArtist) || rawTitle.includes(detectedArtist);

    if (hasTitlePart && hasArtistPart) {
      score += 2500; // Overwhelming priority for correct song & requested artist
    } else if (hasTitlePart && !hasArtistPart) {
      if (/كفر|cover|أفراح|عازف|مهرجان|حفلة/i.test(combined)) {
        score -= 800;
      }
    } else if (!hasTitlePart && !hasArtistPart) {
      score -= 1500;
    }
  }

  // 2. Exact Title Match
  if (normTitle === cleanQ || latinTitle === latinQ) {
    score += 650;
  } else if (normTitle.startsWith(cleanQ) || latinTitle.startsWith(latinQ)) {
    score += 400;
  } else if (normTitle.includes(cleanQ) || latinTitle.includes(latinQ)) {
    score += 250;
  }

  // 3. Artist match
  if (normArtist.includes(cleanQ) || latinizeArtist(song.artist).toLowerCase().includes(latinQ)) {
    score += 180;
  }

  // 4. Official Release & Video Clip Indicators (Promote Official Video Clips to #1)
  const isVideoClip =
    rawTitle.includes("كليب") ||
    rawTitle.includes("فيديو كليب") ||
    rawTitle.includes("كليب رسمي") ||
    rawTitle.includes("official music video") ||
    rawTitle.includes("official video") ||
    rawTitle.includes("official clip");
  if (isVideoClip) score += 600;

  const isOfficial =
    rawTitle.includes("official") ||
    rawTitle.includes("audio") ||
    rawTitle.includes("رسمي") ||
    rawTitle.includes("الأصلية") ||
    rawTitle.includes("الاصلية") ||
    rawTitle.includes("تتر") ||
    rawTitle.includes("شارة") ||
    rawTitle.includes("مسلسل") ||
    rawArtist.includes("topic");
  if (isOfficial) score += 300;

  // 5. Established / Famous Artist Bonus
  if (isFamousArtist(song.artist)) score += 150;

  // 6. Popularity / View count
  if (song.viewCount && song.viewCount > 1000000) {
    score += Math.min(100, Math.floor(Math.log10(song.viewCount) * 15));
  }

  // 7. Token matching
  for (const w of words) {
    if (normTitle.includes(w) || latinTitle.includes(w)) score += 40;
    if (normArtist.includes(w)) score += 20;
  }

  // 8. Unofficial / Cover / Live / Karaoke Penalties (Do not penalize official singer attributions!)
  if (
    rawTitle.includes("remix") ||
    rawTitle.includes("ريمكس") ||
    rawTitle.includes("cover") ||
    rawTitle.includes("كفر") ||
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
    score -= 450;
  }

  return score;
}

/**
 * Ranks and orders search results so that the original, official studio release
 * appears as result #1, demoting covers, remixes, and fan uploads.
 */
export function rankSearchSongs(songs: Song[], rawQuery: string): Song[] {
  const normQuery = normalizeArabic(rawQuery);
  const cleanQ = stripSongNoise(normQuery);
  const latinQ = latinizeArtist(rawQuery).toLowerCase();

  // Detect artist and title intent
  let detectedArtist = "";
  let detectedTitle = "";

  for (const name of FAMOUS_ARTISTS) {
    const n = normalizeArabic(name);
    if (!n) continue;
    if (normQuery.startsWith(n + " ")) {
      detectedArtist = n;
      detectedTitle = normQuery.slice(n.length).trim();
      break;
    } else if (normQuery.endsWith(" " + n)) {
      detectedArtist = n;
      detectedTitle = normQuery.slice(0, normQuery.length - n.length).trim();
      break;
    }
  }

  const words = (detectedTitle || cleanQ).split(" ").filter((w) => w.length > 1);

  return [...songs].sort((a, b) => {
    const aNormTitle = normalizeArabic(stripSongNoise(a.title));
    const bNormTitle = normalizeArabic(stripSongNoise(b.title));

    const aNormArtist = normalizeArabic(a.artist);
    const bNormArtist = normalizeArabic(b.artist);

    const aLatinTitle = latinizeArtist(a.title).toLowerCase();
    const bLatinTitle = latinizeArtist(b.title).toLowerCase();

    const scoreA = calculateRelevance(a, aNormTitle, aNormArtist, aLatinTitle, cleanQ, normQuery, latinQ, words, detectedArtist, detectedTitle);
    const scoreB = calculateRelevance(b, bNormTitle, bNormArtist, bLatinTitle, cleanQ, normQuery, latinQ, words, detectedArtist, detectedTitle);

    return scoreB - scoreA;
  });
}
