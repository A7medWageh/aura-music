async function testCobaltV7() {
  const videoId = "MZiV1MijiBI";
  console.log("Testing Cobalt API...");
  try {
    const res = await fetch("https://api.cobalt.tools/api/json", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        aFormat: "mp3",
        isAudioOnly: true
      })
    });
    console.log("Cobalt status:", res.status);
    const text = await res.text();
    console.log("Cobalt response:", text.substring(0, 200));
  } catch (e) {
    console.error("Cobalt error:", e.message);
  }
}

async function testSoundcloud() {
  console.log("Testing Soundcloud (via API)...");
  try {
    // Soundcloud client ID needed for direct API, but we can scrape the page and find the stream URL.
  } catch(e) {}
}

testCobaltV7();
