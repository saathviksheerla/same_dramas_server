const express = require('express');
const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

const searchYouTubeTrailer = async (title, language) => {
  const query = `${title} official trailer ${language}`;
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}&maxResults=1`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.items && data.items.length > 0) {
    const videoId = data.items[0].id.videoId;
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  return null;
};

router.post('/get-trailer', async (req, res) => {
  const { title, language } = req.body;
  console.log(req.body);

  if (!title) {
    return res.status(400).json({ error: 'Movie title is required' });
  }

  try {
    let videoUrl = await searchYouTubeTrailer(title, language || 'Telugu');

    // Fallback to Telugu if no trailer in requested language
    if (!videoUrl && language?.toLowerCase() !== 'telugu') {
      videoUrl = await searchYouTubeTrailer(title, 'Telugu');
    }

    if (videoUrl) {
      return res.json({ url: videoUrl });
    } else {
      return res.status(404).json({ error: 'Trailer not found' });
    }

  } catch (err) {
    console.error('YouTube API Error:', err);
    return res.status(500).json({ error: 'Failed to fetch trailer' });
  }
});

module.exports = router;
