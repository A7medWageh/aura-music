import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { Readable } from "stream";
import * as path from "path";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { checkTunnelRedirect } from "@/utils/tunnelProxy";

const YT_DLP_PATH = process.env.YT_DLP_PATH || (process.platform === "win32" ? path.join(process.cwd(), "yt-dlp-master", "yt-dlp.cmd") : "yt-dlp");

export async function GET(req: NextRequest) {
  const redirect = await checkTunnelRedirect(req);
  if (redirect) return redirect;

  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  try {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    // Spawn yt-dlp to stream directly to stdout
    // Optimized for maximum startup speed (3 seconds)
    const ytDlp = spawn(YT_DLP_PATH, [
      "-o", "-", 
      "-f", "140", // Use format 140 directly to skip format parsing/evaluation
      "--no-playlist", 
      "--no-warnings", 
      "--no-cache-dir", // Skip checking python cache directory for faster startup
      "--extractor-args", "youtube:player_client=ios,android", // Fast clients to bypass bot detection
      youtubeUrl
    ], {
      shell: process.platform === "win32"
    });

    ytDlp.on("error", (err) => {
      console.error("[yt-dlp] Spawn error:", err);
    });

    req.signal.addEventListener("abort", () => {
      console.log(`[yt-dlp] Client aborted download for ${videoId}, killing process...`);
      ytDlp.kill("SIGKILL");
    });

    const webStream = Readable.toWeb(ytDlp.stdout as any);

    const headers = new Headers();
    headers.set("Content-Type", "audio/mp4");
    headers.set("Transfer-Encoding", "chunked");
    headers.set("Access-Control-Allow-Origin", "*");
    // Without exact totalBytes, we let the client show raw MB downloaded
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

    return new NextResponse(webStream as any, { headers });

  } catch (error: any) {
    console.error("[DownloadAPI] Error:", error.message);
    return NextResponse.json(
      { error: "Failed to process audio", details: error.message },
      { status: 500 }
    );
  }
}
