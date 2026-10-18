import * as cheerio from "cheerio";

function stripTashkeel(s: string): string {
  return (s || "")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/[يى]/g, "ي")
    .replace(/[ةه]/g, "ه")
    .toLowerCase()
    .trim();
}

function cleanNorm(s: string): string {
  return stripTashkeel(s)
    .replace(/[^\u0600-\u06FFa-z0-9]/g, "")
    .trim();
}

// Common transliterations mapping for Arabic artists
const ARTIST_NAME_MAP: Record<string, string> = {
  "tamer hosny": "تامر حسني",
  "tamer hosni": "تامر حسني",
  "ramy sabry": "رامي صبري",
  "ramy sabri": "رامي صبري",
  "amr diab": "عمرو دياب",
  "mohamed hamaki": "محمد حماقي",
  "hamaki": "محمد حماقي",
  "sherine": "شيرين",
  "angham": "انغام",
  "bahaa sultan": "بهاء سلطان",
  "wegz": "ويجز",
  "marwan pablo": "مروان بابلو",
  "marwan moussa": "مروان موسى",
  "cairokee": "كايروكي",
  "hamza namira": "حمزة نمرة",
  "ahmed saad": "احمد سعد",
  "hussain al jassmi": "حسين الجسمي",
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
};

// Common transliterated song titles
const SONG_TITLE_MAP: Record<string, string> = {
  "ya ta3ebny": "يا تاعبني",
  "ya taabeny": "يا تاعبني",
  "fi eih": "في ايه",
  "fe eh": "في ايه",
  "nour el ein": "نور العين",
  "tamally maak": "تملي معاك",
  "el bakht": "البخت",
  "ya layly": "يا ليلي",
  "sahby ya sahby": "صاحبي يا صاحبي",
  "ghar el amar": "غار القمر",
  "ghalban": "غلبان",
  "shokran": "شكرا",
  "enta eh": "انت ايه",
};

interface CachedSinger {
  name: string;
  norm: string;
  href: string;
}

let singersCache: CachedSinger[] | null = null;
let singersCacheExpiresAt = 0;
const SINGERS_TTL = 24 * 60 * 60 * 1000; // 24 hours

const streamCache = new Map<string, { url: string; expiresAt: number }>();
const STREAM_TTL = 60 * 60 * 1000; // 1 hour

async function getAlbumatySingers(): Promise<CachedSinger[]> {
  if (singersCache && Date.now() < singersCacheExpiresAt) {
    return singersCache;
  }

  try {
    const res = await fetch("https://www.albumaty.com/cat/1.html", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return singersCache || [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const list: CachedSinger[] = [];

    $('a[href*="/singer/"]').each((_, el) => {
      const raw = $(el).text().replace(/اغاني/g, "").trim();
      const href = $(el).attr("href") || "";
      if (raw && raw.length >= 2 && href) {
        list.push({
          name: raw,
          norm: cleanNorm(raw),
          href: href.startsWith("http") ? href : `https://www.albumaty.com${href}`,
        });
      }
    });

    if (list.length > 0) {
      singersCache = list;
      singersCacheExpiresAt = Date.now() + SINGERS_TTL;
      console.log(`[Albumaty] Cached ${list.length} singers from directory.`);
    }

    return singersCache || [];
  } catch (err: any) {
    console.warn("[Albumaty] Failed to load singers directory:", err.message);
    return singersCache || [];
  }
}

/**
 * Albumaty Search & Resolve
 * Highly accurate direct 320kbps MP3 resolver for Arabic music.
 */
export async function resolveAlbumatyStream(title: string, artist: string): Promise<string | null> {
  try {
    const rawTitle = title.trim();
    const rawArtist = artist.trim();

    if (!rawTitle) return null;

    const cacheKey = `${rawTitle}___${rawArtist}`.toLowerCase();
    const cached = streamCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    // 1. Resolve artist and title names (translating Franco if present)
    const lowerArtist = rawArtist.toLowerCase();
    const resolvedArtist = ARTIST_NAME_MAP[lowerArtist] || rawArtist;

    const lowerTitle = rawTitle.toLowerCase();
    const resolvedTitle = SONG_TITLE_MAP[lowerTitle] || rawTitle
      .replace(/\(.*?\)|\[.*?\]/g, "")
      .replace(/ريد\s*بُ?ل\s*مزيكا\s*صالونات/gi, "")
      .replace(/ريد\s*بُ?ل\s*سيكا/gi, "")
      .replace(/فيديو\s*كليب/gi, "")
      .replace(/كليب\s*رسمي/gi, "")
      .replace(/الأغنية\s*الرسمية/gi, "")
      .trim();

    const singers = await getAlbumatySingers();

    // 2. Find matching singer
    const normTargetArtist = cleanNorm(resolvedArtist);
    let matchedSinger = singers.find(
      s => s.norm === normTargetArtist || s.norm.includes(normTargetArtist) || (normTargetArtist.length >= 4 && normTargetArtist.includes(s.norm))
    );

    if (!matchedSinger && resolvedArtist) {
      const words = resolvedArtist.split(/\s+/).map(cleanNorm).filter(w => w.length >= 3);
      if (words.length > 0) {
        matchedSinger = singers.find(s => words.every(w => s.norm.includes(w)));
      }
    }

    if (!matchedSinger) {
      console.log(`[Albumaty] Singer not found in directory for "${resolvedArtist}"`);
      return null;
    }

    console.log(`[Albumaty] Matched singer: "${matchedSinger.name}" (${matchedSinger.href})`);

    // 3. Fetch singer page to get song list
    const singerRes = await fetch(matchedSinger.href, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(6000),
    });
    if (!singerRes.ok) return null;

    const singerHtml = await singerRes.text();
    const $ = cheerio.load(singerHtml);

    const normTargetSong = cleanNorm(resolvedTitle);
    const songWords = resolvedTitle.split(/[\s\-–—|/]+/).map(cleanNorm).filter(w => w.length >= 2);

    let bestSongHref: string | null = null;
    let bestScore = 0;

    $('a[href*="/song/"]').each((_, el) => {
      const sTitle = $(el).text().trim();
      const href = $(el).attr("href") || "";
      const normSTitle = cleanNorm(sTitle);

      if (normSTitle === normTargetSong) {
        bestSongHref = href;
        bestScore = 100;
        return false;
      }

      let score = 0;
      if (normSTitle.includes(normTargetSong) || (normTargetSong.length >= 4 && normTargetSong.includes(normSTitle))) {
        score = 85;
      } else {
        const matchedCount = songWords.filter(w => normSTitle.includes(w)).length;
        if (matchedCount > 0) {
          score = (matchedCount / songWords.length) * 70;
        }
      }

      if (score > bestScore && score >= 50) {
        bestScore = score;
        bestSongHref = href;
      }
    });

    if (!bestSongHref) {
      console.log(`[Albumaty] Song "${resolvedTitle}" not found on singer page`);
      return null;
    }

    const match = (bestSongHref as string).match(/\/song\/(\d+)\.html/);
    if (!match) return null;
    const songId = match[1];

    // 4. Fetch download page
    const dlRes = await fetch(`https://www.albumaty.com/download/${songId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(5000),
    });
    if (!dlRes.ok) return null;

    const dlHtml = await dlRes.text();
    const $dl = cheerio.load(dlHtml);
    const directMp3 = $dl('a[href*=".mp3"]').attr("href");

    if (directMp3) {
      console.log(`[Albumaty] ✅ Resolved direct MP3 for "${rawTitle}" by "${rawArtist}": ${directMp3}`);
      streamCache.set(cacheKey, { url: directMp3, expiresAt: Date.now() + STREAM_TTL });
      return directMp3;
    }

    return null;
  } catch (err: any) {
    console.warn(`[Albumaty] Resolution failed for "${title}":`, err.message);
    return null;
  }
}
