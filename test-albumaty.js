const axios = require('axios');
const cheerio = require('cheerio');

async function testAlbumaty() {
    try {
        const url = "https://www.albumaty.com/song/32345.html";
        const res = await axios.get(url);
        const $1 = cheerio.load(res.data);
        
        let mp3Link = null;
        $1('a').each((i, el) => {
            const href = $1(el).attr('href');
            if (href && href.includes('.mp3')) {
                mp3Link = href;
            }
        });
        
        console.log("Song title:", $1('title').text());
        console.log("MP3 Link:", mp3Link);
        
        // Also let's check if the audio tag has it
        console.log("Audio tag src:", $1('audio source').attr('src') || $1('audio').attr('src'));
        
    } catch (e) {
        console.error(e.message);
    }
}

testAlbumaty();
