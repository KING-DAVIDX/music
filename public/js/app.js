/* ═══════════════════════════════════════════
   WAVR — Frontend App
═══════════════════════════════════════════ */

// ─── State ───
const state = {
  currentPage: 'trending',
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  currentTrack: null,
  isRecording: false,
  mediaRecorder: null,
  audioChunks: [],
  searchResults: [],
  trendingData: null,
  libraryData: [],
  downloadsData: [],
};

const audioEl = document.getElementById('audioEl');
const videoEl = document.getElementById('videoEl');

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  setupNav();
  setupPlayer();
  navigateTo('trending');
  addToastContainer();
});

// ═══════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════
function setupTheme() {
  const saved = localStorage.getItem('wavr-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);

  const toggles = [document.getElementById('themeToggle'), document.getElementById('themeToggleMobile')];
  toggles.forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('wavr-theme', next);
    });
  });
}

// ═══════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════
function setupNav() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(el.dataset.page);
    });
  });
}

function navigateTo(page) {
  state.currentPage = page;

  // Update active states
  document.querySelectorAll('[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  const main = document.getElementById('mainContent');
  main.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';

  const pages = { trending, search, library, downloads, shazam };
  if (pages[page]) pages[page](main);
}

// ═══════════════════════════════════════════
// TRENDING PAGE
// ═══════════════════════════════════════════
async function trending(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-title">Trending</div>
      <div class="page-subtitle">Based on your listening history & what's hot right now</div>
      <div class="trending-hero">
        <div class="hero-card" id="heroMostPlayed">
          <div class="hero-label">Your Top</div>
          <div class="hero-title">Most Played</div>
          <div class="hero-sub">Your personal chart</div>
        </div>
        <div class="hero-card" id="heroRecentSearches">
          <div class="hero-label">Discovery</div>
          <div class="hero-title">Based on Searches</div>
          <div class="hero-sub">Tracks you might love</div>
        </div>
      </div>
      <div class="section-title">Recommended For You</div>
      <div id="trendingGrid" class="track-grid"><div class="spinner"></div></div>
    </div>
  `;

  try {
    const res = await fetch('/api/trending');
    const data = await res.json();
    state.trendingData = data;

    const grid = document.getElementById('trendingGrid');
    if (!data.trending || data.trending.length === 0) {
      grid.innerHTML = emptyState('No trending tracks yet', 'Try searching for some music first');
      return;
    }

    renderTrackGrid(grid, data.trending);

    // Hero click → load most played
    document.getElementById('heroMostPlayed').addEventListener('click', () => {
      if (data.most_played?.length > 0) {
        playQueue(data.most_played.map(t => ({ ...t, youtube_id: t.youtube_id })), 0);
        toast('Playing your most played tracks 🎵');
      } else {
        toast('No play history yet — start listening!');
      }
    });
    document.getElementById('heroRecentSearches').addEventListener('click', () => {
      if (data.trending?.length > 0) {
        playQueue(data.trending, 0);
        toast('Playing recommended tracks ✨');
      }
    });
  } catch (err) {
    document.getElementById('trendingGrid').innerHTML = `<p style="color:var(--text-2)">Could not load trending: ${err.message}</p>`;
  }
}

// ═══════════════════════════════════════════
// SEARCH PAGE
// ═══════════════════════════════════════════
async function search(container) {
  container.innerHTML = `
    <div class="page">
      <div class="search-hero">
        <div class="search-big-title">Find Any Track</div>
        <div class="search-tagline">Search, stream, or download from YouTube</div>
      </div>
      <div class="search-box-wrap">
        <input class="search-input" id="searchInput" type="text" placeholder="Song title, artist, lyrics..." autocomplete="off" />
        <button class="search-btn" id="searchBtn">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
      </div>
      <div class="search-tags" id="searchTags"></div>
      <div id="searchResults"></div>
    </div>
  `;

  // Load recent searches as tags
  try {
    const res = await fetch('/api/history');
    const h = await res.json();
    const tags = document.getElementById('searchTags');
    if (h.searches?.length) {
      h.searches.slice(0, 8).forEach(s => {
        const tag = document.createElement('button');
        tag.className = 'search-tag';
        tag.textContent = s.query;
        tag.addEventListener('click', () => {
          document.getElementById('searchInput').value = s.query;
          doSearch(s.query);
        });
        tags.appendChild(tag);
      });
    }
  } catch {}

  const input = document.getElementById('searchInput');
  const btn = document.getElementById('searchBtn');

  const doSearch = async (q) => {
    if (!q.trim()) return;
    const results = document.getElementById('searchResults');
    results.innerHTML = '<div class="loading-wrap"><div class="spinner"></div></div>';
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=24`);
      const data = await res.json();
      state.searchResults = data.results || [];

      if (!state.searchResults.length) {
        results.innerHTML = emptyState('No results found', 'Try a different search term');
        return;
      }

      results.innerHTML = `<div class="section-title" style="margin-top:0">${state.searchResults.length} results for "${q}"</div><div class="track-grid" id="searchGrid"></div>`;
      renderTrackGrid(document.getElementById('searchGrid'), state.searchResults);
    } catch (err) {
      results.innerHTML = `<p style="color:var(--text-2);padding:24px 0">Search failed: ${err.message}</p>`;
    }
  };

  btn.addEventListener('click', () => doSearch(input.value));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(input.value); });

  // Restore previous results
  if (state.searchResults.length) {
    const results = document.getElementById('searchResults');
    results.innerHTML = `<div class="section-title" style="margin-top:0">${state.searchResults.length} results</div><div class="track-grid" id="searchGrid"></div>`;
    renderTrackGrid(document.getElementById('searchGrid'), state.searchResults);
  }

  setTimeout(() => input.focus(), 100);
}

// ═══════════════════════════════════════════
// LIBRARY PAGE
// ═══════════════════════════════════════════
async function library(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-title">Library</div>
      <div class="page-subtitle">Your locally stored audio & video files</div>
      <div id="libraryList"></div>
    </div>
  `;
  try {
    const res = await fetch('/api/library');
    const files = await res.json();
    state.libraryData = files;

    const list = document.getElementById('libraryList');
    if (!files.length) {
      list.innerHTML = emptyState('Your library is empty', 'Download some tracks and they\'ll appear here');
      return;
    }

    list.innerHTML = `<div class="section-title">${files.length} file${files.length !== 1 ? 's' : ''}</div><div class="track-list" id="libTrackList"></div>`;
    const trackList = document.getElementById('libTrackList');

    files.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'track-row';
      row.dataset.index = i;
      row.innerHTML = `
        <div class="track-row-num">${i + 1}</div>
        <div class="track-row-thumb" style="background:var(--bg-3);display:flex;align-items:center;justify-content:center">
          ${f.type === 'video'
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-b)" stroke-width="2"><rect x="2" y="7" width="15" height="11" rx="2"/><path d="M17 9l5-3v12l-5-3V9z"/></svg>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-a)" stroke-width="2"><path d="M9 19V6l12-3v13"/><circle cx="6" cy="19" r="3"/><circle cx="18" cy="16" r="3"/></svg>`
          }
        </div>
        <div class="track-row-info">
          <div class="track-row-name">${escHtml(f.title)}</div>
          <div class="track-row-artist"><span class="badge badge-${f.type}">${f.type}</span></div>
        </div>
        <div class="track-row-actions">
          <button class="row-btn play-local" title="Play" data-path="${f.path}" data-title="${escHtml(f.title)}" data-type="${f.type}">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <a href="${f.path}" download class="row-btn" title="Download" style="text-decoration:none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </a>
        </div>
      `;
      trackList.appendChild(row);
    });

    document.querySelectorAll('.play-local').forEach(btn => {
      btn.addEventListener('click', () => {
        playLocalFile(btn.dataset.path, btn.dataset.title, btn.dataset.type);
      });
    });
  } catch (err) {
    document.getElementById('libraryList').innerHTML = `<p style="color:var(--text-2);padding:24px 0">Could not load library: ${err.message}</p>`;
  }
}

// ═══════════════════════════════════════════
// DOWNLOADS PAGE
// ═══════════════════════════════════════════
async function downloads(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-title">Downloads</div>
      <div class="page-subtitle">Your recent download history</div>
      <div id="downloadsList"></div>
    </div>
  `;
  try {
    const res = await fetch('/api/downloads');
    const items = await res.json();
    state.downloadsData = items;

    const list = document.getElementById('downloadsList');
    if (!items.length) {
      list.innerHTML = emptyState('No downloads yet', 'Use the download button on any track');
      return;
    }

    list.innerHTML = `<div class="section-title">${items.length} download${items.length !== 1 ? 's' : ''}</div><div class="track-list" id="dlTrackList"></div>`;
    const trackList = document.getElementById('dlTrackList');

    items.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'track-row';
      row.innerHTML = `
        ${item.thumbnail
          ? `<img class="track-row-thumb" src="${item.thumbnail}" alt="" onerror="this.style.display='none'">`
          : `<div class="track-row-thumb"></div>`
        }
        <div class="track-row-info">
          <div class="track-row-name">${escHtml(item.title)}</div>
          <div class="track-row-artist">${escHtml(item.artist || 'Unknown')} · <span class="badge badge-${item.format === 'mp4' ? 'video' : 'audio'}">${item.format}</span></div>
        </div>
        <div class="track-row-dur">${formatDate(item.downloaded_at)}</div>
        <div class="track-row-actions">
          ${item.file_path ? `
            <button class="row-btn play-dl" title="Play" data-path="${item.file_path}" data-title="${escHtml(item.title)}" data-type="${item.format === 'mp4' ? 'video' : 'audio'}">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
            <a href="${item.file_path}" download class="row-btn" style="text-decoration:none" title="Re-download">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </a>
          ` : `
            <button class="row-btn stream-yt" title="Stream" data-id="${item.youtube_id}" data-title="${escHtml(item.title)}" data-artist="${escHtml(item.artist || '')}" data-thumb="${item.thumbnail || ''}">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          `}
        </div>
      `;
      trackList.appendChild(row);
    });

    document.querySelectorAll('.play-dl').forEach(btn => {
      btn.addEventListener('click', () => playLocalFile(btn.dataset.path, btn.dataset.title, btn.dataset.type));
    });
    document.querySelectorAll('.stream-yt').forEach(btn => {
      btn.addEventListener('click', () => {
        playTrack({ youtube_id: btn.dataset.id, title: btn.dataset.title, artist: btn.dataset.artist, thumbnail: btn.dataset.thumb });
      });
    });
  } catch (err) {
    document.getElementById('downloadsList').innerHTML = `<p style="color:var(--text-2);padding:24px 0">Could not load downloads: ${err.message}</p>`;
  }
}

// ═══════════════════════════════════════════
// SHAZAM PAGE
// ═══════════════════════════════════════════
function shazam(container) {
  container.innerHTML = `
    <div class="page">
      <div class="page-title">Identify Music</div>
      <div class="page-subtitle">Tap the orb and hold your phone near the music</div>
      <div class="shazam-hero">
        <div class="shazam-orb" id="shazamOrb">
          <div class="shazam-ring"></div>
          <div class="shazam-ring"></div>
          <div class="shazam-ring"></div>
          <div class="shazam-orb-inner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 1a3 3 0 003 3v6a3 3 0 01-6 0V4a3 3 0 013-3z"/>
              <path d="M19 10v2a7 7 0 01-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </div>
        </div>
        <div class="shazam-status" id="shazamStatus">Tap to identify music</div>
        <div class="shazam-hint" id="shazamHint">Listening for up to 10 seconds</div>
        <div class="shazam-result" id="shazamResult"></div>
      </div>

      <div style="max-width:480px;margin:0 auto">
        <div class="section-title">Recent Identifications</div>
        <div id="shazamHistory" class="track-list"></div>
      </div>
    </div>
  `;

  loadShazamHistory();
  setupShazamOrb();
}

function setupShazamOrb() {
  const orb = document.getElementById('shazamOrb');
  orb.addEventListener('click', async () => {
    if (state.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const orb = document.getElementById('shazamOrb');
    const status = document.getElementById('shazamStatus');
    const hint = document.getElementById('shazamHint');

    orb.classList.add('listening');
    status.textContent = 'Listening...';
    hint.textContent = 'Recording for 10 seconds — hold near the music';
    state.isRecording = true;
    state.audioChunks = [];

    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    state.mediaRecorder = mediaRecorder;

    mediaRecorder.addEventListener('dataavailable', e => {
      if (e.data.size > 0) state.audioChunks.push(e.data);
    });
    mediaRecorder.addEventListener('stop', async () => {
      stream.getTracks().forEach(t => t.stop());
      await sendToShazam();
    });

    mediaRecorder.start();
    setTimeout(() => { if (state.isRecording) stopRecording(); }, 10000);
  } catch (err) {
    toast('Microphone access denied', 'error');
  }
}

function stopRecording() {
  if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
    state.mediaRecorder.stop();
  }
  state.isRecording = false;
  const orb = document.getElementById('shazamOrb');
  const status = document.getElementById('shazamStatus');
  const hint = document.getElementById('shazamHint');
  if (orb) orb.classList.remove('listening');
  if (status) status.textContent = 'Identifying...';
  if (hint) hint.textContent = 'Analyzing the audio...';
}

async function sendToShazam() {
  const resultEl = document.getElementById('shazamResult');
  const status = document.getElementById('shazamStatus');
  const hint = document.getElementById('shazamHint');

  try {
    const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', blob, 'mic_capture.webm');

    const res = await fetch('/api/shazam', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.success && data.track) {
      const t = data.track;
      if (status) status.textContent = 'Found it! 🎵';
      if (hint) hint.textContent = 'Tap to identify again';

      resultEl.innerHTML = `
        ${t.thumbnail ? `<img src="${t.thumbnail}" alt="${escHtml(t.title)}" onerror="this.style.display='none'">` : ''}
        <div class="shazam-result-title">${escHtml(t.title)}</div>
        <div class="shazam-result-artist">${escHtml(t.artist)}</div>
        <div class="shazam-actions">
          ${t.youtube_id ? `
            <button class="btn-primary" onclick="playTrack({youtube_id:'${t.youtube_id}',title:'${escHtml(t.title)}',artist:'${escHtml(t.artist)}',thumbnail:'${t.youtube_thumbnail || t.thumbnail || ''}'})">
              ▶ Play
            </button>
            <button class="btn-secondary" onclick="navigateTo('search');setTimeout(()=>{document.getElementById('searchInput').value='${escHtml(t.title)} ${escHtml(t.artist)}';},100)">
              Search
            </button>
          ` : ''}
        </div>
      `;
      resultEl.classList.add('show');
      loadShazamHistory();
    } else {
      if (status) status.textContent = 'Not recognized';
      if (hint) hint.textContent = data.message || 'Try again with more of the song playing';
      toast('Could not identify the song — try again', 'error');
    }
  } catch (err) {
    if (status) status.textContent = 'Error';
    if (hint) hint.textContent = 'Something went wrong. Try again.';
    toast('Shazam failed: ' + err.message, 'error');
  }
}

async function loadShazamHistory() {
  const histEl = document.getElementById('shazamHistory');
  if (!histEl) return;
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    const items = data.shazams || [];

    if (!items.length) {
      histEl.innerHTML = `<p style="color:var(--text-3);font-size:0.85rem;padding:12px 0">No identifications yet</p>`;
      return;
    }

    histEl.innerHTML = items.map(s => `
      <div class="track-row" style="cursor:default">
        ${s.thumbnail ? `<img class="track-row-thumb" src="${s.thumbnail}" alt="" onerror="this.style.display='none'">` : `<div class="track-row-thumb"></div>`}
        <div class="track-row-info">
          <div class="track-row-name">${escHtml(s.detected_title || 'Unknown')}</div>
          <div class="track-row-artist">${escHtml(s.detected_artist || 'Unknown')}</div>
        </div>
        <div class="track-row-dur" style="font-size:0.7rem">${formatDate(s.detected_at)}</div>
        ${s.youtube_id ? `
          <div class="track-row-actions">
            <button class="row-btn" onclick="playTrack({youtube_id:'${s.youtube_id}',title:'${escHtml(s.detected_title || '')}',artist:'${escHtml(s.detected_artist || '')}',thumbnail:'${s.thumbnail || ''}'})">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </button>
          </div>` : ''}
      </div>
    `).join('');
  } catch {}
}

// ═══════════════════════════════════════════
// TRACK CARD RENDERER
// ═══════════════════════════════════════════
function renderTrackGrid(container, tracks) {
  container.innerHTML = '';
  tracks.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'track-card';
    card.dataset.index = i;
    card.innerHTML = `
      <div class="track-thumb">
        <img src="${t.thumbnail || ''}" alt="${escHtml(t.title)}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%23141428%22/></svg>'" />
        <div class="track-overlay">
          <button class="overlay-play" data-index="${i}">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <div class="overlay-actions">
            <button class="overlay-btn dl-btn" data-index="${i}" title="Download MP3">
              <svg viewBox="0 0 24 24" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button class="overlay-btn vid-btn" data-index="${i}" title="Play Video">
              <svg viewBox="0 0 24 24" stroke-width="2"><rect x="2" y="7" width="15" height="11" rx="2"/><path d="M17 9l5-3v12l-5-3V9z"/></svg>
            </button>
          </div>
        </div>
      </div>
      <div class="track-info">
        <div class="track-name">${escHtml(t.title)}</div>
        <div class="track-artist">${escHtml(t.artist || 'Unknown')}</div>
        <div class="track-meta">${t.duration_text || formatSecs(t.duration)} ${t.views ? '· ' + formatViews(t.views) : ''}</div>
      </div>
    `;
    container.appendChild(card);
  });

  // Events
  container.querySelectorAll('.overlay-play').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = parseInt(btn.dataset.index);
      playQueue(tracks, i);
    });
  });

  container.querySelectorAll('.track-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      const i = parseInt(card.dataset.index);
      playQueue(tracks, i);
    });
  });

  container.querySelectorAll('.dl-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const t = tracks[parseInt(btn.dataset.index)];
      await downloadTrack(t, '0');
    });
  });

  container.querySelectorAll('.vid-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const t = tracks[parseInt(btn.dataset.index)];
      playTrack(t, '1');
    });
  });
}

// ═══════════════════════════════════════════
// PLAYER
// ═══════════════════════════════════════════
function setupPlayer() {
  const playPauseBtn = document.getElementById('playPauseBtn');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const progressBar = document.getElementById('progressBar');
  const volumeSlider = document.getElementById('volumeSlider');
  const videoToggleBtn = document.getElementById('videoToggleBtn');

  playPauseBtn.addEventListener('click', togglePlayPause);
  prevBtn.addEventListener('click', playPrev);
  nextBtn.addEventListener('click', playNext);
  volumeSlider.addEventListener('input', () => {
    audioEl.volume = volumeSlider.value;
    videoEl.volume = volumeSlider.value;
  });

  progressBar.addEventListener('click', (e) => {
    const rect = progressBar.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const el = state.currentTrack?.format === '1' ? videoEl : audioEl;
    if (el.duration) el.currentTime = pct * el.duration;
  });

  [audioEl, videoEl].forEach(el => {
    el.addEventListener('timeupdate', updateProgress);
    el.addEventListener('ended', playNext);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('error', (e) => toast('Playback error — trying next...', 'error'));
  });

  videoToggleBtn?.addEventListener('click', () => {
    videoEl.style.display = videoEl.style.display === 'none' ? 'block' : 'none';
  });

  audioEl.volume = 0.8;
  videoEl.volume = 0.8;
}

async function playTrack(track, format = '0') {
  state.currentTrack = { ...track, format };
  updatePlayerUI(track);

  const playerBar = document.getElementById('playerBar');
  playerBar.style.opacity = '0.6';

  try {
    const streamUrl = `/api/stream?youtube_id=${track.youtube_id}&format=${format}`;
    const activeEl = format === '1' ? videoEl : audioEl;
    const inactiveEl = format === '1' ? audioEl : videoEl;

    inactiveEl.pause();
    inactiveEl.src = '';

    if (format === '1') {
      videoEl.style.display = 'block';
      document.getElementById('videoToggleBtn').style.display = 'flex';
    } else {
      videoEl.style.display = 'none';
      document.getElementById('videoToggleBtn').style.display = 'none';
    }

    activeEl.src = streamUrl;
    await activeEl.play();

    // Log play
    fetch('/api/play', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ youtube_id: track.youtube_id, title: track.title, artist: track.artist, thumbnail: track.thumbnail })
    }).catch(() => {});

    // Update playing card highlight
    highlightPlayingCard(track.youtube_id);
  } catch (err) {
    toast('Stream error: ' + err.message, 'error');
  }

  playerBar.style.opacity = '1';
}

function playLocalFile(path, title, type) {
  const activeEl = type === 'video' ? videoEl : audioEl;
  const inactiveEl = type === 'video' ? audioEl : videoEl;

  inactiveEl.pause();
  inactiveEl.src = '';

  if (type === 'video') {
    videoEl.style.display = 'block';
    document.getElementById('videoToggleBtn').style.display = 'flex';
  } else {
    videoEl.style.display = 'none';
    document.getElementById('videoToggleBtn').style.display = 'none';
  }

  updatePlayerUI({ title, artist: 'Local file', thumbnail: '' });
  activeEl.src = path;
  activeEl.play().catch(() => toast('Could not play file', 'error'));
}

function playQueue(tracks, index) {
  state.queue = tracks;
  state.queueIndex = index;
  playTrack(tracks[index]);
}

function playNext() {
  if (!state.queue.length) return;
  state.queueIndex = (state.queueIndex + 1) % state.queue.length;
  playTrack(state.queue[state.queueIndex]);
}

function playPrev() {
  if (!state.queue.length) return;
  const el = state.currentTrack?.format === '1' ? videoEl : audioEl;
  if (el.currentTime > 3) { el.currentTime = 0; return; }
  state.queueIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
  playTrack(state.queue[state.queueIndex]);
}

function togglePlayPause() {
  const el = state.currentTrack?.format === '1' ? videoEl : audioEl;
  if (!el.src) return;
  if (el.paused) el.play(); else el.pause();
}

function onPlay() {
  state.isPlaying = true;
  document.getElementById('playerBar').classList.add('playing');
  const playIcon = document.querySelector('.play-icon');
  const pauseIcon = document.querySelector('.pause-icon');
  if (playIcon) playIcon.style.display = 'none';
  if (pauseIcon) pauseIcon.style.display = 'block';
}

function onPause() {
  state.isPlaying = false;
  document.getElementById('playerBar').classList.remove('playing');
  const playIcon = document.querySelector('.play-icon');
  const pauseIcon = document.querySelector('.pause-icon');
  if (playIcon) playIcon.style.display = 'block';
  if (pauseIcon) pauseIcon.style.display = 'none';
}

function updatePlayerUI(track) {
  document.getElementById('playerTitle').textContent = track.title || '—';
  document.getElementById('playerArtist').textContent = track.artist || '';
  const thumb = document.getElementById('playerThumb');
  thumb.src = track.thumbnail || '';
  thumb.onerror = () => { thumb.src = ''; };
}

function updateProgress() {
  const el = state.currentTrack?.format === '1' ? videoEl : audioEl;
  if (!el.duration) return;
  const pct = (el.currentTime / el.duration) * 100;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressThumb').style.left = pct + '%';
  document.getElementById('timeCur').textContent = formatSecs(el.currentTime);
  document.getElementById('timeTot').textContent = formatSecs(el.duration);
}

function highlightPlayingCard(youtubeId) {
  document.querySelectorAll('.track-card').forEach(c => c.classList.remove('playing'));
  document.querySelectorAll('.track-row').forEach(r => r.classList.remove('playing'));
  // Find matching cards (basic — could be enhanced with data-id)
}

// ═══════════════════════════════════════════
// DOWNLOAD
// ═══════════════════════════════════════════
async function downloadTrack(track, format = '0') {
  toast(`Downloading "${track.title}"... this may take a moment ⏳`);
  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...track, format })
    });
    const data = await res.json();
    if (data.success) {
      toast(`Downloaded: ${data.filename} ✅`, 'success');
    } else {
      toast('Download failed: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    toast('Download error: ' + err.message, 'error');
  }
}

// ═══════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════
function emptyState(title, sub) {
  return `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M9 19V6l12-3v13"/><circle cx="6" cy="19" r="3"/><circle cx="18" cy="16" r="3"/>
      </svg>
      <strong>${title}</strong>
      <p>${sub}</p>
    </div>
  `;
}

function formatSecs(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatViews(v) {
  if (!v) return '';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B views';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M views';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K views';
  return v + ' views';
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escHtml(str) {
  if (!str) return '';
  return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function addToastContainer() {
  const tc = document.createElement('div');
  tc.className = 'toast-container';
  tc.id = 'toastContainer';
  document.body.appendChild(tc);
}

function toast(msg, type = 'info') {
  const tc = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  tc.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// Add waveform bars to player
document.addEventListener('DOMContentLoaded', () => {
  const playerInfo = document.querySelector('.player-info');
  if (playerInfo) {
    const bars = document.createElement('div');
    bars.className = 'waveform-bars';
    bars.innerHTML = '<span></span><span></span><span></span><span></span><span></span>';
    playerInfo.after(bars);
  }
});
