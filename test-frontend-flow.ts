async function testFlow() {
  const baseUrl = "https://aura-music-production.up.railway.app";
  const query = "قالوا عني ايه عمرو دياب";
  
  console.log(`[1] Searching for: ${query}`);
  const searchRes = await fetch(`${baseUrl}/api/search?q=${encodeURIComponent(query)}`);
  if (!searchRes.ok) {
    console.error("Search API failed:", searchRes.status);
    return;
  }
  const searchData = await searchRes.json();
  const songs = searchData.data.songs || [];
  if (songs.length === 0) {
    console.error("No songs found");
    return;
  }
  
  const song = songs[0];
  console.log(`[2] Found song:`, song);
  
  const ytdownloadUrl = `${baseUrl}/api/ytdownload?videoId=${encodeURIComponent(song.youtubeVideoId || song.songId)}&title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist || "")}&q=${encodeURIComponent(song.searchQuery || "")}&t=${Date.now()}`;
  
  console.log(`[3] Fetching stream URL from: ${ytdownloadUrl}`);
  const streamRes = await fetch(ytdownloadUrl);
  if (!streamRes.ok) {
    console.error("ytdownload API failed:", streamRes.status);
    console.error(await streamRes.text());
    return;
  }
  const streamData = await streamRes.json();
  console.log(`[4] Stream JSON result:`, streamData);
  
  if (streamData.url) {
    console.log(`[5] Verifying direct Audio URL: ${streamData.url}`);
    // Simulate audio fetch with HEAD request if it's external, but Albumaty uses standard mp3
    if (streamData.url.startsWith('/api/')) {
       console.log("Fallback to local API detected, testing fallback...");
       const fallbackRes = await fetch(`${baseUrl}${streamData.url}`);
       console.log(`Fallback status: ${fallbackRes.status}`);
       if (!fallbackRes.ok) console.error(await fallbackRes.text());
    } else {
       console.log("Direct external URL returned!");
    }
  }
}
testFlow();
