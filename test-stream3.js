async function testApis() {
  const videoId = "MZiV1MijiBI";
  
  // 1. Cobalt public instance (new API format)
  try {
    const res = await fetch("https://cobalt.qck.pt/api/json", {
      method: "POST",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ url: `https://www.youtube.com/watch?v=${videoId}`, isAudioOnly: true })
    });
    console.log("Cobalt 1:", await res.text());
  } catch(e) {
    console.log("Cobalt 1 error");
  }

  // 2. Yt5s / similar
  try {
    const res = await fetch(`https://api.vevioz.com/api/button/mp3/${videoId}`);
    console.log("Vevioz:", res.status);
  } catch(e) {}
  
  // 3. Jiosaavn unoffical API
  try {
    const res = await fetch("https://saavn.dev/api/search/songs?query=Amr+Diab+Aalk+Nedem");
    const data = await res.json();
    console.log("Saavn.dev:", data?.data?.results?.[0]?.downloadUrl?.find((u) => u.quality === "320kbps")?.url);
  } catch(e) {
    console.log("Saavn error");
  }
}

testApis();
