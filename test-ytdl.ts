import ytdl from '@distube/ytdl-core';

async function test() {
  try {
    const info = await ytdl.getInfo('jNQXAC9IVRw');
    const format = ytdl.chooseFormat(info.formats, { quality: 'highestaudio' });
    console.log('Got format:', format.url);
  } catch (e) {
    console.error(e);
  }
}
test();
