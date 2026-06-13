import { resolveStream } from "./apis/youtubei.js/index";

async function test() {
  const url = await resolveStream("_u2tvllJgAg");
  console.log("URL:", url);
}

test();
