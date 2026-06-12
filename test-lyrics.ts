import { Innertube, UniversalCache } from "youtubei.js";

async function run() {
  const yt = await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
    location: "EG",
    client_type: "WEB" as any,
  });

  console.log("Fetching info...");
  const info = await yt.music.getInfo("EbkjpAiONxk"); // Some videoId
  console.log("Getting lyrics...");
  try {
    const lyrics = await info.getLyrics();
    console.log("Lyrics:");
    if (lyrics) {
      console.dir(lyrics, {depth: null});
    } else {
      console.log("None");
    }
  } catch (e: any) {
    console.log("No lyrics found:", e.message);
  }
}
run();
