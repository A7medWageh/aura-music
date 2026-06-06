import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import * as path from "path";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { checkTunnelRedirect } from "@/utils/tunnelProxy";

const YT_DLP_PATH = process.env.YT_DLP_PATH || path.join(process.cwd(), "yt-dlp-master", "yt-dlp.cmd");

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
    // Using iOS client to bypass YouTube's heavy throttling (speeds up to 500KB/s instead of 18KB/s)
    const ytDlp = spawn(YT_DLP_PATH, [
      "-o", "-", 
      "-f", "bestaudio[ext=m4a]/bestaudio", 
      "--extractor-args", "youtube:client=ios",
      "--no-playlist", 
      youtubeUrl
    ]);

    // Create a ReadableStream from the child process stdout
    const stream = new ReadableStream({
      start(controller) {
        ytDlp.stdout.on("data", (chunk) => {
          controller.enqueue(chunk);
        });

        ytDlp.stdout.on("end", () => {
          controller.close();
        });

        ytDlp.stderr.on("data", (chunk) => {
          // Log errors but don't close the stream unless the process fails
          console.log(`[yt-dlp] ${chunk.toString().trim()}`);
        });

        ytDlp.on("error", (err) => {
          console.error("[yt-dlp error]", err);
          controller.error(err);
        });

        ytDlp.on("close", (code) => {
          if (code !== 0) {
            console.error(`[yt-dlp] Process exited with code ${code}`);
            try { controller.error(new Error(`Exit code ${code}`)); } catch {}
          }
        });
      },
      cancel() {
        // Kill the process if the client aborts the request
        console.log(`[yt-dlp] Client aborted download for ${videoId}, killing process...`);
        ytDlp.kill("SIGKILL");
      }
    });

    // Provide a hardcoded Content-Length estimate (e.g. 3.5MB) so the frontend downloader progress bar doesn't break
    // Since yt-dlp piped stdout has no Content-Length
    const headers = new Headers();
    headers.set("Content-Type", "audio/mp4");
    headers.set("Transfer-Encoding", "chunked");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("X-Original-Content-Length", (3.5 * 1024 * 1024).toString()); 
    headers.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, X-Original-Content-Length");

    return new NextResponse(stream, { headers });

  } catch (error: any) {
    console.error("[DownloadAPI] Error:", error.message);
    return NextResponse.json(
      { error: "Failed to process audio", details: error.message },
      { status: 500 }
    );
  }
}
