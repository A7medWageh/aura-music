import play from "play-dl";

async function test() {
  try {
    const videoId = "CFvhCfVAY4c";
    console.log(`Resolving with play-dl: ${videoId}`);
    const stream = await play.stream(`https://www.youtube.com/watch?v=${videoId}`, { discordPlayerCompatibility: true });
    console.log("Stream URL:", stream.url);
  } catch (e: any) {
    console.error("play-dl Error:", e.message);
  }
}
test();
