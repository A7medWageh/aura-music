const axios = require('axios');
const cheerio = require('cheerio');

async function test(query) {
    const url = 'https://www.albumaty.com/search.php?q=' + encodeURIComponent(query);
    console.log("Fetching:", url);
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    
    $('a').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (href && (href.includes('singer') || href.includes('song')) && !href.includes('now') && !href.includes('cat')) {
            console.log(href, text);
        }
    });
}

test('رامي صبري');
