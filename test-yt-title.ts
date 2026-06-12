import { Innertube } from "youtubei.js";

async function run() {
  const yt = await Innertube.create({ hl: 'ar', gl: 'EG' });
  const info = await yt.getBasicInfo("CFvhCfVAY4c");
  console.log("Title (hl=ar):", info.basic_info.title);
  
  const yt2 = await Innertube.create();
  const info2 = await yt2.getBasicInfo("CFvhCfVAY4c");
  console.log("Title (default):", info2.basic_info.title);
}

run();
