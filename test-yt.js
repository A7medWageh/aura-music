const { Innertube, UniversalCache } = require("youtubei.js");

async function run() {
  try {
    const yt = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
      client_type: "WEB"
    });
    const info = await yt.music.getInfo("MZiV1MijiBI");
    const format = info.chooseFormat({ type: "audio", quality: "best" });
    if(format && format.url) {
      console.log("youtubei.js success!");
      console.log(format.url.substring(0, 100));
    } else if (format && (format.signature_cipher || format.cipher)) {
      const url = format.decipher(yt.session.player);
      console.log("youtubei.js decipher success!");
      console.log(url.substring(0, 100));
    } else {
      console.log("youtubei.js failed to find format");
    }
  } catch(e) {
    console.log("youtubei.js error:", e.message);
  }
}
run();
