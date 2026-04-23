import crypto from "crypto";
import { NextRequest } from "next/server";
import { query } from "../../../../../apis/neon";
import { comparePassword } from "@/services/auth/password";
import { setSessionCookie, signAuthToken } from "@/services/auth/session";
import { checkRateLimit } from "@/services/security/rateLimit";
import { createCsrfToken, setCsrfCookie } from "@/services/security/csrf";
import { fail, ok } from "@/services/http/response";
import { log } from "@/services/http/logger";

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const rate = await checkRateLimit(req, { key: "auth-login", max: 10, windowSec: 60 });
  if (!rate.allowed) {
    return fail("RATE_LIMITED", "Too many login attempts", 429);
  }

  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) {
    return fail("BAD_REQUEST", "email and password are required", 400);
  }

  const result = await query<{
    id: string;
    email: string;
    display_name: string;
    password_hash: string;
    role: string;
    failed_login_attempts: number;
    locked_until: string | null;
  }>(
    `
      SELECT u.id, u.email, u.display_name, u.role, a.password_hash, a.failed_login_attempts, a.locked_until
      FROM users u
      JOIN auth_accounts a ON a.user_id = u.id
      WHERE u.email = $1
      LIMIT 1
    `,
    [email]
  );

  const user = result.rows[0];
  if (!user) {
    return fail("UNAUTHORIZED", "invalid credentials", 401);
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    return fail("LOCKED", "account temporarily locked due to failed attempts", 423);
  }

  const passwordValid = await comparePassword(password, user.password_hash);
  if (!passwordValid) {
    const attempts = user.failed_login_attempts + 1;
    const lockMinutes = attempts >= 5 ? 10 : 0;
    await query(
      `
        UPDATE auth_accounts
        SET failed_login_attempts = $2,
            locked_until = CASE WHEN $3 > 0 THEN NOW() + ($3 || ' minutes')::interval ELSE NULL END,
            updated_at = NOW()
        WHERE user_id = $1
      `,
      [user.id, attempts, lockMinutes]
    );
    log("warn", "login_failed", { requestId, userId: user.id, attempts });
    return fail("UNAUTHORIZED", "invalid credentials", 401);
  }

  await query(
    `UPDATE auth_accounts SET failed_login_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE user_id = $1`,
    [user.id]
  );

  const token = signAuthToken({
    sub: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role
  });
  await setSessionCookie(token);
  const csrf = createCsrfToken();
  await setCsrfCookie(csrf);
  log("info", "login_success", { requestId, userId: user.id });

  return ok({
    user: { id: user.id, email: user.email, displayName: user.display_name }
  });
}
