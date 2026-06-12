import * as cheerio from "cheerio";

async function testApi() {
  const qStr = "قالوا عني ايه عمرو دياب";
  let queries: string[] = [];

  if (qStr) {
    const q = qStr.trim();
    queries.push(q);
    const parts = q.split(' ');
    if (parts.length > 2) {
      queries.push(parts.slice(0, 2).join(' '));
      queries.push(parts.slice(0, 3).join(' '));
    }
  }

  console.log("Queries:", queries);

  let songPageUrl = null;
  for (const q of queries) {
    if (!q || songPageUrl) continue;
    console.log("Searching Albumaty for:", q);
    const searchUrl = `https://www.albumaty.com/search.php?q=${encodeURIComponent(q)}`;
    const searchRes = await fetch(searchUrl, { cache: "no-store" });
    const searchHtml = await searchRes.text();
    const $1 = cheerio.load(searchHtml);
    
    $1('a').each((i, el) => {
      const href = $1(el).attr('href');
      if (!songPageUrl && href && href.includes('/song/')) {
        songPageUrl = href;
      }
    });
    console.log("Result:", songPageUrl);
  }
}
testApi();
