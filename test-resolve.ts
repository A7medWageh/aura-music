async function run() {
  try {
    const videoId = "kJQP7kiw5Fk";
    console.log("Fetching from Cobalt v10 API...");
    const res = await fetch("https://api.cobalt.tools/api/json", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        isAudioOnly: true,
        aFormat: "mp3",
        vQuality: "144"
      })
    });
    console.log("Cobalt Status:", res.status);
    const data = await res.json();
    console.log("Cobalt Response:", data);
    
    if (data.url) {
      const audioRes = await fetch(data.url, { headers: { "Range": "bytes=0-" } });
      console.log("Audio HTTP Status:", audioRes.status);
      const buffer = await audioRes.arrayBuffer();
      console.log("Audio bytes downloaded:", buffer.byteLength);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
