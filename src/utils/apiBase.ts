/**
 * apiBase.ts
 * Returns the base URL for API calls.
 * When running inside Capacitor on iOS / Android (where origin may be capacitor://localhost),
 * relative URLs like /api/... would fail to resolve to the server.
 * This utility ensures all requests properly reach the API server.
 */
export function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "https://aura-musiic.vercel.app";
  const origin = window.location.origin;
  if (
    !origin ||
    origin === "null" ||
    origin.startsWith("capacitor:") ||
    origin.startsWith("auramusic:") ||
    origin.startsWith("ionic:") ||
    origin.startsWith("file:") ||
    origin.includes("localhost")
  ) {
    return "https://aura-musiic.vercel.app";
  }
  return "";
}

export function toAbsoluteApiUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:") || path.startsWith("data:")) {
    return path;
  }
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
