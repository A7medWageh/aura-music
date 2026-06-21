const express = require('express');
const cors = require('cors');
const youtubedl = require('youtube-dl-exec');

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Root Route
app.get('/', (req, res) => {
    res.send('Aura Music Backend is Running! 🔥');
});

// Helper Function: Extract Video Info
const getVideoInfo = async (videoUrl) => {
    const info = await youtubedl(videoUrl, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        youtubeSkipDashManifest: true
    });

    const formats = info.formats || [];
    const audioFormats = formats.filter(f => f.vcodec === 'none' && f.acodec !== 'none');
    
    if (audioFormats.length === 0) {
        throw new Error('No audio formats found');
    }

    audioFormats.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
    
    return {
        bestFormat: audioFormats[0],
        details: info
    };
};

// 1. Resolve Audio URL (For Online Player)
app.get('/api/resolve', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        if (!videoUrl) return res.status(400).json({ error: 'URL is required' });

        console.log(`[Resolve] Fetching: ${videoUrl}`);
        const { bestFormat, details } = await getVideoInfo(videoUrl);

        res.json({
            success: true,
            id: details.id,
            title: details.title,
            download_url: bestFormat.url,
            quality: (bestFormat.abr || bestFormat.format_note || 'Unknown') + 'kbps',
            ext: bestFormat.ext,
        });

    } catch (error) {
        console.error('Resolve Error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to extract audio' });
    }
});

// 2. Download Audio (For Offline Downloading)
app.get('/api/download', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        if (!videoUrl) return res.status(400).json({ error: 'URL is required' });

        console.log(`[Download] Fetching: ${videoUrl}`);
        const { bestFormat, details } = await getVideoInfo(videoUrl);
        const audioUrl = bestFormat.url;

        // Fetch stream and pipe to client
        const fetch = require('node-fetch');
        const upstream = await fetch(audioUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Range': req.headers.range || 'bytes=0-'
            }
        });

        res.status(upstream.status);
        ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(key => {
            const val = upstream.headers.get(key);
            if (val) res.setHeader(key, val);
        });

        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(details.title)}.mp3"`);

        upstream.body.pipe(res);

    } catch (error) {
        console.error('Download Error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to download audio' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
