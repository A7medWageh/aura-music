/**
 * musicApiClient.ts
 * ─────────────────
 * Direct Neon PostgreSQL client — uses the actual database schema.
 * Works on Vercel without any extra backend service.
 *
 * Tables (real schema, all lowercase):
 *   artists  → id (uuid), name, image_url, genres, monthly_listeners, created_at
 *   songs    → id (uuid), title, youtube_video_id, artist_id (uuid), album_id (uuid),
 *              duration_seconds, audio_url, bpm, energy_score, mood_tag, metadata, created_at
 *   albums   → id (uuid), artist_id (uuid), title, cover_url, release_date, created_at
 */

import { query } from "@/../apis/neon";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MApiSong {
  id: string;           // UUID
  name: string;
  imageUrl: string | null;
  language: string;
  duration: string;
  isFeatured: boolean;
  artistId: string | null;  // UUID
  albumId: string | null;   // UUID
  youtubeVideoId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MApiArtist {
  id: string;           // UUID
  name: string;
  imageUrl: string | null;
  gender: string;
  createdAt: string;
  updatedAt: string;
}

export interface MApiAlbum {
  id: string;           // UUID
  name: string;
  imageUrl: string | null;
  artistId: string | null;   // UUID
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

// ── In-process cache ──────────────────────────────────────────────────────────

const cache = new Map<string, { data: any; expiresAt: number }>();

function fromCache<T>(key: string): T | null {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data as T;
  return null;
}

function toCache(key: string, data: any, ttlMs: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ── Helper: map DB row → typed object ────────────────────────────────────────

function rowToSong(row: any): MApiSong {
  // Duration: convert seconds to "m:ss" format
  const durationSec = row.duration_seconds ?? 0;
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const duration = durationSec > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : "";

  return {
    id: row.id,
    name: row.title ?? row.name ?? "",
    imageUrl: row.image_url ?? null,
    language: row.metadata?.language ?? "ar",
    duration,
    isFeatured: row.energy_score != null && row.energy_score > 0.7,
    artistId: row.artist_id ?? null,
    albumId: row.album_id ?? null,
    youtubeVideoId: row.youtube_video_id ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.created_at ?? new Date().toISOString(),
  };
}

function rowToArtist(row: any): MApiArtist {
  return {
    id: row.id,
    name: row.name ?? "",
    imageUrl: row.image_url ?? null,
    gender: "",
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.created_at ?? new Date().toISOString(),
  };
}

function rowToAlbum(row: any): MApiAlbum {
  return {
    id: row.id,
    name: row.title ?? row.name ?? "",
    imageUrl: row.cover_url ?? row.image_url ?? null,
    artistId: row.artist_id ?? null,
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.created_at ?? new Date().toISOString(),
  };
}

// ── Songs ─────────────────────────────────────────────────────────────────────

export async function getFeaturedSongs(
  page = 1,
  limit = 50
): Promise<MApiPaginated<MApiSong>> {
  const key = `songs:featured:${page}:${limit}`;
  const cached = fromCache<MApiPaginated<MApiSong>>(key);
  if (cached) return cached;

  const offset = (page - 1) * limit;
  // Songs with high energy_score are "featured"
  const [rows, countRow] = await Promise.all([
    query(
      `SELECT s.*, a.image_url 
       FROM songs s 
       LEFT JOIN artists a ON s.artist_id = a.id
       WHERE s.energy_score > 0.7
       ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query(`SELECT COUNT(*) as cnt FROM songs WHERE energy_score > 0.7`),
  ]);

  // If no featured songs, return all songs ordered by newest
  if (!rows.rows.length) {
    const [allRows, allCount] = await Promise.all([
      query(
        `SELECT s.*, a.image_url FROM songs s LEFT JOIN artists a ON s.artist_id = a.id ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      query(`SELECT COUNT(*) as cnt FROM songs`),
    ]);
    const totalCount = parseInt((allCount.rows[0] as any).cnt ?? "0", 10);
    const data = allRows.rows.map(rowToSong);
    const result: MApiPaginated<MApiSong> = {
      data,
      pagination: { currentPage: page, totalPages: Math.ceil(totalCount / limit), pageSize: limit, totalCount },
    };
    toCache(key, result, 10 * 60 * 1000);
    return result;
  }

  const totalCount = parseInt((countRow.rows[0] as any).cnt ?? "0", 10);
  const data = rows.rows.map(rowToSong);
  const result: MApiPaginated<MApiSong> = {
    data,
    pagination: { currentPage: page, totalPages: Math.ceil(totalCount / limit), pageSize: limit, totalCount },
  };
  toCache(key, result, 10 * 60 * 1000);
  return result;
}

export async function getLatestSongs(
  page = 1,
  limit = 50
): Promise<MApiPaginated<MApiSong>> {
  const key = `songs:latest:${page}:${limit}`;
  const cached = fromCache<MApiPaginated<MApiSong>>(key);
  if (cached) return cached;

  const offset = (page - 1) * limit;
  const [rows, countRow] = await Promise.all([
    query(
      `SELECT s.*, a.image_url FROM songs s LEFT JOIN artists a ON s.artist_id = a.id ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query(`SELECT COUNT(*) as cnt FROM songs`),
  ]);

  const totalCount = parseInt((countRow.rows[0] as any).cnt ?? "0", 10);
  const data = rows.rows.map(rowToSong);
  const result: MApiPaginated<MApiSong> = {
    data,
    pagination: { currentPage: page, totalPages: Math.ceil(totalCount / limit), pageSize: limit, totalCount },
  };
  toCache(key, result, 10 * 60 * 1000);
  return result;
}

export async function getAllSongs(
  page = 1,
  limit = 100
): Promise<MApiPaginated<MApiSong>> {
  const key = `songs:all:${page}:${limit}`;
  const cached = fromCache<MApiPaginated<MApiSong>>(key);
  if (cached) return cached;

  const offset = (page - 1) * limit;
  const [rows, countRow] = await Promise.all([
    query(
      `SELECT s.*, a.image_url FROM songs s LEFT JOIN artists a ON s.artist_id = a.id ORDER BY s.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    ),
    query(`SELECT COUNT(*) as cnt FROM songs`),
  ]);

  const totalCount = parseInt((countRow.rows[0] as any).cnt ?? "0", 10);
  const data = rows.rows.map(rowToSong);
  const result: MApiPaginated<MApiSong> = {
    data,
    pagination: { currentPage: page, totalPages: Math.ceil(totalCount / limit), pageSize: limit, totalCount },
  };
  toCache(key, result, 15 * 60 * 1000);
  return result;
}

export async function getSongById(id: string): Promise<MApiSong> {
  const key = `songs:${id}`;
  const cached = fromCache<MApiSong>(key);
  if (cached) return cached;

  const rows = await query(
    `SELECT s.*, a.image_url FROM songs s LEFT JOIN artists a ON s.artist_id = a.id WHERE s.id = $1 LIMIT 1`,
    [id]
  );
  if (!rows.rows.length) throw new Error(`Song ${id} not found`);
  const result = rowToSong(rows.rows[0]);
  toCache(key, result, 30 * 60 * 1000);
  return result;
}

// ── Artists ───────────────────────────────────────────────────────────────────

export async function getAllArtists(
  page = 1,
  limit = 100
): Promise<MApiPaginated<MApiArtist>> {
  const key = `artists:all:${page}:${limit}`;
  const cached = fromCache<MApiPaginated<MApiArtist>>(key);
  if (cached) return cached;

  const offset = (page - 1) * limit;
  const [rows, countRow] = await Promise.all([
    query(`SELECT * FROM artists ORDER BY name ASC LIMIT $1 OFFSET $2`, [limit, offset]),
    query(`SELECT COUNT(*) as cnt FROM artists`),
  ]);

  const totalCount = parseInt((countRow.rows[0] as any).cnt ?? "0", 10);
  const data = rows.rows.map(rowToArtist);
  const result: MApiPaginated<MApiArtist> = {
    data,
    pagination: { currentPage: page, totalPages: Math.ceil(totalCount / limit), pageSize: limit, totalCount },
  };
  toCache(key, result, 6 * 60 * 60 * 1000);
  return result;
}

export async function getArtistById(id: string): Promise<MApiArtist> {
  const key = `artists:${id}`;
  const cached = fromCache<MApiArtist>(key);
  if (cached) return cached;

  const rows = await query(`SELECT * FROM artists WHERE id = $1 LIMIT 1`, [id]);
  if (!rows.rows.length) throw new Error(`Artist ${id} not found`);
  const result = rowToArtist(rows.rows[0]);
  toCache(key, result, 30 * 60 * 1000);
  return result;
}

// ── Albums ────────────────────────────────────────────────────────────────────

export async function getAllAlbums(
  page = 1,
  limit = 100
): Promise<MApiPaginated<MApiAlbum>> {
  const key = `albums:all:${page}:${limit}`;
  const cached = fromCache<MApiPaginated<MApiAlbum>>(key);
  if (cached) return cached;

  const offset = (page - 1) * limit;
  const [rows, countRow] = await Promise.all([
    query(`SELECT * FROM albums ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    query(`SELECT COUNT(*) as cnt FROM albums`),
  ]);

  const totalCount = parseInt((countRow.rows[0] as any).cnt ?? "0", 10);
  const data = rows.rows.map(rowToAlbum);
  const result: MApiPaginated<MApiAlbum> = {
    data,
    pagination: { currentPage: page, totalPages: Math.ceil(totalCount / limit), pageSize: limit, totalCount },
  };
  toCache(key, result, 6 * 60 * 60 * 1000);
  return result;
}

export async function getAlbumById(id: string): Promise<MApiAlbum> {
  const key = `albums:${id}`;
  const cached = fromCache<MApiAlbum>(key);
  if (cached) return cached;

  const rows = await query(`SELECT * FROM albums WHERE id = $1 LIMIT 1`, [id]);
  if (!rows.rows.length) throw new Error(`Album ${id} not found`);
  const result = rowToAlbum(rows.rows[0]);
  toCache(key, result, 30 * 60 * 1000);
  return result;
}

// ── Artist songs ──────────────────────────────────────────────────────────────

export async function getSongsByArtist(artistId: string): Promise<MApiSong[]> {
  const key = `songs:artist:${artistId}`;
  const cached = fromCache<MApiSong[]>(key);
  if (cached) return cached;

  const rows = await query(
    `SELECT s.*, a.image_url FROM songs s LEFT JOIN artists a ON s.artist_id = a.id WHERE s.artist_id = $1 ORDER BY s.created_at DESC`,
    [artistId]
  );
  const result = rows.rows.map(rowToSong);
  toCache(key, result, 30 * 60 * 1000);
  return result;
}
