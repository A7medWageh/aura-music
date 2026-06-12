import * as cheerio from 'cheerio';

async function testAlbumaty(url: string) {
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);
  console.log(`Title for ${url}:`, $('title').text());
}
testAlbumaty('https://www.albumaty.com/song/52987.html');
testAlbumaty('https://www.albumaty.com/song/21137.html');
