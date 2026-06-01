async function testSaavn() {
  const query = "Amr Diab Aalk Nedem";
  console.log("Testing Saavn API for query:", query);
  
  // Public JioSaavn APIs:
  const apis = [
    "https://saavn.dev/api/search/songs?query=",
    "https://jiosaavn-api-privatecvc2.vercel.app/search/songs?query="
  ];

  for (const api of apis) {
    try {
      console.log("Trying", api);
      const res = await fetch(api + encodeURIComponent(query));
      const data = await res.json();
      
      let url = null;
      if (data?.data?.results?.length > 0) {
        const song = data.data.results[0];
        console.log("Found song:", song.name, song.primaryArtists);
        const streams = song.downloadUrl;
        if (streams && streams.length > 0) {
          url = streams.sort((a, b) => parseInt(b.quality) - parseInt(a.quality))[0].url;
        }
      }
      console.log("URL:", url);
    } catch (e) {
      console.log("Failed:", e.message);
    }
  }
}

testSaavn();
