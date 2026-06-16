import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const ytDlpPath = path.join(process.cwd(), "yt-dlp-master", "yt-dlp.exe");
const videoUrl = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

console.log("Starting yt-dlp...");
const child = spawn(ytDlpPath, ["-f", "bestaudio", "-o", "-", videoUrl]);

let received = 0;
child.stdout.on('data', chunk => { received += chunk.length; });
child.stdout.pipe(fs.createWriteStream("test-ytdlp.m4a"));

child.stderr.on('data', data => console.log(data.toString()));

child.on("close", (code) => {
  console.log("Done with code", code, "Total bytes:", received);
});
