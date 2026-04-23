import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/services/auth/session";

export async function requireAuth(req: NextRequest) {
  return getUserFromRequest(req);
}

export async function requireRole(req: NextRequest, allowedRoles: string[]) {
  const user = await getUserFromRequest(req);
  if (!user) return null;
  if (!allowedRoles.includes(user.role)) return null;
  return user;
}
