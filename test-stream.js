const videoId = "MZiV1MijiBI"; // Amr Diab song

async function testCobalt() {
  console.log("Testing Cobalt...");
  try {
    const res = await fetch("https://co.wuk.sh/api/json", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        url: `https://www.youtube.com/watch?v=${videoId}`,
        isAudioOnly: true,
        aFormat: "mp3"
      })
    });
    const data = await res.json();
    console.log("Cobalt response:", data);
  } catch (e) {
    console.error("Cobalt error:", e.message);
  }
}

async function testSaavn() {
  console.log("Testing Saavn...");
  try {
    const res = await fetch(`https://saavn.me/search/songs?query=Amr+Diab+Aalk+Nedem`);
    const data = await res.json();
    console.log("Saavn response:", data.data.results[0]?.downloadUrl);
  } catch(e) {
    console.error("Saavn error:", e.message);
  }
}

async function run() {
  await testCobalt();
  await testSaavn();
}

run();
