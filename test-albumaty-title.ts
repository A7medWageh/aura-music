import * as cheerio from 'cheerio';

async function test() {
  const titles = [
    'شكرا من هنا لبكرة',
    'البخت',
    'اليوم الحلو ده'
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
  }
}
test();
