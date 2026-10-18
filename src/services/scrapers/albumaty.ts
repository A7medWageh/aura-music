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

async function extractDirectMp3(songId: string): Promise<string | null> {
  try {
    const dlRes = await fetch(`https://www.albumaty.com/download/${songId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(5000),
    });
    if (!dlRes.ok) return null;
    const dlHtml = await dlRes.text();
    const $dl = cheerio.load(dlHtml);
    const directMp3 = $dl('a[href*=".mp3"]').attr("href");
    if (!directMp3) return null;

    // Validate that the MP3 URL is alive and does not return 404
    try {
      const probeRes = await fetch(directMp3, {
        method: "HEAD",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Referer": "https://www.albumaty.com/",
        },
        signal: AbortSignal.timeout(2500),
      });
      if (probeRes.ok || probeRes.status === 206) {
        return directMp3;
      }
    } catch {}

    return null;
  } catch {
    return null;
  }
}

/**
 * Albumaty Search & Resolve
 * Highly accurate direct 320kbps MP3 resolver for Arabic music.
 * Combines full-text search with singer directory scanning.
 */
export async function resolveAlbumatyStream(title: string, artist: string): Promise<string | null> {
  try {
    const rawTitle = title.trim();
    const rawArtist = (artist || "").trim();

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

    const normTargetSong = cleanNorm(resolvedTitle);
    const normTargetArtist = cleanNorm(resolvedArtist);

    // ── Strategy A: Search API (Fastest & matches standalone singles) ─────────
    const searchTerms: string[] = [resolvedTitle];
    if (resolvedArtist && resolvedArtist.length >= 3) {
      searchTerms.unshift(`${resolvedArtist} ${resolvedTitle}`);
    }

    for (const term of searchTerms) {
      try {
        const res = await fetch(`https://www.albumaty.com/search.php?q=${encodeURIComponent(term)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) continue;
        const html = await res.text();
        const $ = cheerio.load(html);

        let bestSongId: string | null = null;
        let bestScore = 0;

        $('a[href*="/song/"]').each((_, el) => {
          const text = $(el).text().trim();
          const href = $(el).attr("href") || "";
          const m = href.match(/\/song\/(\d+)\.html/);
          if (!m) return;
          const sId = m[1];
          const normText = cleanNorm(text);

          let score = 0;
          if (normText === normTargetSong) {
            score = 100;
          } else if (normTargetArtist && (normText === `${normTargetArtist}${normTargetSong}` || normText === `${normTargetSong}${normTargetArtist}`)) {
            score = 100;
          } else if (normTargetSong.length >= 4 && (normText.startsWith(normTargetSong) || normText.includes(normTargetSong))) {
            if (!normTargetArtist || normText.includes(normTargetArtist)) {
              score = 90;
            }
          }

          if (score > bestScore && score >= 90) {
            bestScore = score;
            bestSongId = sId;
          }
        });

        if (bestSongId) {
          const mp3 = await extractDirectMp3(bestSongId);
          if (mp3) {
            console.log(`[Albumaty] ✅ Search resolved direct MP3 for "${rawTitle}": ${mp3}`);
            streamCache.set(cacheKey, { url: mp3, expiresAt: Date.now() + STREAM_TTL });
            return mp3;
          }
        }
      } catch (err: any) {
        console.warn(`[Albumaty] Search failed for term "${term}":`, err.message);
      }
    }

    // ── Strategy B: Singer Directory Fallback ─────────────────────────────────
    if (resolvedArtist) {
      const singers = await getAlbumatySingers();

      let matchedSinger = singers.find(
        s => s.norm === normTargetArtist || s.norm.includes(normTargetArtist) || (normTargetArtist.length >= 4 && normTargetArtist.includes(s.norm))
      );

      if (!matchedSinger) {
        const words = resolvedArtist.split(/\s+/).map(cleanNorm).filter(w => w.length >= 3);
        if (words.length > 0) {
          matchedSinger = singers.find(s => words.every(w => s.norm.includes(w)));
        }
      }

      if (matchedSinger) {
        console.log(`[Albumaty] Matched singer in directory: "${matchedSinger.name}" (${matchedSinger.href})`);
        const singerRes = await fetch(matchedSinger.href, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(6000),
        });

        if (singerRes.ok) {
          const singerHtml = await singerRes.text();
          const $ = cheerio.load(singerHtml);

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

            if (normTargetSong.length >= 4 && (normSTitle.startsWith(normTargetSong) || normSTitle.includes(normTargetSong))) {
              if (90 > bestScore) {
                bestScore = 90;
                bestSongHref = href;
              }
            }
          });

          if (bestSongHref) {
            const match = (bestSongHref as string).match(/\/song\/(\d+)\.html/);
            if (match) {
              const mp3 = await extractDirectMp3(match[1]);
              if (mp3) {
                console.log(`[Albumaty] ✅ Directory resolved direct MP3 for "${rawTitle}": ${mp3}`);
                streamCache.set(cacheKey, { url: mp3, expiresAt: Date.now() + STREAM_TTL });
                return mp3;
              }
            }
          }
        }
      }
    }

    return null;
  } catch (err: any) {
    console.warn(`[Albumaty] Resolution failed for "${title}":`, err.message);
    return null;
  }
}
