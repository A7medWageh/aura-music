/**
 * artistMatcher.ts
 * ─────────────────
 * High-precision artist and track matching engine.
 * Ensures the system retrieves strictly the ORIGINAL master tracks,
 * rejecting covers, fan edits, third-party remakes, and unrelated singers.
 */

export const BILINGUAL_ARTIST_MAP: Record<string, string> = {
  // Latin -> Arabic
  "amr diab": "عمرو دياب",
  "amr diab topic": "عمرو دياب",
  "tamer hosny": "تامر حسني",
  "tamer hosni": "تامر حسني",
  "ramy sabry": "رامي صبري",
  "ramy sabri": "رامي صبري",
  "mohamed hamaki": "محمد حماقي",
  "hamaki": "محمد حماقي",
  "sherine": "شيرين",
  "sherine abdel wahab": "شيرين",
  "angham": "انغام",
  "bahaa sultan": "بهاء سلطان",
  "wegz": "ويجز",
  "marwan pablo": "مروان بابلو",
  "marwan moussa": "مروان موسى",
  "cairokee": "كايروكي",
  "hamza namira": "حمزة نمرة",
  "ahmed saad": "احمد سعد",
  "hussain al jassmi": "حسين الجسمي",
  "hussain aljassmi": "حسين الجسمي",
  "elissa": "اليسا",
  "nancy ajram": "نانسي عجرم",
  "nancy agram": "نانسي عجرم",
  "george wassouf": "جورج وسوف",
  "tul8te": "تووليت",
  "rubi": "روبي",
  "ruby": "روبي",
  "tamer ashour": "تامر عاشور",
  "mahmoud el leithy": "محمود الليثي",
  "hassan shakosh": "حسن شاكوش",
  "omar kamal": "عمر كمال",
  "assala": "اصالة",
  "asala": "اصالة",
  "assala nasri": "اصالة",
  "wael kfoury": "وائل كفوري",
  "mohamed mounir": "محمد منير",
  "mounir": "محمد منير",
  "hakim": "حكيم",
  "mostafa amar": "مصطفى قمر",
  "ehab tawfik": "ايهاب توفيق",
  "kazem al saher": "كاظم الساهر",
  "kadim al sahir": "كاظم الساهر",
  "saber rebai": "صابر الرباعي",
  "ragheb alama": "راغب علامة",
  "carole samaha": "كارول سماحة",
  "myriam fares": "ميريام فارس",
  "nawal al zoghbi": "نوال الزغبي",
  "fayrouz": "فيروز",
  "fairuz": "فيروز",
  "om kalthoum": "ام كلثوم",
  "oum kalthoum": "ام كلثوم",
  "umm kulthum": "ام كلثوم",
  "abdel halim hafez": "عبد الحليم حافظ",
  "abdel halim": "عبد الحليم حافظ",
  "farid al atrache": "فريد الاطرش",
  "warda": "وردة",
  "abyusif": "ابيوسف",
  "seif magdy": "سيف مجدي",
  "jannat": "جنات",
  "jannat topic": "جنات",
  "janat": "جنات",
  "wael jassar": "وائل جسار",
  "wael gassar": "وائل جسار",
  "hamada majrashi": "حماده مجرشي",
  "hamada magrashi": "حماده مجرشي",
  "hossam habib": "حسام حبيب",
  "hossam habib topic": "حسام حبيب",
  "houssam habib": "حسام حبيب",
  "majid al mohandis": "ماجد المهندس",
  "majed al mohandis": "ماجد المهندس",
  "majid almohandis": "ماجد المهندس",
  "majed almohandis": "ماجد المهندس",
  "ibrahim al hakami": "ابراهيم الحكمي",
  "ibrahim el hakami": "ابراهيم الحكمي",
  "ibrahim alhakami": "ابراهيم الحكمي",
  "ibrahim elhakami": "ابراهيم الحكمي",
  "ibrahim al-hakami": "ابراهيم الحكمي",
  "ibrahim el-hakami": "ابراهيم الحكمي",
};

// Build reverse map (Arabic -> Latin primary)
export const ARABIC_TO_LATIN_MAP: Record<string, string> = {
  "عمرو دياب": "amr diab",
  "تامر حسني": "tamer hosny",
  "رامي صبري": "ramy sabry",
  "محمد حماقي": "hamaki",
  "شيرين": "sherine",
  "انغام": "angham",
  "بهاء سلطان": "bahaa sultan",
  "ويجز": "wegz",
  "مروان بابلو": "marwan pablo",
  "مروان موسى": "marwan moussa",
  "كايروكي": "cairokee",
  "حمزة نمرة": "hamza namira",
  "احمد سعد": "ahmed saad",
  "حسين الجسمي": "hussain al jassmi",
  "اليسا": "elissa",
  "نانسي عجرم": "nancy ajram",
  "جورج وسوف": "george wassouf",
  "تووليت": "tul8te",
  "روبي": "ruby",
  "تامر عاشور": "tamer ashour",
  "اصالة": "assala",
  "وائل كفوري": "wael kfoury",
  "محمد منير": "mohamed mounir",
  "حكيم": "hakim",
  "مصطفى قمر": "mostafa amar",
  "ايهاب توفيق": "ehab tawfik",
  "كاظم الساهر": "kazem al saher",
  "صابر الرباعي": "saber rebai",
  "راغب علامة": "ragheb alama",
  "كارول سماحة": "carole samaha",
  "ميريام فارس": "myriam fares",
  "فيروز": "fairuz",
  "ام كلثوم": "om kalthoum",
  "عبد الحليم حافظ": "abdel halim hafez",
  "فريد الاطرش": "farid al atrache",
  "وردة": "warda",
  "ابيوسف": "abyusif",
  "أبيوسف": "abyusif",
  "جنات": "jannat",
  "وائل جسار": "wael jassar",
  "حماده مجرشي": "hamada majrashi",
  "حمادة مجرشي": "hamada majrashi",
  "حسام حبيب": "hossam habib",
  "ماجد المهندس": "majid al mohandis",
  "ابراهيم الحكمي": "ibrahim al hakami",
  "إبراهيم الحكمي": "ibrahim al hakami",
  "ابراهيم الحكمى": "ibrahim al hakami",
  "إبراهيم الحكمى": "ibrahim al hakami",
};

export const UNWANTED_TERMS = [
  "cover",
  "كفر",
  "تقليد",
  "غناء سارة",
  "remix",
  "ريمكس",
  "ميكس",
  "remaster",
  "ريماستر",
  "slowed",
  "مبطأ",
  "مسرع",
  "speed up",
  "sped up",
  "nightcore",
  "karaoke",
  "كاريوكي",
  "موسيقى فقط",
  "بدون صوت",
  "instrumental",
  "عزف",
  "reaction",
  "ردة فعل",
  "رياكشن",
  "حالة واتس",
  "حالات واتس",
  "ستوري",
  "مشهد من",
  "مشاهد من",
  "لقطة من",
  "كواليس مسلسل",
  "ملخص مسلسل",
  "تيك توك",
  "tiktok",
  "tribute",
];

export function cleanText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/[\u064B-\u065F\u0670]/g, "") // Tashkeel
    .replace(/\s*-\s*topic\b/gi, "")
    .replace(/\s*vevo\b/gi, "")
    .replace(/\s*official\b/gi, "")
    .replace(/\s*channel\b/gi, "")
    .replace(/\s*records\b/gi, "")
    .replace(/\s*music\b/gi, "")
    .replace(/\s*قناة\s*رسمية/gi, "")
    .replace(/[^a-z0-9\u0621-\u064A\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns canonical Arabic and Latin forms of an artist name
 */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * True when both phrases have the same number of tokens and every token of the
 * dictionary key has a near-identical counterpart — absorbs transliteration
 * variants like "Abdel Haleem Hafiz" vs key "abdel halim hafez" while refusing
 * different-length names (e.g. "Hamada" must not match "Mohamed Hamaki").
 */
function fuzzyTokenMatch(phrase: string, key: string): boolean {
  const pt = phrase.split(" ").filter(Boolean);
  const kt = key.split(" ").filter(Boolean);
  if (!pt.length || pt.length !== kt.length) return false;
  return kt.every((k) =>
    pt.some((p) => editDistance(p, k) <= (Math.max(p.length, k.length) >= 6 ? 2 : 1))
  );
}

export function getArtistForms(artistName: string): { arabic: string; latin: string } {
  const cleaned = cleanText(artistName);
  let arabic = "";
  let latin = "";

  if (/[\u0600-\u06FF]/.test(cleaned)) {
    arabic = cleaned;
    latin = ARABIC_TO_LATIN_MAP[cleaned] || "";
  } else {
    latin = cleaned;
    arabic = BILINGUAL_ARTIST_MAP[cleaned] || "";
  }

  // Partial dictionary lookup for compound names (e.g. "Amr Diab Live")
  if (!arabic) {
    for (const [k, v] of Object.entries(BILINGUAL_ARTIST_MAP)) {
      if (cleaned.includes(k) || k.includes(cleaned) || fuzzyTokenMatch(cleaned, k)) {
        arabic = v;
        break;
      }
    }
  }

  if (!latin) {
    for (const [k, v] of Object.entries(ARABIC_TO_LATIN_MAP)) {
      if (cleaned.includes(k) || k.includes(cleaned) || fuzzyTokenMatch(cleaned, k)) {
        latin = v;
        break;
      }
    }
  }

  return { arabic: cleanText(arabic), latin: cleanText(latin) };
}

/**
 * Validates if candidate artist matches the requested artist with high confidence
 */
export function isStrictArtistMatch(requestedArtist: string, candidateArtist: string): boolean {
  if (!requestedArtist || requestedArtist === "فنان" || requestedArtist === "فنان غير معروف") {
    return true; // No artist filter specified
  }
  if (!candidateArtist || candidateArtist === "فنان" || candidateArtist === "فنان غير معروف") {
    return false;
  }

  const { arabic: reqAr, latin: reqLat } = getArtistForms(requestedArtist);
  const { arabic: candAr, latin: candLat } = getArtistForms(candidateArtist);
  const candClean = cleanText(candidateArtist);
  const reqClean = cleanText(requestedArtist);

  if (reqAr && candAr && (reqAr === candAr || candAr.includes(reqAr) || reqAr.includes(candAr))) return true;
  if (reqLat && candLat && (reqLat === candLat || candLat.includes(reqLat) || reqLat.includes(candLat))) return true;
  if (reqAr && (candClean.includes(reqAr) || reqAr.includes(candClean))) return true;
  if (reqLat && (candClean.includes(reqLat) || reqLat.includes(candClean))) return true;
  if (candAr && (reqClean.includes(candAr) || candAr.includes(reqClean))) return true;
  if (candLat && (reqClean.includes(candLat) || candLat.includes(reqClean))) return true;

  // Word-by-word token overlap
  const reqWords = reqClean.split(" ").filter((w) => w.length > 2);
  const candWords = candClean.split(" ").filter((w) => w.length > 2);

  if (reqWords.length > 0 && reqWords.some((w) => candWords.includes(w))) {
    return true;
  }

  return false;
}

/**
 * Checks if a candidate title contains unwanted tags (remix, cover, slowed, etc.)
 * unless the original query specifically asked for them.
 */
export function hasUnwantedTags(candidateTitle: string, requestedQuery: string): boolean {
  const normCand = (candidateTitle || "").toLowerCase();
  const normQuery = (requestedQuery || "").toLowerCase();

  for (const term of UNWANTED_TERMS) {
    if (!normQuery.includes(term) && normCand.includes(term)) {
      return true; // Unwanted tag found!
    }
  }

  return false;
}

/**
 * Selects the absolute best, most official YouTube video for a given track
 */
export function findBestOfficialVideo(
  candidates: Array<{
    youtubeVideoId: string;
    title: string;
    artist?: string;
    channel?: string;
    durationSec?: number;
  }>,
  requestedTitle: string,
  requestedArtist: string
): string | null {
  const normTitle = cleanText(requestedTitle);
  const normArtist = cleanText(requestedArtist);
  const titleWords = normTitle.split(" ").filter((w) => w.length > 1);
  const { arabic: arArtist, latin: latArtist } = getArtistForms(requestedArtist);

  let bestVid: string | null = null;
  let bestScore = -9999;

  for (const c of candidates) {
    const vid = c.youtubeVideoId;
    if (!vid || !/^[a-zA-Z0-9_-]{11}$/.test(vid)) continue;

    const rawTitle = (c.title || "").toLowerCase();
    const rawChannel = (c.channel || c.artist || "").toLowerCase();
    const fullText = cleanText(`${rawTitle} ${rawChannel}`);

    // 1. Must contain all essential title words
    const titleMatches = titleWords.length > 0 && titleWords.every((w) => fullText.includes(w));
    if (!titleMatches) continue;

    // 2. Reject unwanted covers, fan remixes, slowed down, karaoke, reaction videos
    if (hasUnwantedTags(rawTitle, `${requestedTitle} ${requestedArtist}`)) {
      continue;
    }

    let score = 0;

    // 3. Channel verification
    const channelClean = cleanText(rawChannel);
    const artistMatches =
      (arArtist && channelClean.includes(arArtist)) ||
      (latArtist && channelClean.includes(latArtist)) ||
      (normArtist && channelClean.includes(normArtist));

    if (artistMatches) {
      score += 150; // Official artist channel!
    }

    if (rawChannel.includes("topic")) {
      score += 220; // Official YouTube Music pristine studio audio master! Zero video dialogue or empty silence.
    } else if (rawChannel.includes("vevo") || rawChannel.includes("official")) {
      score += 80;
    }

    // Major verified Arab and international labels
    if (/rotana|mazzika|nay\b|watary|melody|free music|sony music|universal music|warner/i.test(rawChannel)) {
      score += 120;
    }

    // 4. Official audio & video clip indicators
    if (/official\s*(audio|video|clip)|الأوديو الرسمي|النسخة الأصلية|original audio|فيديو\s*كليب|كليب\s*رسمي|music\s*video|تتر\s*مسلسل|أغنية\s*مسلسل/i.test(rawTitle)) {
      score += 200; // Pure official release (clip or studio audio)
    } else if (/short film|فيلم قصير|مشهد\s*من|كواليس|ملخص/i.test(rawTitle)) {
      score -= 250; // Penalize non-song theatrical sketches and scenes
    }

    // 5. Penalize third-party / fan channels
    if (/lyrics|حالات|قناة|تصميم|انطوائي|روميو/i.test(rawChannel)) {
      score -= 100;
    }

    // 6. Realistic song duration (normal songs are 2:00 to 5:30)
    const dur = c.durationSec || 0;
    if (dur >= 120 && dur <= 330) {
      score += 70; // Ideal pristine song length
    } else if (dur > 330 && dur <= 420) {
      score += 15;
    } else if (dur > 420 && dur <= 480) {
      // Long video (over 7 minutes) -> penalize heavily
      score -= 350;
    } else if (dur > 480) {
      // Extremely long video (over 8 minutes) -> Reject! (Often compilation or video clip with dead silence)
      continue;
    } else if (dur > 0 && dur < 75) {
      // Teaser / snippet -> Reject!
      continue;
    }

    if (score > bestScore) {
      bestScore = score;
      bestVid = vid;
    }
  }

  return bestVid;
}

const GENERIC_CHANNELS_REGEX =
  /shaabeyat|شعبيات|mazzika|مزيكا|rotana|روتانا|nogoum|نجوم|naghmaty|نغماتي|noghmati|weci|wecibot|modern\s*music|مودرن|free\s*music|فري\s*ميوزيك|craft\s*media|كرافت|watary|وتري|elsobky|sobky|السبكي|haz\s*shaby|حظ\s*شعب|عالم\s*الفن|alam\s*el\s*phan|replay\s*music|sony\s*music|universal\s*music|warner\s*music|melody|ميلودي|قناة|channel|records|music|official|vevo|فنان|unknown|غير\s*معروف/i;

function cleanVideoClutter(s: string): string {
  return (s || "")
    .replace(/\(Official.*?\)/gi, "")
    .replace(/\[Official.*?\]/gi, "")
    .replace(/\(Audio.*?\)/gi, "")
    .replace(/\[Audio.*?\]/gi, "")
    .replace(/\(Lyric.*?\)/gi, "")
    .replace(/\[Lyric.*?\]/gi, "")
    .replace(/\(Video.*?\)/gi, "")
    .replace(/\[Video.*?\]/gi, "")
    .replace(/\|\s*Official.*$/gi, "")
    .replace(/فيديو كليب/g, "")
    .replace(/كليب رسمي/g, "")
    .replace(/الأغنية الرسمية/g, "")
    .replace(/النسخة الأصلية|النسخة الاصلية/g, "")
    .replace(/HD Version/gi, "")
    .replace(/\b(202[0-9]|201[0-9])\b/g, "")
    .trim();
}

/**
 * Accurately extracts the real singing artist and clean track title
 * from YouTube video titles and channel metadata.
 */
export function extractSmartArtistAndTitle(
  rawTitle?: string,
  rawArtist?: string
): { title: string; artist: string } {
  let title = cleanVideoClutter(rawTitle || "");
  let artist = (rawArtist || "").trim();

  // If artist is generic or empty, strip it
  if (
    !artist ||
    artist === "فنان" ||
    artist === "فنان غير معروف" ||
    artist === "غير معروف" ||
    artist.toLowerCase().includes("unknown") ||
    artist === "Aura Music"
  ) {
    artist = "";
  }

  // 1. Detect 'غناء / أداء / بصوت' singer markers FIRST (most accurate Arabic singer attribution)
  const singerMatch = title.match(/(?:غناء|أداء|اداء|بصوت)\s*["“'«]?\s*([\u0621-\u064A]{2,}(?:\s+["“'«]?[\u0621-\u064A]{2,}){1,3})/i);
  if (singerMatch) {
    const candidateSinger = singerMatch[1].replace(/["“'«»”]/g, "").trim();
    if (!/مسلسل|تتر|أغنية|كليب|فيديو|حصريا|قناة|انتاج|توزيع|رسمي|جروب|group/i.test(candidateSinger)) {
      artist = candidateSinger;
      title = title.replace(singerMatch[0], "").trim();
    }
  }

  // 2. If title has pipe '|', parse out series, title, and artist intelligently
  if (title.includes("|")) {
    const parts = title.split("|").map((p) => p.trim()).filter(Boolean);
    const quotedPart = parts.find((p) => /["“'«][^"”'»]{3,}["”'»]/.test(p));
    const songPrefixedPart = parts.find((p) => /^(أغنية|اغنية)\s+/i.test(p));
    const seriesPart = parts.find((p) => /^(تتر|شارة|مسلسل)/i.test(p));
    const namedArtistPart = parts.find(
      (p) =>
        p !== quotedPart &&
        p !== songPrefixedPart &&
        p !== seriesPart &&
        !GENERIC_CHANNELS_REGEX.test(p) &&
        p.split(/\s+/).length >= 2 &&
        p.split(/\s+/).length <= 4 &&
        /[\u0600-\u06FF]/.test(p)
    );

    if (namedArtistPart && (!artist || GENERIC_CHANNELS_REGEX.test(artist))) {
      artist = namedArtistPart.replace(/["“'«»”]/g, "").trim();
    }

    if (quotedPart) {
      const qm = quotedPart.match(/["“'«]([^"”'»]+)["”'»]/);
      title = qm ? qm[1].trim() : quotedPart;
      if (seriesPart && !title.includes("مسلسل") && !title.includes("تتر")) {
        title = `${seriesPart} - ${title}`;
      }
    } else if (songPrefixedPart) {
      title = songPrefixedPart.replace(/^(أغنية|اغنية)\s*/i, "").replace(/["“'«»”]/g, "").trim();
      if (seriesPart && !title.includes("مسلسل") && !title.includes("تتر")) {
        title = `${seriesPart} - ${title}`;
      }
    } else if (seriesPart) {
      const seriesSubDashes = seriesPart.split(/[-–—]/).map((d) => d.trim()).filter(Boolean);
      const songInsideSeries = seriesSubDashes.find(
        (d) => !/^(تتر|مسلسل|غناء|أداء|بصوت)/i.test(d) && !GENERIC_CHANNELS_REGEX.test(d) && d.length >= 3
      );
      if (songInsideSeries) {
        title = `${seriesSubDashes[0]} - ${songInsideSeries}`;
      } else {
        const otherPart = parts.find(
          (p) => p !== seriesPart && p !== namedArtistPart && !GENERIC_CHANNELS_REGEX.test(p)
        );
        title = otherPart || seriesPart;
      }
    } else {
      const arPart = parts.find((p) => /[\u0600-\u06FF]/.test(p) && !GENERIC_CHANNELS_REGEX.test(p));
      title = arPart || parts[0] || title;
    }
  }

  // 3. Extract quotes if present anywhere in title
  const anyQuote = title.match(/["“'«]([^"”'»]{3,})["”'»]/);
  if (anyQuote) {
    const qText = anyQuote[1].trim();
    if (!/مسلسل|تتر|حصريا|جديد|كليب|فيديو/i.test(qText)) {
      const seriesPrefixMatch = title.match(/^(تتر\s+مسلسل\s+[^-–—|]+)/i);
      title = seriesPrefixMatch ? `${seriesPrefixMatch[1]} - ${qText}` : qText;
    }
  }

  // 4. If title ends with channel name (e.g. "... - محمد رمضان"), strip the redundant channel trailer
  if (rawArtist && title.includes("-")) {
    const cleanArt = cleanText(rawArtist);
    const lastDashIdx = title.lastIndexOf("-");
    if (lastDashIdx > 0) {
      const trailing = cleanText(title.slice(lastDashIdx + 1));
      if (trailing && (cleanArt.includes(trailing) || trailing.includes(cleanArt))) {
        title = title.slice(0, lastDashIdx).trim();
      }
    }
  }

  // Check 'كليب' pattern: 'احمد حسين كليب الدمعه صعبة'
  const clipMatch = title.match(/^([\u0621-\u064A\s]{2,25})\s+كليب\s+(.+)$/);
  if (clipMatch) {
    artist = clipMatch[1].trim();
    title = clipMatch[2].trim();
  }

  // Check 'ترند' pattern: 'ترند دنيا الالفي " الدمعه صعبه ... "'
  const trendMatch = title.match(/^ترند\s+([\u0621-\u064A\s]{2,25})\s+["“]?\s*([^"”\-\–\—\ـ]+)/);
  if (trendMatch) {
    artist = trendMatch[1].trim();
    title = trendMatch[2].trim();
  }

  // Check 'موال' pattern: 'موال الدمعه صعبه اسماعيل الليثي'
  const mawalMatch = title.match(/^موال\s+(.+)$/);
  if (mawalMatch) {
    const rest = mawalMatch[1].trim();
    const words = rest.split(/\s+/);
    if (words.length >= 3) {
      artist = words.slice(-2).join(" ");
      title = words.slice(0, -2).join(" ");
    } else {
      title = rest;
    }
  }

  // Check 'Artist - Title' or 'Title - Artist'
  if (title.includes("-") || title.includes("–") || title.includes("—")) {
    const parts = title.split(/[-–—]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) {
      const p0 = parts[0];
      const p1 = parts[1];

      const forms = artist ? getArtistForms(artist) : { arabic: "", latin: "" };
      const candForms0 = getArtistForms(p0);
      const candForms1 = getArtistForms(p1);

      const p0MatchesArtist =
        artist &&
        (isStrictArtistMatch(artist, p0) ||
          (forms.arabic && candForms0.arabic && forms.arabic === candForms0.arabic) ||
          (forms.latin && candForms0.latin && forms.latin === candForms0.latin));

      const p1MatchesArtist =
        artist &&
        (isStrictArtistMatch(artist, p1) ||
          (forms.arabic && candForms1.arabic && forms.arabic === candForms1.arabic) ||
          (forms.latin && candForms1.latin && forms.latin === candForms1.latin));

      if (p0MatchesArtist) {
        title = p1;
      } else if (p1MatchesArtist) {
        title = p0;
      } else if (!artist || GENERIC_CHANNELS_REGEX.test(artist)) {
        if (candForms0.latin) {
          artist = p0;
          title = p1;
        } else if (candForms1.latin) {
          artist = p1;
          title = p0;
        } else {
          // In Arabic songs, both "Artist - Title" and "Title - Artist" occur.
          // If p1 looks like a 2-3 word singer name (e.g. 'مصطفي محفوظ'):
          const p1Words = p1.split(/\s+/).filter(Boolean);
          if (p1Words.length >= 2 && p1Words.length <= 4 && !/اغنية|كليب|فيديو|حصريا|جديد|audio|video|lyrics/i.test(p1)) {
            artist = p1;
            title = p0;
          } else {
            artist = p0;
            title = p1;
          }
        }
      }
    }
  }

  // If title has a slash separating Arabic and English (e.g. 'اللي بيني وبينك / Elly Bene'), pick Arabic
  if (title.includes("/")) {
    const halves = title.split("/");
    const arabicHalf = halves.find((h) => /[\u0600-\u06FF]/.test(h));
    if (arabicHalf && arabicHalf.trim().length >= 2) {
      title = arabicHalf.trim();
    } else {
      title = halves[0].trim();
    }
  }

  // Clean trailing latin or subtitles in Arabic titles:
  // e.g. 'الدمعه صعبة AHMED HUSSEN - ELDAM3A SA3BA' -> 'الدمعه صعبة'
  if (/[\u0600-\u06FF]/.test(title)) {
    title = title.replace(/\s+[a-zA-Z0-9\s\-_–—]+$/, "").trim();
  }

  // Clean hashtags and extra quotes
  title = title
    .replace(/#([^\s]+)/g, (_, tag) => tag.replace(/_/g, " "))
    .replace(/^["“'«\s]+|["”'»\s]+$/g, "")
    .trim();

  // If artist was cleaned or empty, and title has no artist extracted, fallback gracefully
  if (GENERIC_CHANNELS_REGEX.test(artist) && !clipMatch && !trendMatch && !mawalMatch) {
    artist = "";
  }

  return {
    title: title || "أغنية محفوظة",
    artist: artist.trim(),
  };
}

/**
 * Validates whether candidate audio from a bot or scraper is a mismatch
 * (e.g. wrong singer, unwanted cover, or Khaleeji remake).
 */
export function isStrictArtistMismatch(
  expectedArtist: string | undefined,
  rowArtist: string | undefined,
  rowTitle: string | undefined
): boolean {
  if (!expectedArtist || expectedArtist === "فنان غير معروف" || expectedArtist === "Aura Music") {
    return false;
  }

  const cleanExp = expectedArtist.toLowerCase().trim();
  const rowArt = (rowArtist || "").toLowerCase().trim();
  const rowTit = (rowTitle || "").toLowerCase().trim();
  const fullRow = `${rowArt} ${rowTit}`;

  // If expected artist is present in full row, it's definitely NOT a mismatch
  if (fullRow.includes(cleanExp)) {
    return false;
  }
  const expWords = cleanExp.split(/\s+/).filter((w) => w.length > 2);
  if (expWords.length >= 2 && expWords.every((w) => fullRow.includes(w))) {
    return false;
  }

  // Reject non-Jannat
  if (cleanExp.includes("جنات") && !fullRow.includes("جنات") && !rowArt.includes("rotana") && !rowArt.includes("aura")) {
    return true;
  }
  // Reject non-Angham
  if (cleanExp.includes("أنغام") && !fullRow.includes("أنغام") && !rowArt.includes("rotana") && !rowArt.includes("aura")) {
    return true;
  }

  // Cross-cover mismatch:
  if (cleanExp.includes("احمد حسين") && (fullRow.includes("دنيا") || fullRow.includes("ليثي") || fullRow.includes("الليثي"))) {
    return true;
  }
  if (cleanExp.includes("دنيا") && fullRow.includes("احمد حسين") && !fullRow.includes("دنيا")) {
    return true;
  }
  if (cleanExp.includes("ليثي") && !fullRow.includes("ليثي")) {
    return true;
  }

  // If candidate title explicitly marks a cover by a different singer
  const coverSingerMatch = rowTit.match(/(?:بصوت|غناء|اداء|كفر|cover by)\s+([\u0621-\u064A\s]{3,20})/);
  if (coverSingerMatch) {
    const foundCoverSinger = coverSingerMatch[1].trim();
    if (!foundCoverSinger.includes(cleanExp) && !cleanExp.includes(foundCoverSinger)) {
      return true;
    }
  }

  return false;
}
