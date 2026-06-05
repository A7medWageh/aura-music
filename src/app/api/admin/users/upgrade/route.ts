import { NextRequest } from "next/server";
import { query } from "@apis/neon";
import { getUserFromRequest } from "@/services/auth/session";
import { fail, ok } from "@/services/http/response";

export async function POST(req: NextRequest) {
  const admin = await getUserFromRequest(req);
  const OWNER_EMAIL = "emil578jvcvn@gmail.com";
  
  if (!admin || (admin.role !== "admin" && admin.email !== OWNER_EMAIL)) {
    return fail("UNAUTHORIZED", "Only admins can perform this action", 403);
  }

  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const tier = String(body.tier ?? "").trim().toLowerCase();

  if (!email || !["premium", "free"].includes(tier)) {
    return fail("BAD_REQUEST", "Invalid email or tier", 400);
  }

  const result = await query(
    `UPDATE users SET tier = $1 WHERE email = $2 RETURNING id, email, display_name, tier`,
    [tier, email]
  );

  if (result.rowCount === 0) {
    return fail("NOT_FOUND", "User not found with that email", 404);
  }

  return ok({ user: result.rows[0] });
}
