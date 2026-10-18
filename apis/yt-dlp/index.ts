import { spawn } from "child_process";
import path from "path";
import fs from "fs";

function getYtDlpBinary(): string {
  if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) {
    return process.env.YT_DLP_PATH;
  }
  if (process.platform === "win32") {
    const localExe = path.join(process.cwd(), "yt-dlp-master", "yt-dlp.exe");
    if (fs.existsSync(localExe)) {
      return localExe;
    }
    const localCmd = path.join(process.cwd(), "yt-dlp-master", "yt-dlp.cmd");
    if (fs.existsSync(localCmd)) {
      return localCmd;
    }
  }
  return "yt-dlp";
}

export function isYtDlpAvailable(): boolean {
  if (process.env.YT_DLP_PATH && fs.existsSync(process.env.YT_DLP_PATH)) return true;
  if (process.platform === "win32") {
    const localExe = path.join(process.cwd(), "yt-dlp-master", "yt-dlp.exe");
    if (fs.existsSync(localExe)) return true;
    const localCmd = path.join(process.cwd(), "yt-dlp-master", "yt-dlp.cmd");
    if (fs.existsSync(localCmd)) return true;
  }
  return false;
}

/**
 * Directly stream audio from YouTube via yt-dlp to stdout.
 * Bypasses all Google Video 403 Forbidden errors.
 */
export function streamAudioFromYouTube(videoId: string) {
  const binary = getYtDlpBinary();
  const isWinCmd = process.platform === "win32" && (binary.endsWith(".cmd") || binary.endsWith(".bat"));
  const args = [
    "-f", "ba[ext=m4a]/ba[ext=mp3]/bestaudio/ba/b",
    "-o", "-",
    "--no-warnings",
    `https://www.youtube.com/watch?v=${videoId}`
  ];

  const child = spawn(binary, args, { shell: isWinCmd });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      child.stdout.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      child.stdout.on("end", () => {
        try { controller.close(); } catch {}
      });
      child.stdout.on("error", (err) => {
        try { controller.error(err); } catch {}
      });
      child.on("error", (err) => {
        try { controller.error(err); } catch {}
      });
    },
    cancel() {
      child.kill();
    }
  });

  return {
    stream,
    mimeType: "audio/mp4",
    kill: () => child.kill(),
  };
}

export async function resolveAudioStream(videoId: string): Promise<string> {
  const binary = getYtDlpBinary();
  const isWin = process.platform === "win32" && (binary.endsWith(".cmd") || binary.endsWith(".bat"));
  const args = ["-f", "bestaudio/best/18/worst", "-g", "--no-warnings", `https://www.youtube.com/watch?v=${videoId}`];

  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, { shell: isWin });
    let output = "";
    let error = "";

    proc.stdout.on("data", (chunk) => {
      output += String(chunk);
    });

    proc.stderr.on("data", (chunk) => {
      error += String(chunk);
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed: ${error}`));
        return;
      }
      const urls = output.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith("http"));
      if (!urls[0]) {
        reject(new Error("yt-dlp did not return any URL"));
        return;
      }
      resolve(urls[0]);
    });
  });
}

export type YouTubeSearchItem = {
  videoId: string;
  title: string;
  artistName: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  webpageUrl: string;
};

export async function searchYouTubeByYtDlp(searchTerm: string, limit = 12): Promise<YouTubeSearchItem[]> {
  const binary = getYtDlpBinary();
  const isWin = process.platform === "win32" && (binary.endsWith(".cmd") || binary.endsWith(".bat"));
  const query = `ytsearch${limit}:${searchTerm}`;
  const args = [query, "--dump-json", "--no-warnings", "--skip-download"];

  return new Promise((resolve, reject) => {
    const process = spawn(binary, args, { shell: isWin });
    let output = "";
    let error = "";

    process.stdout.on("data", (chunk) => {
      output += String(chunk);
    });

    process.stderr.on("data", (chunk) => {
      error += String(chunk);
    });

    process.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp search failed: ${error}`));
        return;
      }

      const rows = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const parsed: YouTubeSearchItem[] = [];
      for (const row of rows) {
        try {
          const item = JSON.parse(row) as {
            id?: string;
            title?: string;
            duration?: number;
            thumbnail?: string;
            uploader?: string;
            channel?: string;
            webpage_url?: string;
          };

          if (!item.id || !item.title) continue;
          parsed.push({
            videoId: item.id,
            title: item.title,
            artistName: item.channel || item.uploader || "فنان غير معروف",
            durationSeconds: item.duration ?? 0,
            thumbnailUrl: item.thumbnail ?? null,
            webpageUrl: item.webpage_url ?? `https://www.youtube.com/watch?v=${item.id}`
          });
        } catch {
          // ignore malformed lines
        }
      }

      resolve(parsed);
    });
  });
}
