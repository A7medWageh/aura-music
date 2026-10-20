const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const youtubedl = require('youtube-dl-exec');
const { timingSafeEqual } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', routes);

app.get('/api/health', (_req, res) => {
    res.status(200).json({ ok: true });
});

app.get('/api/ytdownload', (req, res) => {
    const videoId = typeof req.query.videoId === 'string' ? req.query.videoId : '';
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        return res.status(400).json({ error: 'A valid videoId is required' });
    }

    const expectedToken = process.env.REMOTE_STREAM_WORKER_TOKEN || '';
    const authorization = req.get('authorization') || '';
    const providedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const expected = Buffer.from(expectedToken);
    const provided = Buffer.from(providedToken);
    if (!expected.length || expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
        return res.status(expected.length ? 401 : 503).json({
            error: expected.length ? 'Unauthorized' : 'Worker authentication is not configured',
        });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const child = youtubedl.exec(videoUrl, [
        '--format', 'bestaudio[ext=m4a]/bestaudio',
        '--output', '-',
        '--no-playlist',
        '--no-warnings',
    ], {
        stdio: ['ignore', 'pipe', 'ignore'],
    });

    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Cache-Control', 'no-store');
    child.stdout.pipe(res);

    child.on('error', (error) => {
        console.error('[YouTubeWorker] yt-dlp could not start:', error.message);
        if (!res.headersSent) res.status(502).json({ error: 'yt-dlp could not start' });
        else res.destroy(error);
    });
    child.on('close', (code) => {
        if (code !== 0) {
            console.error(`[YouTubeWorker] yt-dlp exited with code ${code}`);
            if (!res.headersSent) res.status(502).json({ error: 'Audio extraction failed' });
            else if (!res.writableEnded) res.destroy(new Error('yt-dlp audio extraction failed'));
        }
    });
    res.on('close', () => {
        if (!res.writableEnded) child.kill();
    });
});

app.get('/', (req, res) => {
    res.send('YouTube MP3 API is running. Test endpoint: /api/download/mp3?url=YOUR_YOUTUBE_URL');
});

// Start the server if not running on Vercel
if (process.env.NODE_ENV !== 'production' || process.env.RENDER) {
    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
    });
}

module.exports = app;
