import { NextRequest, NextResponse } from "next/server";

// Domains that need a YouTube Music referer to serve images
const GOOGLE_CDN_HOSTS = ["lh3.googleusercontent.com", "yt3.ggpht.com", "ggpht.com"];

export async function GET(req: NextRequest) {
  let url = req.nextUrl.searchParams.get("url");
  if (!url) return new Response("Missing URL", { status: 400 });

  if (url.startsWith("//")) {
    url = "https:" + url;
  }

  // Validate the URL is well-formed before attempting fetch
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.redirect("/placeholder-song.jpg");
  }

  // Build request headers — Google CDN requires Referer/Origin or it returns 400
  const isGoogleCdn = GOOGLE_CDN_HOSTS.some((h) => parsedUrl.hostname.endsWith(h));
  const fetchHeaders: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Sec-Fetch-Dest": "image",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "cross-site",
  };

  if (isGoogleCdn) {
    fetchHeaders["Referer"] = "https://music.youtube.com/";
    fetchHeaders["Origin"] = "https://music.youtube.com";
  }

  try {
    const res = await fetch(url, {
      headers: fetchHeaders,
      cache: "force-cache",
    });

    if (!res.ok) {
      console.error(`Proxy failed for ${url}: ${res.status} ${res.statusText}`);
      // Return a redirect to placeholder instead of an error, so images degrade gracefully
      return NextResponse.redirect(new URL("/placeholder-song.jpg", req.url));
    }

    const blob = await res.blob();
    const contentType = res.headers.get("Content-Type") || "image/jpeg";

    return new NextResponse(blob, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Image proxy fatal error:", error);
    return NextResponse.redirect(new URL("/placeholder-song.jpg", req.url));
  }
}
