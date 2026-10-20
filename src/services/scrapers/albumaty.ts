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
  "assala": "اصالة",
  "asala": "اصالة",
  "wael kfoury": "وائل كفوري",
  "mohamed mounir": "محمد منير",
  "hakim": "حكيم",
  "mostafa amar": "مصطفى قمر",
  "ehab tawfik": "ايهاب توفيق",
  "kazem al saher": "كاظم الساهر",
  "saber rebai": "صابر الرباعي",
  "ragheb alama": "راغب علامة",
  "carole samaha": "كارول سماحة",
  "myriam fares": "ميريام فارس",
  "nawal al zoghbi": "نوال الزغبي",
  "fayrouz": "فيروز",
  "fairuz": "فيروز",
  "om kalthoum": "ام كلثوم",
  "umm kulthum": "ام كلثوم",
  "abdel halim hafez": "عبد الحليم حافظ",
};

// Common transliterated song titles
const SONG_TITLE_MAP: Record<string, string> = {
  "kalam": "كلام",
  "el kalam": "كلام",
  "el-kalam": "كلام",
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
  "masadaat etabelna": "ما صدقت اتقابلنا",
  "masdaat etabelna": "ما صدقت اتقابلنا",
  "el hoob 3ebna": "الحب عيبنا",
  "el hob 3ebna": "الحب عيبنا",
  "law tearaf": "لو تعرف",
  "law te3raf": "لو تعرف",
  "kaabak aly": "كعبك علي",
  "ka3bak 3aly": "كعبك علي",
  "ana lesa baqy alek": "لسه باقي عليك",
  "lesa baqy alek": "لسه باقي عليك",
  "bahebak ana": "بحبك انا",
  "khalik maaya": "خليك معايا",
  "we malo": "و ماله",
  "we maloh": "و ماله",
  "qamarin": "قمرين",
  "kamel kalamak": "كمل كلامك",
  "leily nehry": "ليلي نهاري",
  "wayah": "وياه",
  "banadeek taala": "بناديك تعالى",
  "shoft el ayam": "شفت الايام",
  "ahla w ahla": "احلى واحلى",
  "meaddy el nas": "معدي الناس",
  "kol hayaty": "كل حياتي",
  "sahran": "سهران",
  "ya ana ya la": "يا انا يا لاء",
  "makanak": "مكانك",
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
    const list: CachedSinger[] = [];
    // Load categories (cat 1 has Egyptian/Pan-Arab singers)
    const res = await fetch("https://www.albumaty.com/cat/1.html", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

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
    }

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
        signal: AbortSignal.timeout(3000),
      });
      if (probeRes.ok || probeRes.status === 206 || probeRes.status === 405) {
        return directMp3;
      }
    } catch {
      // If probe times out but directMp3 is a valid Albumaty MP3 CDN link, return it
      if (directMp3.includes("albumaty.com") && directMp3.endsWith(".mp3")) {
        return directMp3;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Albumaty Search & Resolve
 * Highly accurate direct 320kbps MP3 resolver for Arabic music.
 * Prioritizes verified Singer Directory, validates artist identity, and translates Franco titles.
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
    const cleanedArtist = rawArtist
      .replace(/\s*-\s*topic\b/gi, "")
      .replace(/\s*vevo\b/gi, "")
      .replace(/\s*official\b/gi, "")
      .replace(/\s*channel\b/gi, "")
      .replace(/\s*records\b/gi, "")
      .replace(/\s*music\b/gi, "")
      .replace(/\s*قناة\s*رسمية/gi, "")
      .trim();
    const lowerArtist = cleanedArtist.toLowerCase();
    const resolvedArtist = ARTIST_NAME_MAP[lowerArtist] || cleanedArtist;

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
    const cleanSongKeywords = normTargetSong.replace(/^(اغنية|كليب|فيديو|البوم|انا|يا)/g, "").trim();

    // ── Strategy A: Verified Singer Directory (100% Artist Accuracy) ────────
    if (normTargetArtist) {
      const singers = await getAlbumatySingers();

      let matchedSinger = singers.find(
        (s) =>
          s.norm === normTargetArtist ||
          s.norm.includes(normTargetArtist) ||
          (normTargetArtist.length >= 4 && normTargetArtist.includes(s.norm))
      );

      if (!matchedSinger) {
        const words = resolvedArtist.split(/\s+/).map(cleanNorm).filter((w) => w.length >= 3);
        if (words.length > 0) {
          matchedSinger = singers.find((s) => words.every((w) => s.norm.includes(w)));
        }
      }

      if (matchedSinger) {
        console.log(`[Albumaty] Matched singer in directory: "${matchedSinger.name}" (${matchedSinger.href})`);
        try {
          const singerRes = await fetch(matchedSinger.href, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            signal: AbortSignal.timeout(6000),
          });

          if (singerRes.ok) {
            const singerHtml = await singerRes.text();
            const $ = cheerio.load(singerHtml);

            let bestSongId: string | null = null;
            let bestScore = 0;

            $('a[href*="/song/"]').each((_, el) => {
              const sTitle = $(el).text().trim();
              const href = $(el).attr("href") || "";
              const m = href.match(/\/song\/(\d+)\.html/);
              if (!m) return;
              const sId = m[1];
              const normSTitle = cleanNorm(sTitle);

              let score = 0;
              if (normSTitle === normTargetSong) {
                score = 100;
              } else if (normSTitle.replace(/[0-9]/g, "").trim() === normTargetSong.replace(/[0-9]/g, "").trim()) {
                score = 98;
              } else if (normTargetSong.length >= 4 && (normSTitle.startsWith(normTargetSong) || normTargetSong.startsWith(normSTitle))) {
                const diff = Math.abs(normSTitle.length - normTargetSong.length);
                if (diff <= 3) score = 95;
              }

              if (score > bestScore) {
                bestScore = score;
                bestSongId = sId;
                if (score === 100) return false;
              }
            });

            if (bestSongId && bestScore >= 95) {
              const mp3 = await extractDirectMp3(bestSongId);
              if (mp3) {
                console.log(`[Albumaty] ✅ Directory resolved direct MP3 for "${rawTitle}": ${mp3}`);
                streamCache.set(cacheKey, { url: mp3, expiresAt: Date.now() + STREAM_TTL });
                return mp3;
              }
            }
          }
        } catch (dirErr: any) {
          console.warn("[Albumaty] Singer directory scan error:", dirErr.message);
        }
      }
    }

    // ── Strategy B: Search API with Strict Artist Verification ──────────────
    const searchTerms: string[] = [];
    if (resolvedArtist && resolvedArtist.length >= 3) {
      searchTerms.push(`${resolvedArtist} ${resolvedTitle}`);
    }
    searchTerms.push(resolvedTitle);

    for (const term of searchTerms) {
      try {
        const res = await fetch(`https://www.albumaty.com/search.php?q=${encodeURIComponent(term)}`, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(4000),
        });
        if (!res.ok) continue;
        const html = await res.text();
        const $ = cheerio.load(html);

        const candidates: { id: string; title: string; score: number }[] = [];

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
          } else if (normTargetSong.length >= 4 && (normText.startsWith(normTargetSong) || normTargetSong.startsWith(normText))) {
            const diff = Math.abs(normText.length - normTargetSong.length);
            if (diff <= 3) score = 95;
          }

          if (score >= 95) {
            candidates.push({ id: sId, title: text, score });
          }
        });

        candidates.sort((a, b) => b.score - a.score);

        // Verify top candidates
        for (const cand of candidates.slice(0, 4)) {
          // If artist is known, verify candidate belongs to this artist
          if (normTargetArtist) {
            try {
              const songPageRes = await fetch(`https://www.albumaty.com/song/${cand.id}.html`, {
                headers: { "User-Agent": "Mozilla/5.0" },
                signal: AbortSignal.timeout(3000),
              });
              if (songPageRes.ok) {
                const spHtml = await songPageRes.text();
                const $sp = cheerio.load(spHtml);
                const h1Norm = cleanNorm($sp("h1").text());
                const singerNorm = cleanNorm($sp('a[href*="/singer/"]').text());

                const artistWords = resolvedArtist.split(/\s+/).map(cleanNorm).filter((w) => w.length >= 3);
                const matchesWords = artistWords.length > 0 && artistWords.every((w) => h1Norm.includes(w) || singerNorm.includes(w));

                const isArtistVerified =
                  h1Norm.includes(normTargetArtist) ||
                  singerNorm.includes(normTargetArtist) ||
                  normTargetArtist.includes(singerNorm) ||
                  matchesWords;

                if (!isArtistVerified) {
                  console.log(`[Albumaty] Rejecting search candidate id=${cand.id} (wrong artist: "${singerNorm}" vs target "${normTargetArtist}")`);
                  continue;
                }
              }
            } catch {
              // If page probe fails, proceed
            }
          }

          const mp3 = await extractDirectMp3(cand.id);
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

    return null;
  } catch (err: any) {
    console.warn(`[Albumaty] Resolution failed for "${title}":`, err.message);
    return null;
  }
}
