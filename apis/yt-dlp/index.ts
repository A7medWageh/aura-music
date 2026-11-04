import { spawn, spawnSync } from "child_process";
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
    const msysExe = "C:\\msys64\\mingw64\\bin\\yt-dlp.exe";
    if (fs.existsSync(msysExe)) {
      return msysExe;
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
    const msysExe = "C:\\msys64\\mingw64\\bin\\yt-dlp.exe";
    if (fs.existsSync(msysExe)) return true;
  }
  return spawnSync(getYtDlpBinary(), ["--version"], { stdio: "ignore" }).status === 0;
}

/**
 * Directly stream audio from YouTube via yt-dlp to stdout.
 * Bypasses all Google Video 403 Forbidden errors.
 */
export function streamAudioFromYouTube(videoId: string, fallbackQuery?: string) {
  const binary = getYtDlpBinary();
  const isWinCmd = process.platform === "win32" && (binary.endsWith(".cmd") || binary.endsWith(".bat"));

  const target = videoId.startsWith("http") || videoId.startsWith("ytsearch")
    ? videoId
    : `https://www.youtube.com/watch?v=${videoId}`;

  const makeArgs = (targetUrl: string) => [
    "-f", "ba[ext=m4a]/ba[ext=mp3]/bestaudio[ext=mp4]/best",
    "-o", "-",
    "--no-warnings",
    "--no-playlist",
    "-q",
    targetUrl
  ];

  let currentChild: any = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let bytesSent = 0;
      let closed = false;

      function run(targetUrl: string, canRetryWithFallback: boolean) {
        const child = spawn(binary, makeArgs(targetUrl), { shell: isWinCmd });
        currentChild = child;

        child.stdout.on("data", (chunk: Buffer) => {
          bytesSent += chunk.length;
          if (!closed) {
            controller.enqueue(new Uint8Array(chunk));
          }
        });

        child.on("close", (code) => {
          if (bytesSent === 0 && canRetryWithFallback && fallbackQuery) {
            console.log(`[yt-dlp] Video ${videoId} yielded 0 bytes (code ${code}), retrying with search fallback: "${fallbackQuery}"`);
            run(`ytsearch1:${fallbackQuery}`, false);
            return;
          }

          if (!closed) {
            closed = true;
            if (bytesSent === 0 && code !== 0) {
              controller.error(new Error(`yt-dlp exited with code ${code} without output`));
            } else {
              try { controller.close(); } catch {}
            }
          }
        });

        child.on("error", (err) => {
          if (bytesSent === 0 && canRetryWithFallback && fallbackQuery) {
            console.log(`[yt-dlp] Video ${videoId} error: ${err.message}, retrying with search fallback: "${fallbackQuery}"`);
            run(`ytsearch1:${fallbackQuery}`, false);
            return;
          }
          if (!closed) {
            closed = true;
            try { controller.error(err); } catch {}
          }
        });
      }

      run(target, !!fallbackQuery);
    },
    cancel() {
      try { currentChild?.kill(); } catch {}
    }
  });

  return {
    stream,
    mimeType: "audio/mp4",
    kill: () => { try { currentChild?.kill(); } catch {} },
  };
}

export async function resolveAudioStream(videoId: string): Promise<string> {
  const binary = getYtDlpBinary();
  const isWin = process.platform === "win32" && (binary.endsWith(".cmd") || binary.endsWith(".bat"));
  // m4a/mp3 first: the ranged proxy hands this URL to iOS AVPlayer, which cannot
  // decode the WebM/Opus track YouTube serves as its default "bestaudio".
  const args = [
    "-f", "ba[ext=m4a]/ba[ext=mp3]/bestaudio[ext=mp4]/best",
    "-g", "--no-warnings", "--no-playlist",
    `https://www.youtube.com/watch?v=${videoId}`,
  ];

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

/**
 * Direct googlevideo URLs answer HTTP 206 natively, so seeking and iOS/AVPlayer
 * probes work. yt-dlp URL extraction is expensive (~3-5s), so the URL is cached
 * until shortly before googlevideo's own expiry.
 */
const directUrlCache = new Map<string, { url: string; expiresAt: number }>();
const DIRECT_URL_TTL = 20 * 60 * 1000;

export async function resolveAudioDirectUrl(videoId: string, force = false): Promise<string> {
  const hit = directUrlCache.get(videoId);
  if (!force && hit && hit.expiresAt > Date.now()) return hit.url;
  const url = await resolveAudioStream(videoId);
  directUrlCache.set(videoId, { url, expiresAt: Date.now() + DIRECT_URL_TTL });
  return url;
}

/** Proxy a byte range straight from googlevideo, preserving 206/Content-Range. */
export async function proxyAudioRange(
  videoId: string,
  range: string | null,
  signal?: AbortSignal
): Promise<Response> {
  const request = async (force: boolean) => {
    const url = await resolveAudioDirectUrl(videoId, force);
    return fetch(url, {
      headers: range ? { Range: range } : {},
      signal: signal || AbortSignal.timeout(30000),
    });
  };
  let res = await request(false);
  if (res.status === 403 || res.status === 410) {
    directUrlCache.delete(videoId);
    res = await request(true);
  }
  return res;
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
