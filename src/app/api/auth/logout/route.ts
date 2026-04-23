import { NextRequest } from "next/server";
import { clearSessionCookie } from "@/services/auth/session";
import { assertCsrf } from "@/services/security/csrf";
import { fail, ok } from "@/services/http/response";

export async function POST(req: NextRequest) {
  const csrfOk = await assertCsrf(req);
  if (!csrfOk) return fail("CSRF_INVALID", "Missing or invalid CSRF token", 403);
  await clearSessionCookie();
  return ok({ loggedOut: true });
}
