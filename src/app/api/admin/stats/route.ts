import { NextRequest } from "next/server";
import { query } from "../../../../../apis/neon";
import { requireRole } from "@/services/security/authorize";
import { fail, ok } from "@/services/http/response";

export async function GET(req: NextRequest) {
  const admin = await requireRole(req, ["admin"]);
  if (!admin) return fail("FORBIDDEN", "admin only", 403);

  const [users, songs, playlists] = await Promise.all([
    query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM users`),
    query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM songs`),
    query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM playlists`)
  ]);

  return ok({
    users: Number(users.rows[0]?.count ?? 0),
    songs: Number(songs.rows[0]?.count ?? 0),
    playlists: Number(playlists.rows[0]?.count ?? 0)
  });
}
