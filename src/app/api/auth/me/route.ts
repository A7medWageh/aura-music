import { NextRequest } from "next/server";
import { getUserFromRequest, rotateSessionCookie } from "@/services/auth/session";
import { ok, fail } from "@/services/http/response";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return fail("UNAUTHORIZED", "not authenticated", 401);
  }
  await rotateSessionCookie(user);
  return ok({
    authenticated: true,
    user: { id: user.sub, email: user.email, displayName: user.displayName, role: user.role }
  });
}
