"use client";

let cachedToken: string | null = null;

export async function getCsrfToken() {
  if (cachedToken) return cachedToken;
  const response = await fetch("/api/auth/csrf");
  if (!response.ok) {
    throw new Error("Failed to get CSRF token");
  }
  const payload = (await response.json()) as { data?: { csrfToken?: string } };
  const token = payload.data?.csrfToken;
  if (!token) throw new Error("Missing CSRF token");
  cachedToken = token;
  return token;
}
