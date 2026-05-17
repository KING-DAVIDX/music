/* WAVR shared shell
   - Client-side routing between page fragments under /pages/*.html
   - Each page brings its own <link rel="stylesheet"> and <script> tags
   - The audio + video elements live forever in the shell so playback survives nav
   - Mini-player at the bottom; hidden on /player
*/

// ────────────────────────────── Router ──────────────────────────────
const ROUTES = {
  '/':         { file: 'home',      title: 'Home · WAVR' },
  '/search':   { file: 'search',    title: 'Search · WAVR' },
  '/library':  { file: 'library',   title: 'Library · WAVR' },
  '/downloads':{ file: 'downloads', title: 'Downloads · WAVR' },
  '/shazam':   { file: 'shazam',    title: 'Shazam · WAVR' },
  '/player':   { file: 'player',    title: 'Now Playing · WAVR' },
};

const W = window;
W.WAVR = W.WAVR || {};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ────────────────────────────── Theme ──────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('wavr-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  ['themeToggle', 'themeToggleMobile'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    b.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('wavr-theme', next);
    });
  });
}

// ────────────────────────────── Page loader ──────────────────────────────
const loadedAssets = new Set();
let currentPageCleanup = null;

async function loadPage(path, { push = true } = {}) {
  const route = ROUTES[path] || ROUTES['/'];
  document.title = route.title;

  // Highlight nav
  $$('[data-route]').forEach(a => a.classList.toggle('active', a.getAttribute('data-route') === path));

  // Mini-player visibility
  $('#miniPlayer').hidden = (path === '/player') || !WAVR.player.hasTrack();

  // Cleanup previous page
  try { currentPageCleanup && currentPageCleanup(); } catch (e) { console.warn(e); }
  currentPageCleanup = null;
  delete W.WAVR_PAGE_CLEANUP;

  const main = $('#appMain');
  main.innerHTML = '<div class="spinner"></div>';

  let html;
  try {
    const res = await fetch(`/pages/${route.file}.html`, { cache: 'no-store' });
    html = await res.text();
  } catch (e) {
    main.innerHTML = `<p style="color:var(--text-2)">Failed to load page.</p>`;
    return;
  }

  // Parse fragment
  const tmp = document.createElement('template');
  tmp.innerHTML = html.trim();
  const frag = tmp.content;

  // Pull out CSS links + scripts so we can add them to <head> instead
  const links = Array.from(frag.querySelectorAll('link[rel="stylesheet"]'));
  const scripts = Array.from(frag.querySelectorAll('script'));
  links.forEach(l => l.remove());
  scripts.forEach(s => s.remove());

  // Inject content
  main.innerHTML = '';
  main.appendChild(frag);

  // Add CSS (once)
  for (const link of links) {
    const href = link.getAttribute('href');
    if (!href || loadedAssets.has(href)) continue;
    const el = document.createElement('link');
    el.rel = 'stylesheet';
    el.href = href;
    document.head.appendChild(el);
    loadedAssets.add(href);
  }

  // Load + run scripts (re-run each visit so page can re-init)
  for (const s of scripts) {
    await new Promise((resolve) => {
      const el = document.createElement('script');
      if (s.src) {
        el.src = s.src + (s.src.includes('?') ? '&' : '?') + 't=' + Date.now();
        el.onload = resolve;
        el.onerror = resolve;
      } else {
        el.textContent = s.textContent;
        // inline runs sync
        setTimeout(resolve, 0);
      }
      document.body.appendChild(el);
    });
  }

  // Page registered a cleanup? capture it
  if (typeof W.WAVR_PAGE_CLEANUP === 'function') {
    currentPageCleanup = W.WAVR_PAGE_CLEANUP;
  }

  if (push) history.pushState({ path }, '', path);
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

W.WAVR.navigate = (path) => loadPage(path);

// Intercept nav clicks
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-route]');
  if (!a) return;
  e.preventDefault();
  loadPage(a.getAttribute('data-route'));
});
window.addEventListener('popstate', () => {
  loadPage(location.pathname, { push: false });
});

// ────────────────────────────── Player engine ──────────────────────────────
const audioEl = $('#audioEl');
const videoEl = $('#videoEl');

const player = {
  queue: [],
  index: -1,
  current: null,        // { youtube_id?, file_path?, title, artist, thumbnail, type: 'audio'|'video' }
  mode: 'audio',        // active media element type
  audioCtx: null,
  analyser: null,
  sourceNode: null,
  onUpdate: new Set(),  // pages subscribe to ('time','meta','state','tempo')

  hasTrack() { return !!this.current; },

  emit(ev, data) { this.onUpdate.forEach(fn => { try { fn(ev, data); } catch (e) {} }); },

  setQueue(list, startIndex = 0) {
    this.queue = list.slice();
    this.index = startIndex;
    this.play(this.queue[startIndex]);
  },

  /** Play a single track. If it's already the current track, just toggle. */
  play(track) {
    if (!track) return;
    const sameTrack =
      this.current &&
      ((track.youtube_id && track.youtube_id === this.current.youtube_id) ||
       (track.file_path && track.file_path === this.current.file_path));

    if (sameTrack) {
      // If already playing, navigate to player page; otherwise resume.
      if (!audioEl.paused || !videoEl.paused) {
        WAVR.navigate('/player');
      } else {
        this.resume();
      }
      return;
    }

    this.current = track;
    this.mode = track.type === 'video' ? 'video' : 'audio';
    this.emit('meta', track);
    this.loadAndPlay();

    // Log play
    if (track.youtube_id) {
      fetch('/api/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          youtube_id: track.youtube_id,
          title: track.title || '',
          artist: track.artist || '',
          thumbnail: track.thumbnail || ''
        })
      }).catch(() => {});
    }
  },

  loadAndPlay() {
    const t = this.current;
    // Stop both
    audioEl.pause(); videoEl.pause();
    audioEl.removeAttribute('src'); videoEl.removeAttribute('src');

    let src;
    if (t.file_path) src = t.file_path;
    else if (t.youtube_id) src = `/api/stream?youtube_id=${t.youtube_id}&format=${this.mode === 'video' ? 1 : 0}`;
    else return;

    const el = this.mode === 'video' ? videoEl : audioEl;
    el.src = src;
    el.load();
    el.play().catch(err => console.warn('Play blocked:', err));
    this.setupAnalyser(el);
  },

  setupAnalyser(el) {
    try {
      if (!this.audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new Ctx();
      }
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
      // Disconnect old
      if (this.sourceNode) try { this.sourceNode.disconnect(); } catch {}
      this.sourceNode = this.audioCtx.createMediaElementSource(el);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    } catch (e) {
      // createMediaElementSource throws if called twice on same element. That's OK.
      // The previous source still routes audio correctly.
    }
  },

  toggle() {
    const el = this.mode === 'video' ? videoEl : audioEl;
    if (el.paused) el.play(); else el.pause();
  },
  resume() { (this.mode === 'video' ? videoEl : audioEl).play(); },
  pause()  { (this.mode === 'video' ? videoEl : audioEl).pause(); },
  seek(t)  { (this.mode === 'video' ? videoEl : audioEl).currentTime = t; },
  seekRel(d) { const el = this.mode === 'video' ? videoEl : audioEl; el.currentTime = Math.max(0, Math.min((el.duration || 0), el.currentTime + d)); },
  setVolume(v) { audioEl.volume = v; videoEl.volume = v; },

  next() {
    if (!this.queue.length) return;
    this.index = (this.index + 1) % this.queue.length;
    this.play(this.queue[this.index]);
  },
  prev() {
    if (!this.queue.length) return;
    const el = this.mode === 'video' ? videoEl : audioEl;
    if (el.currentTime > 3) { el.currentTime = 0; return; }
    this.index = (this.index - 1 + this.queue.length) % this.queue.length;
    this.play(this.queue[this.index]);
  },

  /** Returns 0..1 normalized energy reading (for tempo-reactive visuals). */
  readEnergy() {
    if (!this.analyser) return 0;
    const buf = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    return Math.min(1, sum / (buf.length * 200));
  },
};
WAVR.player = player;

// Wire shared media event → mini-player + page subscribers
function attachMediaEvents(el) {
  el.addEventListener('play',   () => { $('#miniPlayer').classList.add('playing'); player.emit('state', 'play'); });
  el.addEventListener('pause',  () => { $('#miniPlayer').classList.remove('playing'); player.emit('state', 'pause'); });
  el.addEventListener('ended',  () => { player.emit('state', 'ended'); player.next(); });
  el.addEventListener('timeupdate', () => {
    const dur = el.duration || 0;
    const cur = el.currentTime || 0;
    $('#mpProgressFill').style.width = dur ? (cur / dur * 100) + '%' : '0%';
    player.emit('time', { current: cur, duration: dur });
  });
  el.addEventListener('loadedmetadata', () => player.emit('time', { current: 0, duration: el.duration || 0 }));
}
attachMediaEvents(audioEl);
attachMediaEvents(videoEl);

player.onUpdate.add((ev, data) => {
  if (ev === 'meta') {
    $('#miniTitle').textContent = data.title || '—';
    $('#miniArtist').textContent = data.artist || '';
    const img = $('#miniThumbImg');
    const wrap = $('#miniThumb');
    if (data.thumbnail) {
      img.src = data.thumbnail;
      wrap.classList.remove('no-image');
    } else {
      img.removeAttribute('src');
      wrap.classList.add('no-image');
    }
    $('#miniPlayer').hidden = (location.pathname === '/player');
  }
});

// Mini-player controls
$('#mpPlay').addEventListener('click', (e) => { e.stopPropagation(); player.toggle(); });
$('#mpNext').addEventListener('click', (e) => { e.stopPropagation(); player.next(); });
$('#mpPrev').addEventListener('click', (e) => { e.stopPropagation(); player.prev(); });
$('#mpProgress').addEventListener('click', (e) => {
  e.stopPropagation();
  const r = e.currentTarget.getBoundingClientRect();
  const el = player.mode === 'video' ? videoEl : audioEl;
  if (el.duration) el.currentTime = ((e.clientX - r.left) / r.width) * el.duration;
});
$('#miniPlayer').addEventListener('click', () => WAVR.navigate('/player'));

// ────────────────────────────── Toast ──────────────────────────────
WAVR.toast = function (msg) {
  const stack = $('#toastStack');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  stack.appendChild(t);
  setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, 2400);
};

// ────────────────────────────── Boot ──────────────────────────────
WAVR.escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
WAVR.fmtTime = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60); const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
};

initTheme();
loadPage(location.pathname);
