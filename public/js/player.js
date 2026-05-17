(() => {
  const page = document.getElementById('plPage');
  const audioEl = document.getElementById('audioEl');
  const videoEl = document.getElementById('videoEl');
  const cover = document.getElementById('plCover');
  const coverImg = document.getElementById('plCoverImg');
  const videoStage = document.getElementById('plVideoStage');
  const overlay = document.getElementById('plVideoOverlay');
  const seekFlashL = document.getElementById('seekFlashL');
  const seekFlashR = document.getElementById('seekFlashR');
  const tempoBarsEl = document.getElementById('tempoBars');
  const tempoBars = tempoBarsEl.querySelectorAll('span');
  const plTitle = document.getElementById('plTitle');
  const plArtist = document.getElementById('plArtist');
  const plMode = document.getElementById('plMode');
  const plCur = document.getElementById('plCur');
  const plDur = document.getElementById('plDur');
  const plSeek = document.getElementById('plSeek');
  const plSeekFill = document.getElementById('plSeekFill');
  const plSeekThumb = document.getElementById('plSeekThumb');
  const plVol = document.getElementById('plVol');

  const player = WAVR.player;

  function el() { return player.mode === 'video' ? videoEl : audioEl; }
  function isPlaying() { const e = el(); return e && !e.paused && !e.ended; }
  function syncPlayingClass() { page.classList.toggle('is-playing', isPlaying()); }

  // ── Colorful bar palette ──
  const BAR_COLORS = [
    '#38bdf8', // cyan
    '#818cf8', // indigo
    '#f472b6', // pink
    '#34d399', // emerald
    '#fb923c', // orange
    '#a78bfa', // violet
    '#f87171', // coral
    '#facc15', // yellow
    '#2dd4bf', // teal
    '#e879f9', // fuchsia
    '#60a5fa', // blue
    '#4ade80', // green
  ];

  // Assign each bar a random color from the palette
  tempoBars.forEach((bar, i) => {
    bar.style.background = BAR_COLORS[i % BAR_COLORS.length];
    bar.style.boxShadow = `0 0 8px ${BAR_COLORS[i % BAR_COLORS.length]}88`;
  });

  // ── Render meta ──
  function renderMeta(t) {
    if (!t) {
      plTitle.textContent = 'Nothing playing';
      plArtist.textContent = '';
      cover.classList.remove('has-image');
      plMode.textContent = '';
      return;
    }
    plTitle.textContent = t.title || '—';
    plArtist.textContent = t.artist || '';
    plMode.textContent = (t.type === 'video') ? 'Video' : 'Audio';
    if (t.thumbnail) {
      coverImg.style.backgroundImage = `url("${t.thumbnail}")`;
      cover.classList.add('has-image');
    } else {
      coverImg.style.backgroundImage = '';
      cover.classList.remove('has-image');
    }

    if (t.type === 'video') {
      videoStage.hidden = false;
      cover.hidden = true;
      if (videoEl.parentElement !== videoStage) videoStage.prepend(videoEl);
      Object.assign(videoEl.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    } else {
      videoStage.hidden = true;
      cover.hidden = false;
      Object.assign(videoEl.style, { position: 'fixed', left: '-9999px', top: '-9999px', width: '1px', height: '1px' });
    }
  }

  // ── Seek bar ──
  function setSeek(cur, dur) {
    if (!isFinite(dur) || dur <= 0) {
      plSeekFill.style.width = '0%'; plSeekThumb.style.left = '0%';
      plDur.textContent = '0:00'; plCur.textContent = WAVR.fmtTime(cur || 0);
      return;
    }
    const pct = Math.max(0, Math.min(1, cur / dur));
    plSeekFill.style.width = (pct * 100) + '%';
    plSeekThumb.style.left = (pct * 100) + '%';
    plCur.textContent = WAVR.fmtTime(cur);
    plDur.textContent = WAVR.fmtTime(dur);
  }

  let dragging = false;
  function seekFromEvent(e) {
    const r = plSeek.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const pct = Math.max(0, Math.min(1, x / r.width));
    const d = el().duration || 0;
    if (d) el().currentTime = pct * d;
  }
  plSeek.addEventListener('pointerdown', (e) => {
    dragging = true; plSeek.classList.add('dragging');
    plSeek.setPointerCapture(e.pointerId);
    seekFromEvent(e);
  });
  plSeek.addEventListener('pointermove', (e) => { if (dragging) seekFromEvent(e); });
  plSeek.addEventListener('pointerup',   () => { dragging = false; plSeek.classList.remove('dragging'); });

  // ── Controls ──
  document.getElementById('plPlay').addEventListener('click', () => player.toggle());
  document.getElementById('plNext').addEventListener('click', () => player.next());
  document.getElementById('plPrev').addEventListener('click', () => player.prev());
  document.getElementById('plBack').addEventListener('click', () => history.length > 1 ? history.back() : WAVR.navigate('/'));
  document.getElementById('plVideoCenterPlay').addEventListener('click', () => player.toggle());

  let shuffle = false, repeat = false;
  document.getElementById('plShuffle').addEventListener('click', (e) => {
    shuffle = !shuffle; e.currentTarget.classList.toggle('active', shuffle);
    WAVR.toast(shuffle ? 'Shuffle on' : 'Shuffle off');
  });
  document.getElementById('plRepeat').addEventListener('click', (e) => {
    repeat = !repeat; e.currentTarget.classList.toggle('active', repeat);
    audioEl.loop = repeat; videoEl.loop = repeat;
    WAVR.toast(repeat ? 'Repeat on' : 'Repeat off');
  });

  plVol.value = audioEl.volume;
  plVol.addEventListener('input', () => player.setVolume(parseFloat(plVol.value)));

  // ── Download modal ──
  document.getElementById('plDownloadBtn').addEventListener('click', () => {
    const t = player.current;
    if (!t || !t.youtube_id) { WAVR.toast('Nothing playing to download'); return; }
    showDownloadModal(t);
  });

  function showDownloadModal(t) {
    // Remove existing modal if any
    const existing = document.getElementById('plDlModalBackdrop');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'plDlModalBackdrop';
    backdrop.className = 'pl-dl-modal-backdrop';
    backdrop.innerHTML = `
      <div class="pl-dl-modal">
        <div class="pl-dl-modal-title">Download</div>
        <div class="pl-dl-modal-sub">${WAVR.escHtml ? WAVR.escHtml(t.title || 'Track') : (t.title || 'Track')}</div>
        <div class="pl-dl-options">
          <button class="pl-dl-option audio" id="dlOptAudio">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
            Audio
            <span style="font-size:.75rem;color:var(--text-3);font-weight:400">MP3</span>
          </button>
          <button class="pl-dl-option video" id="dlOptVideo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="7" width="15" height="10" rx="2"/><path d="M17 9l5-3v12l-5-3"/>
            </svg>
            Video
            <span style="font-size:.75rem;color:var(--text-3);font-weight:400">MP4</span>
          </button>
        </div>
        <button class="pl-dl-modal-cancel" id="dlCancel">Cancel</button>
      </div>`;

    document.body.appendChild(backdrop);

    document.getElementById('dlOptAudio').addEventListener('click', () => {
      triggerDownload(t.youtube_id, 'audio', t.title);
      backdrop.remove();
    });
    document.getElementById('dlOptVideo').addEventListener('click', () => {
      triggerDownload(t.youtube_id, 'video', t.title);
      backdrop.remove();
    });
    document.getElementById('dlCancel').addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  }

  function triggerDownload(youtubeId, format, title) {
    const url = `/api/download?id=${encodeURIComponent(youtubeId)}&format=${format}`;
    WAVR.toast(`Starting ${format} download…`);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || youtubeId}.${format === 'audio' ? 'mp3' : 'mp4'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Video overlay double-tap ──
  let lastTap = 0, lastTapSide = null, controlsTimer = null;
  function showControls() {
    overlay.classList.add('show-controls');
    clearTimeout(controlsTimer);
    controlsTimer = setTimeout(() => overlay.classList.remove('show-controls'), 2200);
  }
  overlay.addEventListener('click', (e) => {
    const r = overlay.getBoundingClientRect();
    const side = (e.clientX - r.left) < r.width / 2 ? 'L' : 'R';
    const now = Date.now();
    if (now - lastTap < 320 && side === lastTapSide) {
      if (side === 'L') { player.seekRel(-10); seekFlashL.classList.remove('flash'); void seekFlashL.offsetWidth; seekFlashL.classList.add('flash'); }
      else              { player.seekRel(+10); seekFlashR.classList.remove('flash'); void seekFlashR.offsetWidth; seekFlashR.classList.add('flash'); }
      lastTap = 0;
    } else {
      lastTap = now; lastTapSide = side;
      showControls();
    }
  });

  // ── Keyboard ──
  function keyHandler(e) {
    if (location.pathname !== '/player') return;
    if (e.target.matches('input,textarea')) return;
    switch (e.key) {
      case ' ': e.preventDefault(); player.toggle(); break;
      case 'ArrowRight': player.seekRel(+5); break;
      case 'ArrowLeft':  player.seekRel(-5); break;
      case 'ArrowUp':    plVol.value = Math.min(1, +plVol.value + .05); player.setVolume(+plVol.value); break;
      case 'ArrowDown':  plVol.value = Math.max(0, +plVol.value - .05); player.setVolume(+plVol.value); break;
    }
  }
  document.addEventListener('keydown', keyHandler);

  // ── Random colorful tempo bars animation ──
  // Each bar animates independently on its own random schedule, no analyser needed
  let rafId = null;
  const barStates = Array.from(tempoBars).map(() => ({
    current: 4,
    target: 4,
    speed: 0.04 + Math.random() * 0.08,
    nextChangeAt: 0,
    interval: 80 + Math.random() * 200,
  }));

  function tick(timestamp) {
    if (isPlaying() && player.mode === 'audio') {
      barStates.forEach((state, i) => {
        // Pick new random target height every so often
        if (timestamp >= state.nextChangeAt) {
          state.target = 8 + Math.random() * 88; // % height
          state.nextChangeAt = timestamp + state.interval + Math.random() * 100;
        }
        // Smooth towards target
        state.current += (state.target - state.current) * state.speed * 1.8;
        tempoBars[i].style.height = state.current + '%';
      });
    } else {
      // Collapse bars when paused
      barStates.forEach((state, i) => {
        state.current += (4 - state.current) * 0.1;
        tempoBars[i].style.height = state.current + '%';
      });
    }
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  // ── Subscribe to player events ──
  function onUpdate(ev, data) {
    if (ev === 'meta') renderMeta(data);
    else if (ev === 'time') setSeek(data.current, data.duration);
    else if (ev === 'state') syncPlayingClass();
  }
  player.onUpdate.add(onUpdate);

  // Initial paint
  renderMeta(player.current);
  const e0 = el();
  setSeek(e0.currentTime || 0, e0.duration || 0);
  syncPlayingClass();

  // ── Cleanup ──
  window.WAVR_PAGE_CLEANUP = () => {
    cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', keyHandler);
    player.onUpdate.delete(onUpdate);
    const modal = document.getElementById('plDlModalBackdrop');
    if (modal) modal.remove();
    Object.assign(videoEl.style, { position: 'fixed', left: '-9999px', top: '-9999px', width: '1px', height: '1px' });
    document.body.appendChild(videoEl);
  };
})();
