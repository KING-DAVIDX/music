# WAVR v2

Drop these files into your project (replacing the old ones).

## Install
```
npm install
```
This adds `fluent-ffmpeg`. **You also need ffmpeg installed on the host** (apt: `sudo apt install ffmpeg`, mac: `brew install ffmpeg`, win: download from ffmpeg.org). Without it Shazam will fall back to raw input and may still fail with codec errors.

## Run
```
npm start
```
Serves on http://localhost:3000

## File layout
```
server.js              # ffmpeg-converts mic clip → wav before Shazam
database.js            # unchanged
public/
  index.html           # the shell (sidebar, mini-player, animated bg)
  css/shared.css       # design system + shell
  js/shared.js         # router + persistent player engine
  pages/
    home.html      css/home.css      js/home.js
    search.html    css/search.css    js/search.js
    library.html   css/library.css   js/library.js
    downloads.html css/downloads.css js/downloads.js
    shazam.html    css/shazam.css    js/shazam.js
    player.html    css/player.css    js/player.js
```

Each page has its own HTML, CSS, and JS file as you asked. The shell loads them on navigation but keeps the audio/video elements alive so playback never stops between pages. The mini-player is hidden on `/player`. Clicking the mini-player jumps to `/player`. Clicking a track that's already playing also jumps to `/player` instead of restarting it.

## Notes on the changes
- New palette: cyan + indigo + coral on a deep ocean dark base; light mode tuned to match.
- Aurora + grid + grain background, smoother than the old orbs.
- Real tempo-reactive bars in the player driven by a `WebAudio AnalyserNode` on the actual media element.
- Video stage: tap to toggle controls, double-tap left = -10s, double-tap right = +10s, with flash animation.
- Audio cover falls back to a clean SVG icon when there's no thumbnail.
- Search page: shows tip when empty, shows history chips otherwise, fades them out and shows results on submit.
- Shazam: separated mic view and result view; result view has "Play this song", "Open in Shazam", and "Listen again" (which returns to the mic view).
