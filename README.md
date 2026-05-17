# WAVR — Music Universe 🎵

A full-featured music web app with YouTube search, streaming, downloads, Shazam mic identification, and smart recommendations.

## Features

- 🔍 **Search** — Find any track via YouTube (`yt-search`)
- ▶️ **Stream** — Play audio or video directly without downloading (proxy streaming)
- ⬇️ **Download** — Save MP3 or MP4 to your local `downloads/` folder
- 🎵 **Library** — Browse your locally downloaded files
- 📥 **Downloads** — History of everything you've downloaded
- 🎤 **Shazam** — Tap the orb, hold near music, get the track identified
- 📈 **Trending** — Personalized recommendations based on your search & play history
- 🌙 **Dark / Light mode** — Toggleable, saved to localStorage
- 🎨 **Tempo animation** — Pulsing rings and waveform bars when music plays
- 💾 **SQLite** — All history, downloads, and plays stored locally

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Start the server

```bash
npm start
```

Or for development (auto-restart on changes):
```bash
npm run dev
```

### 3. Open the app

```
http://localhost:3000
```

## Project Structure

```
musicapp/
├── server.js          # Express backend — all API routes
├── database.js        # SQLite setup & prepared statements
├── musicapp.db        # Auto-created SQLite database
├── package.json
├── downloads/         # Downloaded MP3/MP4 files (auto-created)
├── uploads/           # Temp mic recordings (auto-created)
│   └── mic/
└── public/
    ├── index.html     # Main HTML shell
    ├── css/
    │   └── main.css   # All styles (dark/light themes, animations)
    └── js/
        └── app.js     # Frontend SPA logic
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/search?q=...` | Search YouTube |
| GET | `/api/stream?youtube_id=...&format=0` | Stream audio (format=1 for video) |
| GET | `/api/get-url?youtube_id=...` | Get raw stream URL |
| POST | `/api/download` | Download and save file |
| GET | `/api/downloads` | List download history |
| GET | `/api/library` | List local files |
| GET | `/api/trending` | Personalized recommendations |
| POST | `/api/play` | Log a play event |
| POST | `/api/shazam` | Identify audio from mic (multipart/form-data) |
| GET | `/api/history` | Get search/play/shazam history |

## Notes

- **Shazam** requires microphone access in the browser (HTTPS or localhost)
- **Streaming** uses your scraper to generate download URLs, then proxies them server-side — this converts download links to streamable content
- **Recommendations** get smarter the more you use the app (based on search history + play counts)
- The app is designed to be wrapped with **Capacitor** for iOS/Android deployment

## Converting to Mobile App (Future)

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init WAVR com.wavr.app
npx cap add android
npx cap add ios
npx cap sync
```
