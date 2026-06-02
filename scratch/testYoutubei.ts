const { getMusicCharts, getArtistDetails } = require('./apis/youtubei.js/index.ts');

async function run() {
  try {
    const charts = await getMusicCharts();
    console.log(`Trends count: ${charts.length}`);
    if (charts.length > 0) {
      console.log(`First trend: ${charts[0].title} by ${charts[0].artist}`);
    } else {
      console.log('No trends found!');
    }

    const artist = await getArtistDetails("UCAa0_e02nT85T8h3xMcIMvA");
    console.log(`Artist: ${artist.artistName}, Songs: ${artist.songs.length}`);
  } catch (e) {
    console.error("Error:", e);
  }
}

// Need to run via tsx or similar
