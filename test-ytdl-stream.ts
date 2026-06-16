import ytdl from '@distube/ytdl-core';
import { Readable } from 'stream';

async function test() {
  try {
    const videoId = 'jNQXAC9IVRw';
    const stream = ytdl(videoId, { filter: 'audioonly', quality: 'highestaudio' });
    
    let received = 0;
    stream.on('data', (chunk) => {
      received += chunk.length;
    });
    
    stream.on('end', () => {
      console.log('Stream ended successfully. Total received:', received, 'bytes');
    });
    
    stream.on('error', (err) => {
      console.error('Stream error:', err);
    });

  } catch (e) {
    console.error(e);
  }
}
test();
