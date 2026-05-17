const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const cors = require('cors');
const fetch = require('node-fetch');
const ytSearch = require('yt-search');
const ffmpeg = require('fluent-ffmpeg');
const { Shazam } = require('node-shazam');
const { stmts } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use('/downloads', express.static('downloads'));

fs.ensureDirSync('uploads');
fs.ensureDirSync('downloads');

// Multer for mic uploads
const micStorage = multer.diskStorage({
  destination: (_req, _file, cb) => { fs.ensureDirSync('uploads/mic'); cb(null, 'uploads/mic'); },
  filename: (_req, file, cb) => {
    const ext = (file.mimetype && file.mimetype.includes('mp4')) ? 'mp4' : 'webm';
    cb(null, `mic_${Date.now()}.${ext}`);
  }
});
const micUpload = multer({ storage: micStorage });

// ───────── Scraper helpers (unchanged) ─────────
function ranHash() { return crypto.randomBytes(16).toString('hex'); }
function encodeDecode(str) { return str.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ 1)).join(''); }
function encUrl(url, delimiter = ',') {
  const codePoints = url.split('').map(c => c.charCodeAt(0));
  return codePoints.join(delimiter).split(delimiter).reverse().join(delimiter);
}
function apiPost(p, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(p);
    const data = JSON.stringify(body);
    const opts = {
      hostname: url.hostname, port: 443,
      path: url.pathname + url.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(null); } });
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}
async function pollStatus(apiBase, id) {
  for (let i = 0; i < 300; i++) {
    const data = await apiPost(`${apiBase}/${ranHash()}/status/${id}/${ranHash()}/`, { data: id });
    if (!data || data.s === 'E') return null;
    if (data.s === 'C') return data;
    await new Promise(r => setTimeout(r, 2000));
  }
  return null;
}
async function getDownloadLink(videoUrl, format, mp3Quality = '128', mp4Quality = '720') {
  let apiBase = 'https://api.apiapi2.lat';
  if (format === '1') apiBase = 'https://api5.apiapi2.lat';
  else if (mp3Quality !== '128') apiBase = 'https://api3.apiapi2.lat';

  const initBody = {
    data: encodeDecode(videoUrl), format, referer: '',
    mp3Quality, mp4Quality,
    userTimeZone: new Date().getTimezoneOffset().toString()
  };
  const initData = await apiPost(
    `${apiBase}/${ranHash()}/init/${encUrl(videoUrl)}/${ranHash()}/`, initBody
  );
  if (!initData || initData.e || initData.i === 'invalid' || initData.i === 'blacklisted' || initData.le) return null;
  if (initData.s === 'C') return `${apiBase}/${ranHash()}/download/${initData.i}/${ranHash()}/`;
  const finalData = await pollStatus(apiBase, initData.i);
  if (!finalData) return null;
  return `${apiBase}/${ranHash()}/download/${finalData.i}/${ranHash()}/`;
}

// ───────── SEARCH ─────────
app.get('/api/search', async (req, res) => {
  const { q, limit = 20 } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });
  try {
    const results = await ytSearch(q);
    const videos = results.videos.slice(0, parseInt(limit)).map(v => ({
      youtube_id: v.videoId, title: v.title,
      artist: v.author?.name || 'Unknown',
      thumbnail: v.thumbnail, duration: v.duration?.seconds || 0,
      duration_text: v.duration?.timestamp || '0:00',
      views: v.views, url: v.url
    }));
    stmts.insertSearch.run(q, videos.length);
    res.json({ results: videos, query: q });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────── STREAM ─────────
app.get('/api/stream', async (req, res) => {
  const { youtube_id, format = '0' } = req.query;
  if (!youtube_id) return res.status(400).json({ error: 'youtube_id required' });
  try {
    const downloadUrl = await getDownloadLink(`https://youtube.com/watch?v=${youtube_id}`, format);
    if (!downloadUrl) return res.status(500).json({ error: 'Could not generate stream link' });
    const response = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!response.ok) return res.status(response.status).json({ error: 'Upstream error' });
    res.setHeader('Content-Type', response.headers.get('content-type') || (format === '1' ? 'video/mp4' : 'audio/mpeg'));
    res.setHeader('Accept-Ranges', 'bytes');
    const totalSize = response.headers.get('content-length');
    if (totalSize) res.setHeader('Content-Length', totalSize);
    response.body.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/get-url', async (req, res) => {
  const { youtube_id, format = '0' } = req.query;
  if (!youtube_id) return res.status(400).json({ error: 'youtube_id required' });
  try {
    const downloadUrl = await getDownloadLink(`https://youtube.com/watch?v=${youtube_id}`, format);
    if (!downloadUrl) return res.status(500).json({ error: 'Could not generate URL' });
    res.json({ url: downloadUrl, stream_url: `/api/stream?youtube_id=${youtube_id}&format=${format}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ───────── DOWNLOAD ─────────
app.post('/api/download', async (req, res) => {
  const { youtube_id, title, artist, thumbnail, duration, format = '0' } = req.body;
  if (!youtube_id) return res.status(400).json({ error: 'youtube_id required' });
  try {
    const downloadUrl = await getDownloadLink(`https://youtube.com/watch?v=${youtube_id}`, format);
    if (!downloadUrl) return res.status(500).json({ error: 'Could not generate download link' });
    const ext = format === '1' ? 'mp4' : 'mp3';
    const safeTitle = (title || youtube_id).replace(/[^a-z0-9\s-]/gi, '').trim().substring(0, 60);
    const filename = `${safeTitle}_${youtube_id}.${ext}`;
    const filePath = path.join('downloads', filename);
    const response = await fetch(downloadUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) return res.status(500).json({ error: 'Download failed' });
    const dest = fs.createWriteStream(filePath);
    response.body.pipe(dest);
    dest.on('finish', () => {
      stmts.insertDownload.run({
        youtube_id, title: title || 'Unknown', artist: artist || 'Unknown',
        thumbnail, duration: duration || 0, format: ext, file_path: `/downloads/${filename}`
      });
      res.json({ success: true, file_path: `/downloads/${filename}`, filename });
    });
    dest.on('error', err => res.status(500).json({ error: err.message }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/downloads', (req, res) => {
  const { limit = 50 } = req.query;
  res.json(stmts.getRecentDownloads.all(parseInt(limit)));
});

// ───────── TRENDING ─────────
app.get('/api/trending', async (_req, res) => {
  try {
    const topSearches = stmts.getSearchHistory.all(5);
    const mostPlayed = stmts.getMostPlayed.all(5);
    let searchQuery = 'trending music 2025';
    if (topSearches.length > 0) {
      const terms = topSearches.map(s => s.query);
      searchQuery = terms[Math.floor(Math.random() * terms.length)] + ' mix playlist';
    }
    const results = await ytSearch(searchQuery);
    const trending = results.videos.slice(0, 20).map(v => ({
      youtube_id: v.videoId, title: v.title,
      artist: v.author?.name || 'Unknown',
      thumbnail: v.thumbnail, duration: v.duration?.seconds || 0,
      duration_text: v.duration?.timestamp || '0:00', views: v.views
    }));
    res.json({ trending, most_played: mostPlayed, top_searches: topSearches });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/play', (req, res) => {
  const { youtube_id, title, artist, thumbnail } = req.body;
  stmts.insertPlay.run({ youtube_id, title, artist, thumbnail });
  res.json({ success: true });
});

// ───────── SHAZAM (with ffmpeg conversion) ─────────
// Converts whatever the browser recorded (webm/opus, mp4/aac) → 16-bit 44.1kHz mono WAV,
// which node-shazam's codec wants. Falls back to raw if ffmpeg fails.
function convertForShazam(inputPath) {
  return new Promise((resolve, reject) => {
    const outPath = inputPath.replace(/\.[^.]+$/, '') + '.wav';
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(44100)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('end', () => resolve(outPath))
      .on('error', err => reject(err))
      .save(outPath);
  });
}

app.post('/api/shazam', micUpload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file' });
  const originalPath = req.file.path;
  let wavPath = null;

  try {
    try {
      wavPath = await convertForShazam(originalPath);
    } catch (e) {
      console.warn('[shazam] ffmpeg conversion failed, trying raw input:', e.message);
    }

    const shazam = new Shazam();
    const result = await shazam.recognise(wavPath || originalPath, 'en-US');

    // cleanup
    fs.remove(originalPath).catch(() => {});
    if (wavPath) fs.remove(wavPath).catch(() => {});

    if (!result || !result.track) {
      return res.json({ success: false, message: 'Song not recognized' });
    }

    const track = result.track;
    const detected = {
      title: track.title,
      artist: track.subtitle,
      thumbnail: track.images?.coverarthq || track.images?.coverart || track.share?.image,
      background: track.images?.background,
      shazam_url: track.share?.href,
      genre: track.genres?.primary,
      key: track.key,
    };

    // Find on YouTube
    try {
      const ytResults = await ytSearch(`${detected.title} ${detected.artist}`);
      if (ytResults.videos.length > 0) {
        detected.youtube_id = ytResults.videos[0].videoId;
        detected.youtube_thumbnail = ytResults.videos[0].thumbnail;
        detected.duration = ytResults.videos[0].duration?.seconds || 0;
      }
    } catch {}

    stmts.insertShazam.run({
      detected_title: detected.title,
      detected_artist: detected.artist,
      youtube_id: detected.youtube_id || null,
      thumbnail: detected.thumbnail
    });

    res.json({ success: true, track: detected });
  } catch (err) {
    console.error('Shazam error:', err);
    fs.remove(originalPath).catch(() => {});
    if (wavPath) fs.remove(wavPath).catch(() => {});
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/library', async (_req, res) => {
  try {
    const files = await fs.readdir('downloads');
    const library = files
      .filter(f => !f.startsWith('.') && (f.endsWith('.mp3') || f.endsWith('.mp4')))
      .map(f => ({
        filename: f,
        path: `/downloads/${f}`,
        type: f.endsWith('.mp4') ? 'video' : 'audio',
        title: f.replace(/_[a-zA-Z0-9_-]{11}\.(mp3|mp4)$/, '').replace(/_/g, ' ')
      }));
    res.json(library);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history', (_req, res) => {
  res.json({
    searches: stmts.getRecentSearchTerms.all(20),
    plays: stmts.getRecentPlays.all(20),
    shazams: stmts.getShazamHistory.all(10),
  });
});

// SPA-ish fallback: any unknown route → index.html (shell handles routing)
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\nWAVR running at http://localhost:${PORT}\n`);
});
