import * as cheerio from 'cheerio';

async function test() {
  const titles = [
    'عمرو دياب شكرا من هنا لبكرة',
    'Amr Diab Shokran',
    'Ahmed Saad El Youm El Helw Dah',
    'Wegz El Bakht'
  ];

  for (const t of titles) {
    console.log(`\nTesting: ${t}`);
    const q = encodeURIComponent(t);
    const res = await fetch('https://www.albumaty.com/search.php?q=' + q);
    const html = await res.text();
    const $ = cheerio.load(html);
    let link = null;
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (!link && href && href.includes('/song/')) link = href;
    });
    console.log('Song Link:', link);

    if (link) {
      const sRes = await fetch(link);
      const sHtml = await sRes.text();
      const $2 = cheerio.load(sHtml);
      const mp3 = $2('audio source').attr('src') || $2('audio').attr('src');
      console.log('MP3 Link:', mp3);
    }
  }
}
test();
