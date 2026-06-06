import { resolveStream } from './apis/youtubei.js/index';
async function run() {
  console.time('first');
  await resolveStream('dQw4w9WgXcQ');
  console.timeEnd('first');
  console.time('second');
  await resolveStream('dQw4w9WgXcQ');
  console.timeEnd('second');
}
run();
