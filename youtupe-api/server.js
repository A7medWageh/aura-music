const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', routes);

app.get('/', (req, res) => {
    res.send('YouTube MP3 API is running. Test endpoint: /api/download/mp3?url=YOUR_YOUTUBE_URL');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
