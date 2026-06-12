import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  try {
    const ytDlpPath = process.env.YT_DLP_PATH || "yt-dlp";
    // -f bestaudio fetches the best audio format. -g gets the direct URL.
    const { stdout, stderr } = await execAsync(
      `${ytDlpPath} -f bestaudio -g "https://www.youtube.com/watch?v=${videoId}"`
    );

    // Parse output lines to find the actual HTTP URL, skipping warnings
    const lines = stdout.split("\n");
    const directUrl = lines.find((line) => line.trim().startsWith("http"));

    if (!directUrl) {
      return NextResponse.json(
        { error: "Could not find stream URL", details: stderr || stdout },
        { status: 500 }
      );
    }

    // Proxy the stream back to the client directly
    const res = await fetch(directUrl.trim(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `YouTube stream returned ${res.status}: ${res.statusText}` },
        { status: res.status }
      );
    }

    const headers = new Headers();
    res.headers.forEach((value, key) => headers.set(key, value));
    // Ensure content length and range headers are exposed for the player
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Expose-Headers", "Content-Length, Accept-Ranges");

    return new NextResponse(res.body, {
      status: res.status,
      headers,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to run yt-dlp", details: error.message },
      { status: 500 }
    );
  }
}
