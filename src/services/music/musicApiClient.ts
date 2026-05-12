/**
 * musicApiClient.ts
 * ─────────────────
 * Typed client for the MusicApi (.NET) REST backend.
 * Endpoints (base: process.env.MUSIC_API_BASE_URL):
 *   GET /api/songs?page=&limit=           → { data: MApiSong[], pagination }
 *   GET /api/songs/featured?page=&limit=  → { data: MApiSong[], pagination }
 *   GET /api/songs/latest?page=&limit=    → { data: MApiSong[], pagination }
 *   GET /api/songs/:id                    → MApiSong
 *   GET /api/artists?page=&limit=         → { data: MApiArtist[], pagination }
 *   GET /api/artists/:id                  → MApiArtist
 *   GET /api/albums?page=&limit=          → { data: MApiAlbum[], pagination }
 *   GET /api/albums/:id                   → MApiAlbum
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MApiSong {
  id: number;
  name: string;
  imageUrl: string | null;
  language: string;
  duration: string; // e.g. "3:45"
  isFeatured: boolean;
  artistId: number | null;
  albumId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MApiArtist {
  id: number;
  name: string;
  imageUrl: string | null;
  gender: string;
  createdAt: string;
  updatedAt: string;
}

export interface MApiAlbum {
  id: number;
  name: string;
  imageUrl: string | null;
  artistId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MApiPaginated<T> {
  data: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    totalCount: number;
  };
}

// ── Config ────────────────────────────────────────────────────────────────────

function getBaseUrl(): string {
  const url = process.env.MUSIC_API_BASE_URL;
  if (!url) throw new Error("MUSIC_API_BASE_URL is not set in environment");
  return url.replace(/\/$/, "");
}

// ── In-process cache ──────────────────────────────────────────────────────────

const cache = new Map<string, { data: any; expiresAt: number }>();

async function cachedFetch<T>(
  path: string,
  ttlMs: number
): Promise<T> {
  const key = path;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data as T;

  const base = getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    headers: { Accept: "application/json" },
    // next.js fetch cache: revalidate based on TTL
    next: { revalidate: Math.floor(ttlMs / 1000) },
  });

  if (!res.ok) {
    throw new Error(`MusicApi ${path} → HTTP ${res.status}`);
  }

  const data: T = await res.json();
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
  return data;
}

// ── Songs ─────────────────────────────────────────────────────────────────────

export async function getFeaturedSongs(
  page = 1,
  limit = 50
): Promise<MApiPaginated<MApiSong>> {
  return cachedFetch<MApiPaginated<MApiSong>>(
    `/api/songs/featured?page=${page}&limit=${limit}`,
    10 * 60 * 1000 // 10 min
  );
}

export async function getLatestSongs(
  page = 1,
  limit = 50
): Promise<MApiPaginated<MApiSong>> {
  return cachedFetch<MApiPaginated<MApiSong>>(
    `/api/songs/latest?page=${page}&limit=${limit}`,
    10 * 60 * 1000 // 10 min
  );
}

export async function getAllSongs(
  page = 1,
  limit = 100
): Promise<MApiPaginated<MApiSong>> {
  return cachedFetch<MApiPaginated<MApiSong>>(
    `/api/songs?page=${page}&limit=${limit}`,
    15 * 60 * 1000 // 15 min
  );
}

export async function getSongById(id: number): Promise<MApiSong> {
  return cachedFetch<MApiSong>(`/api/songs/${id}`, 30 * 60 * 1000);
}

// ── Artists ───────────────────────────────────────────────────────────────────

export async function getAllArtists(
  page = 1,
  limit = 100
): Promise<MApiPaginated<MApiArtist>> {
  return cachedFetch<MApiPaginated<MApiArtist>>(
    `/api/artists?page=${page}&limit=${limit}`,
    6 * 60 * 60 * 1000 // 6 hours
  );
}

export async function getArtistById(id: number): Promise<MApiArtist> {
  return cachedFetch<MApiArtist>(`/api/artists/${id}`, 30 * 60 * 1000);
}

// ── Albums ────────────────────────────────────────────────────────────────────

export async function getAllAlbums(
  page = 1,
  limit = 100
): Promise<MApiPaginated<MApiAlbum>> {
  return cachedFetch<MApiPaginated<MApiAlbum>>(
    `/api/albums?page=${page}&limit=${limit}`,
    6 * 60 * 60 * 1000 // 6 hours
  );
}

export async function getAlbumById(id: number): Promise<MApiAlbum> {
  return cachedFetch<MApiAlbum>(`/api/albums/${id}`, 30 * 60 * 1000);
}
