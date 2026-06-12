import * as cheerio from 'cheerio';
async function test() {
  const titles = [
    'بعد الفراق - مع جنات',
    'بعد الفراق جنات',
    'بعد الفراق',
    'بعد الفراق رامي صبري'
  ];
  for (const t of titles) {
    const res = await fetch('https://www.albumaty.com/search.php?q=' + encodeURIComponent(t));
    const html = await res.text();
    const $ = cheerio.load(html);
    let link = null;
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      if (!link && href && href.includes('/song/')) link = href;
    });
    console.log(t, '->', link);
  }
}
test();
