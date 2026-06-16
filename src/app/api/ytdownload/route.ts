import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  const noCacheHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
  };

  try {
    const ytDlpPath = path.join(process.cwd(), "yt-dlp-master", "yt-dlp.exe");
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    if (!fs.existsSync(ytDlpPath)) {
      throw new Error(`yt-dlp executable not found at ${ytDlpPath}`);
    }

    const child = spawn(ytDlpPath, ["-f", "bestaudio", "-o", "-", videoUrl]);

    // Convert child process stdout (Node Stream) to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        child.stdout.on("data", (chunk) => {
          controller.enqueue(chunk);
        });
        child.stdout.on("end", () => {
          controller.close();
        });
        child.stdout.on("error", (err) => {
          controller.error(err);
        });
        child.on("error", (err) => {
          controller.error(err);
        });
      },
      cancel() {
        child.kill();
      }
    });

    const headers = new Headers(noCacheHeaders);
    headers.set("content-type", "audio/mpeg");
    // Removed Content-Disposition to prevent Internet Download Manager from intercepting the fetch request

    return new NextResponse(webStream as any, { headers });
  } catch (error: any) {
    console.error("[ytdownload] Error:", error.message);
    return NextResponse.json(
      { error: "Failed to process YouTube download", details: error.message },
      { status: 500, headers: noCacheHeaders }
    );
  }
}
