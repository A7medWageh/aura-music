export function getProxyUrl(url: string | null | undefined): string {
  if (!url) return "/placeholder-song.jpg";
  if (url.startsWith("/") || url.startsWith("blob:")) return url;
  
  // Handle protocol-relative URLs
  let targetUrl = url;
  if (url.startsWith("//")) {
    targetUrl = "https:" + url;
  }
  
  return `/api/proxy?url=${encodeURIComponent(targetUrl)}`;
}
