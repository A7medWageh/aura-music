const yts = require("yt-search");

async function test() {
  const r = await yts("Wegz");
  console.log("Videos:", r.videos.length);
  console.log("Playlists:", r.playlists?.length || r.lists?.length);
  console.log("Accounts:", r.accounts?.length || r.channels?.length);
}
test();
