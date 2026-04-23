import { NextRequest, NextResponse } from "next/server";
import { query } from "@/../apis/neon/index";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const songId = params.id;
  
  // For demo/simplicity, we use a hardcoded user ID or get it from auth if implemented
  // Assuming a user exists or we create a guest one
  const userId = "00000000-0000-0000-0000-000000000001"; // Placeholder

  try {
    // Check if like exists
    const existing = await query(
      "SELECT * FROM likes WHERE user_id = $1 AND song_id = $2",
      [userId, songId]
    );

    if (existing.rows.length > 0) {
      // Unlike
      await query("DELETE FROM likes WHERE user_id = $1 AND song_id = $2", [userId, songId]);
      return NextResponse.json({ success: true, liked: false });
    } else {
      // Like
      await query("INSERT INTO likes (user_id, song_id) VALUES ($1, $2)", [userId, songId]);
      return NextResponse.json({ success: true, liked: true });
    }
  } catch (error) {
    console.error("Like error:", error);
    return NextResponse.json({ error: "Failed to toggle like" }, { status: 500 });
  }
}
