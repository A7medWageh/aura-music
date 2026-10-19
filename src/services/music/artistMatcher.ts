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
  "warda al jazairia": "وردة",
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
};

export const UNWANTED_TERMS = [
  "cover",
  "كفر",
  "بصوت",
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
  "مشهد",
  "مسلسل",
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
      if (cleaned.includes(k) || k.includes(cleaned)) {
        arabic = v;
        break;
      }
    }
  }

  if (!latin) {
    for (const [k, v] of Object.entries(ARABIC_TO_LATIN_MAP)) {
      if (cleaned.includes(k) || k.includes(cleaned)) {
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

  const { arabic: reqAr, latin: reqLat } = getArtistForms(requestedArtist);
  const candClean = cleanText(candidateArtist);

  if (reqAr && (candClean.includes(reqAr) || reqAr.includes(candClean))) return true;
  if (reqLat && (candClean.includes(reqLat) || reqLat.includes(candClean))) return true;

  // Word-by-word token overlap
  const reqWords = cleanText(requestedArtist).split(" ").filter((w) => w.length > 2);
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

    if (rawChannel.includes("topic") || rawChannel.includes("vevo") || rawChannel.includes("official")) {
      score += 80;
    }

    // Major verified Arab and international labels
    if (/rotana|mazzika|nay\b|watary|melody|free music|sony music|universal music|warner/i.test(rawChannel)) {
      score += 120;
    }

    // 4. Official video/audio indicators in title
    if (/official (video|music video|audio)|فيديو كليب|كليب رسمي|الأغنية الرسمية|الأوديو الرسمي/i.test(rawTitle)) {
      score += 70;
    }

    // 5. Penalize third-party / fan channels
    if (/lyrics|حالات|قناة|تصميم|انطوائي|روميو/i.test(rawChannel)) {
      score -= 80;
    }

    // 6. Realistic song duration (between 1:45 and 7:30)
    const dur = c.durationSec || 0;
    if (dur >= 105 && dur <= 450) {
      score += 40;
    } else if (dur > 600) {
      // Long video / full album -> penalize heavily
      score -= 100;
    } else if (dur > 0 && dur < 60) {
      // Short / teaser -> reject
      score -= 200;
    }

    if (score > bestScore) {
      bestScore = score;
      bestVid = vid;
    }
  }

  return bestVid;
}
