export function getProxyUrl(url: string | null | undefined): string {
  if (!url) return "/placeholder-song.jpg";
  if (url.startsWith("/") || url.startsWith("blob:") || url.startsWith("data:")) return url;
  
  // Handle protocol-relative URLs
  let targetUrl = url;
  if (url.startsWith("//")) {
    targetUrl = "https:" + url;
  }

  // Safe CDNs that can load directly in <img> without proxy (YouTube, Google, JioSaavn, SoundCloud, Spotify, etc.)
  // Browsers load direct HTTPS CDN images via HTTP/2 edge multiplexing with 0 server overhead
  if (targetUrl.startsWith("https://")) {
    return targetUrl;
  }
  
  // Fallback to proxy only for insecure HTTP URLs to prevent mixed content errors
  return `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
}

