import crypto from "crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { getEnv } from "@/services/config/env";

const CSRF_COOKIE = "musicweb_csrf";

function sign(value: string) {
  const env = getEnv();
  return crypto.createHmac("sha256", env.AUTH_CSRF_SECRET).update(value).digest("hex");
}

export function createCsrfToken() {
  const raw = crypto.randomBytes(24).toString("hex");
  return `${raw}.${sign(raw)}`;
}

export async function setCsrfCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24
  });
}

export async function assertCsrf(req: NextRequest) {
  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = req.headers.get("x-csrf-token");
  if (!cookieToken || !headerToken) return false;
  if (cookieToken !== headerToken) return false;
  const [raw, sig] = cookieToken.split(".");
  if (!raw || !sig) return false;
  return sign(raw) === sig;
}
