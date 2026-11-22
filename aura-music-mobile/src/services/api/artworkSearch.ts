import { BASE_API_URL, MusicApi } from "./musicApi";

export type ArtworkKind = "song" | "artist";

export interface ArtworkCandidate {
  url: string;
  label: string;
  source: string;
}

const TIMEOUT_MS = 7000;

function timeoutSignal(): AbortSignal | undefined {
  try {
    if (typeof AbortSignal !== "undefined" && typeof (AbortSignal as any).timeout === "function") {
      return (AbortSignal as any).timeout(TIMEOUT_MS);
    }
  } catch {}
  return undefined;
}

function upgradeItunesArtwork(url: string): string {
  return url.replace(/\/\d+x\d+bb\./, "/600x600bb.");
}

function dedupe(candidates: Array<ArtworkCandidate | null>): ArtworkCandidate[] {
  const seen = new Set<string>();
  const out: ArtworkCandidate[] = [];
  for (const c of candidates) {
    if (!c || !c.url) continue;
    const url = c.url.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ ...c, url });
  }
  return out;
}

async function searchItunes(query: string, kind: ArtworkKind): Promise<ArtworkCandidate[]> {
  const entity = kind === "song" ? "song" : "album";
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=${entity}&limit=12`,
    { signal: timeoutSignal() }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .map((r: any) => {
      const art = r.artworkUrl100 || r.artworkUrl60;
      if (!art || typeof art !== "string") return null;
      const label =
        kind === "song"
          ? [r.trackName, r.artistName].filter(Boolean).join(" — ")
          : [r.collectionName, r.artistName].filter(Boolean).join(" — ");
      return { url: upgradeItunesArtwork(art), label: label || query, source: "iTunes" };
    })
    .filter(Boolean) as ArtworkCandidate[];
}

async function searchDeezer(query: string, kind: ArtworkKind): Promise<ArtworkCandidate[]> {
  const endpoint =
    kind === "song"
      ? `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=12`
      : `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=12`;
  const res = await fetch(endpoint, { signal: timeoutSignal() });
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data?.data) ? data.data : [];
  return items
    .map((r: any) => {
      if (kind === "song") {
        const art = r?.album?.cover_xl || r?.album?.cover_big || r?.album?.cover_medium;
        if (!art || typeof art !== "string") return null;
        return {
          url: art,
          label: [r.title, r?.artist?.name].filter(Boolean).join(" — ") || query,
          source: "Deezer",
        };
      }
      const art = r?.picture_xl || r?.picture_big || r?.picture_medium;
      if (!art || typeof art !== "string") return null;
      return { url: art, label: r?.name || query, source: "Deezer" };
    })
    .filter(Boolean) as ArtworkCandidate[];
}

async function searchYouTubeArtist(query: string): Promise<ArtworkCandidate[]> {
  const res = await fetch(`${BASE_API_URL}/api/artist-image?artist=${encodeURIComponent(query)}`, {
    signal: timeoutSignal(),
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!data?.imageUrl || typeof data.imageUrl !== "string") return [];
  return [{ url: data.imageUrl, label: query, source: "YouTube" }];
}

async function searchAuraCatalog(query: string, kind: ArtworkKind): Promise<ArtworkCandidate[]> {
  const data = await MusicApi.search(query);
  if (kind === "artist") {
    return (data.artists || [])
      .map((a: any) => {
        if (!a?.thumbnailUrl) return null;
        return { url: a.thumbnailUrl as string, label: a.artistName || query, source: "Aura" };
      })
      .filter(Boolean) as ArtworkCandidate[];
  }
  return [
    ...(data.songs || []).map((s) => {
      if (!s.thumbnailUrl) return null;
      return { url: s.thumbnailUrl, label: `${s.title} — ${s.artist}`, source: "Aura" };
    }),
    ...(data.albums || []).map((al: any) => {
      if (!al.thumbnailUrl) return null;
      return { url: al.thumbnailUrl as string, label: [al.title, al.artist].filter(Boolean).join(" — "), source: "Aura" };
    }),
  ].filter(Boolean) as ArtworkCandidate[];
}

/**
 * Searches several public artwork sources (iTunes, Deezer, Aura catalogue and
 * YouTube artist imagery) and returns deduped cover candidates ready to be
 * shown in the artwork picker.
 */
export async function searchArtworkCandidates(
  query: string,
  kind: ArtworkKind
): Promise<ArtworkCandidate[]> {
  const q = query.trim();
  if (!q) return [];

  const jobs: Promise<ArtworkCandidate[]>[] =
    kind === "song"
      ? [searchItunes(q, "song"), searchDeezer(q, "song"), searchAuraCatalog(q, "song")]
      : [searchDeezer(q, "artist"), searchYouTubeArtist(q), searchAuraCatalog(q, "artist"), searchItunes(q, "artist")];

  const settled = await Promise.allSettled(jobs);
  const merged: Array<ArtworkCandidate | null> = [];
  for (const r of settled) {
    if (r.status === "fulfilled") merged.push(...r.value);
    else merged.push(null);
  }
  return dedupe(merged).slice(0, 24);
}
