async function getCobaltInstance() {
  try {
    const res = await fetch("https://instances.cobalt.tools/api/instances", {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const data = await res.json();
    const instances = data.filter(i => i.score >= 80 && i.version.startsWith("10."));
    console.log("Found instances:", instances.map(i => i.url));
    
    // Let's test the first one
    if (instances.length > 0) {
      const best = instances[0].url;
      const res2 = await fetch(`${best}/api/json`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: "https://www.youtube.com/watch?v=MZiV1MijiBI",
          downloadMode: "audio",
          audioFormat: "mp3",
          filenameStyle: "basic"
        })
      });
      console.log(best, await res2.json());
    }
  } catch(e) {
    console.log("Error:", e.message);
  }
}

getCobaltInstance();
