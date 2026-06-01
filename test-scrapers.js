const http = require('http');
const https = require('https');

async function testVevioz() {
  const videoId = "MZiV1MijiBI"; // Amr Diab
  console.log("Testing Vevioz...");
  try {
    const res = await fetch(`https://api.vevioz.com/api/button/mp3/${videoId}`);
    const html = await res.text();
    // We need to parse the HTML to see if there's a download link
    const linkMatch = html.match(/href="(https:\/\/download[^"]+)"/);
    if (linkMatch) {
      console.log("Found Vevioz link:", linkMatch[1]);
    } else {
      console.log("No link found in Vevioz HTML");
    }
  } catch (e) {
    console.log("Vevioz error:", e.message);
  }
}

async function testCobaltV10() {
  console.log("Testing Cobalt v10...");
  try {
    // A known working cobalt instance like api.cobalt.tools or instances.cobalt.tools
    const res = await fetch("https://cobalt-api.meowing.de", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0"
      },
      body: JSON.stringify({
        url: "https://www.youtube.com/watch?v=MZiV1MijiBI",
        downloadMode: "audio",
        audioFormat: "mp3",
        filenameStyle: "basic"
      })
    });
    const text = await res.text();
    console.log("Cobalt meowing.de:", text);
  } catch(e) {
    console.log("Cobalt error:", e.message);
  }
}

async function testYt1s() {
  console.log("Testing yt1s...");
  try {
    const res = await fetch("https://yt1s.com/api/ajaxSearch/index", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "q=https://www.youtube.com/watch?v=MZiV1MijiBI&vt=mp3"
    });
    console.log("yt1s:", await res.json());
  } catch(e) {
    console.log("yt1s error:", e.message);
  }
}

async function run() {
  await testVevioz();
  await testCobaltV10();
  await testYt1s();
}

run();
