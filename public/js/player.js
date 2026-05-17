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
  const tempoBars = document.getElementById('tempoBars').querySelectorAll('span');
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
      // Move the persistent video element into the stage
      if (videoEl.parentElement !== videoStage) videoStage.prepend(videoEl);
      // Restore styles overridden by shell hidden state
      Object.assign(videoEl.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    } else {
      videoStage.hidden = true;
      cover.hidden = false;
      // Send video off-screen
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
  plSeek.addEventListener('pointerup',   (e) => { dragging = false; plSeek.classList.remove('dragging'); });

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

  // Volume — initialize from elements
  plVol.value = audioEl.volume;
  plVol.addEventListener('input', () => player.setVolume(parseFloat(plVol.value)));

  // ── Video overlay: click = toggle controls; double-tap left/right = seek ±10s ──
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
      // double-tap
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
      case 'ArrowUp':   plVol.value = Math.min(1, +plVol.value + .05); player.setVolume(+plVol.value); break;
      case 'ArrowDown': plVol.value = Math.max(0, +plVol.value - .05); player.setVolume(+plVol.value); break;
    }
  }
  document.addEventListener('keydown', keyHandler);

  // ── Tempo bars (driven by analyser) ──
  let rafId = null;
  const smooth = new Array(tempoBars.length).fill(0);
  function tick() {
    if (!player.analyser) {
      // Try set up analyser now (user gesture might have happened)
      player.setupAnalyser(el());
    }
    if (player.analyser && isPlaying() && player.mode === 'audio') {
      const buf = new Uint8Array(player.analyser.frequencyBinCount);
      player.analyser.getByteFrequencyData(buf);
      const slice = Math.floor(buf.length / tempoBars.length);
      tempoBars.forEach((bar, i) => {
        let sum = 0;
        for (let j = i * slice; j < (i + 1) * slice; j++) sum += buf[j];
        const avg = sum / slice / 255; // 0..1
        smooth[i] = smooth[i] * 0.65 + avg * 0.35;
        const h = 8 + smooth[i] * 92; // %
        bar.style.height = h + '%';
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

  // ── Cleanup when navigating away ──
  window.WAVR_PAGE_CLEANUP = () => {
    cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', keyHandler);
    player.onUpdate.delete(onUpdate);
    // Move video element back off-screen so it keeps playing in the background
    Object.assign(videoEl.style, { position: 'fixed', left: '-9999px', top: '-9999px', width: '1px', height: '1px' });
    document.body.appendChild(videoEl);
  };
})();
