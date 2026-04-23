import { query } from "../../apis/neon";

export async function getRecommendations(userId: string, limit = 20) {
  const sql = `
    SELECT r.song_id, r.score, r.reason, s.title, s.youtube_video_id
    FROM recommendations r
    JOIN songs s ON s.id = r.song_id
    WHERE r.user_id = $1
    ORDER BY r.score DESC
    LIMIT $2
  `;
  const result = await query(sql, [userId, limit]);
  return result.rows;
}

export async function rebuildRecommendations(userId: string) {
  const sql = `
    INSERT INTO recommendations (user_id, song_id, score, source, reason)
    SELECT h.user_id, h.song_id,
      (
        SUM(CASE WHEN h.skipped THEN -0.5 ELSE 1 END)
        + COALESCE(l.like_weight, 0)
      )::real AS score,
      'behavioral',
      jsonb_build_object('strategy', 'history+likes')
    FROM history h
    LEFT JOIN (
      SELECT user_id, song_id, COUNT(*)::real AS like_weight
      FROM likes
      GROUP BY user_id, song_id
    ) l ON l.user_id = h.user_id AND l.song_id = h.song_id
    WHERE h.user_id = $1
    GROUP BY h.user_id, h.song_id, l.like_weight
    ON CONFLICT DO NOTHING
  `;
  await query(sql, [userId]);
}
