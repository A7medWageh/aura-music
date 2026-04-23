import crypto from "crypto";
import { NextRequest } from "next/server";
import { query } from "@apis/neon";
import { hashPassword } from "@/services/auth/password";
import { setSessionCookie, signAuthToken } from "@/services/auth/session";
import { checkRateLimit } from "@/services/security/rateLimit";
import { createCsrfToken, setCsrfCookie } from "@/services/security/csrf";
import { fail, ok } from "@/services/http/response";
import { log } from "@/services/http/logger";

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const rate = await checkRateLimit(req, { key: "auth-signup", max: 8, windowSec: 60 });
  if (!rate.allowed) {
    return fail("RATE_LIMITED", "Too many signup attempts", 429);
  }

  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const displayName = String(body.displayName ?? "").trim();

  if (!email || !password || !displayName) {
    return fail("BAD_REQUEST", "email, password, displayName are required", 400);
  }
  if (password.length < 8) {
    return fail("BAD_REQUEST", "password must be at least 8 characters", 400);
  }

  const existing = await query<{ id: string }>("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
  if (existing.rowCount) {
    return fail("CONFLICT", "email already in use", 409);
  }

  const passwordHash = await hashPassword(password);
  const userResult = await query<{ id: string; email: string; display_name: string; role: string }>(
    `
      INSERT INTO users (email, display_name, role)
      VALUES ($1, $2, 'user')
      RETURNING id, email, display_name, role
    `,
    [email, displayName]
  );
  const user = userResult.rows[0];

  await query(`INSERT INTO auth_accounts (user_id, password_hash) VALUES ($1, $2)`, [user.id, passwordHash]);

  const token = signAuthToken({
    sub: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role
  });
  await setSessionCookie(token);
  const csrf = createCsrfToken();
  await setCsrfCookie(csrf);
  log("info", "signup_success", { requestId, userId: user.id });

  return ok({
    user: { id: user.id, email: user.email, displayName: user.display_name }
  });
}
