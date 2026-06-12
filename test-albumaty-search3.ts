import * as cheerio from 'cheerio';

async function testAlbumaty(q: string) {
  const res = await fetch('https://www.albumaty.com/search.php?q=' + encodeURIComponent(q));
  const html = await res.text();
  const $ = cheerio.load(html);
  let link = null;
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    if (!link && href && href.includes('/song/')) link = href;
  });
  console.log(`"${q}" -> ${link}`);
}

async function run() {
  await testAlbumaty("قالوا عني عمرو دياب");
  await testAlbumaty("عمرو دياب قالوا عني");
  await testAlbumaty("نقول ايه عمرو دياب");
}

run();
