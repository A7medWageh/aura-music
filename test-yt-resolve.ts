import { resolveStream } from "./apis/youtubei.js/index";

async function test() {
  try {
    console.log("Resolving CFvhCfVAY4c...");
    const url = await resolveStream("CFvhCfVAY4c");
    console.log("URL:", url);
  } catch (e: any) {
    console.error("ERROR:", e.message);
  }
}
test();
