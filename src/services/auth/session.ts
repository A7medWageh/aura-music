import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { getEnv } from "@/services/config/env";

type AuthTokenPayload = {
  sub: string;
  email: string;
  displayName: string;
  role: string;
};

const AUTH_COOKIE = "musicweb_session";

export function signAuthToken(payload: AuthTokenPayload) {
  const env = getEnv();
  return jwt.sign(payload, env.AUTH_JWT_SECRET, { expiresIn: "7d" });
}

export function verifyAuthToken(token: string) {
  const env = getEnv();
  return jwt.verify(token, env.AUTH_JWT_SECRET) as AuthTokenPayload;
}

export async function getUserFromRequest(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  try {
    return verifyAuthToken(token);
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  });
}

export async function rotateSessionCookie(payload: any) {
  const { iat, exp, ...cleanPayload } = payload;
  const token = signAuthToken(cleanPayload as AuthTokenPayload);
  await setSessionCookie(token);
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
}
