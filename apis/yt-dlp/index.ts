import { spawn } from "child_process";
import { getEnv } from "@/services/config/env";

export async function resolveAudioStream(videoId: string): Promise<string> {
  const env = getEnv();
  const args = ["-f", "bestaudio", "-g", `https://www.youtube.com/watch?v=${videoId}`];

  return new Promise((resolve, reject) => {
    const process = spawn(env.YT_DLP_PATH, args);
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
        reject(new Error(`yt-dlp failed: ${error}`));
        return;
      }
      resolve(output.trim());
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
  const env = getEnv();
  const query = `ytsearch${limit}:${searchTerm}`;
  const args = [query, "--dump-json", "--no-warnings", "--skip-download"];

  return new Promise((resolve, reject) => {
    const process = spawn(env.YT_DLP_PATH, args);
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
