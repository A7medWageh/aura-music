import play from 'play-dl';

async function test() {
  try {
    const info = await play.video_info('jNQXAC9IVRw');
    const format = play.choose_format(info.format, { quality: 2 }); // quality: 2 is highest audio
    console.log('Play-dl url:', format.url);
  } catch (e) {
    console.error(e);
  }
}
test();
