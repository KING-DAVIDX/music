(() => {
  const orb = document.getElementById('szOrb');
  const status = document.getElementById('szStatus');
  const viewMic = document.getElementById('szViewMic');
  const viewResult = document.getElementById('szViewResult');
  const historyEl = document.getElementById('szHistory');

  let mediaRecorder = null, chunks = [], stream = null, recording = false, timer = null;

  function pickMime() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const t of types) if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
    return '';
  }

  function showMicView() {
    viewResult.hidden = true;
    viewMic.hidden = false;
    status.textContent = 'Tap to start';
    orb.classList.remove('listening');
    loadHistory();
  }

  async function loadHistory() {
    try {
      const h = await fetch('/api/history').then(r => r.json());
      const items = (h.shazams || []).slice(0, 6);
      if (!items.length) { historyEl.innerHTML = ''; return; }
      historyEl.innerHTML = `<div class="sz-history-title">Recently identified</div>
        <div class="track-list">${items.map(i => `
          <div class="row" data-yt="${i.youtube_id || ''}" data-title="${WAVR.escHtml(i.detected_title || '')}" data-artist="${WAVR.escHtml(i.detected_artist || '')}" data-thumb="${i.thumbnail || ''}">
            <div class="row-num"></div>
            <div class="row-thumb">${i.thumbnail ? `<img src="${i.thumbnail}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:var(--r-sm)"/>` : ''}</div>
            <div class="row-info">
              <div class="row-name">${WAVR.escHtml(i.detected_title || 'Unknown')}</div>
              <div class="row-meta">${WAVR.escHtml(i.detected_artist || '')}</div>
            </div>
            <div class="row-dur"></div>
            <div class="row-actions"></div>
          </div>`).join('')}</div>`;
      historyEl.querySelectorAll('.row').forEach(r => r.addEventListener('click', () => {
        const yt = r.dataset.yt;
        if (yt) WAVR.player.play({ youtube_id: yt, title: r.dataset.title, artist: r.dataset.artist, thumbnail: r.dataset.thumb, type: 'audio' });
      }));
    } catch {}
  }

  // ─────────────────────────────────────────────
  // CAPTURE STRATEGY
  // We try three approaches in order:
  //   1. getDisplayMedia({ audio: true, video: false })
  //      → captures internal audio / tab audio on desktop (Chrome/Edge).
  //      → on Android Chrome it may prompt to share a tab/screen with audio.
  //   2. getUserMedia({ audio: { ...echoCancellation off } })
  //      → plain mic, best for external sources.
  //   3. Fail gracefully.
  // ─────────────────────────────────────────────
  async function getInternalAudioStream() {
    // getDisplayMedia with audio-only is the key trick for internal playback capture.
    // Chrome 74+ supports this. On mobile Chrome it opens a tab-picker.
    // We suppress video because we only need audio.
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: false,     // Chrome may still require video:true on some versions
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 44100,
        },
      });
      // If browser forced a video track, immediately stop it so we're audio-only
      s.getVideoTracks().forEach(t => t.stop());
      return { stream: s, mode: 'internal' };
    } catch (e) {
      if (e.name === 'NotSupportedError' || e.name === 'TypeError') {
        // Browser doesn't support video:false for getDisplayMedia; try with video:true
        try {
          const s = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
            },
          });
          s.getVideoTracks().forEach(t => t.stop());
          return { stream: s, mode: 'internal' };
        } catch {}
      }
      // User cancelled or permission denied — fall through
      return null;
    }
  }

  async function getMicStream() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      return { stream: s, mode: 'mic' };
    } catch (e) {
      return null;
    }
  }

  async function startRec() {
    orb.classList.add('listening');
    status.textContent = 'Choosing audio source…';

    let result = null;

    // Check if browser likely supports internal capture
    const supportsDisplay = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

    if (supportsDisplay) {
      // Show a modal letting the user choose between internal and mic
      result = await promptSourceChoice();
    } else {
      // Fallback straight to mic
      result = await getMicStream();
      if (!result) {
        WAVR.toast('Microphone access denied');
        orb.classList.remove('listening');
        status.textContent = 'Tap to start';
        return;
      }
    }

    if (!result) {
      orb.classList.remove('listening');
      status.textContent = 'Tap to start';
      return;
    }

    stream = result.stream;
    const captureMode = result.mode;

    status.textContent = captureMode === 'internal'
      ? 'Capturing phone audio… play your song!'
      : 'Listening via mic… hold near the music';

    const mime = pickMime();
    try {
      mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      mediaRecorder = new MediaRecorder(stream);
    }
    chunks = [];
    mediaRecorder.addEventListener('dataavailable', (e) => { if (e.data.size) chunks.push(e.data); });
    mediaRecorder.addEventListener('stop', () => {
      stream.getTracks().forEach(t => t.stop());
      send();
    });
    mediaRecorder.start();
    recording = true;
    timer = setTimeout(stopRec, 10000);
  }

  // ── Source choice modal ──
  function promptSourceChoice() {
    return new Promise((resolve) => {
      // Remove any existing modal
      const old = document.getElementById('szSourceModal');
      if (old) old.remove();

      const modal = document.createElement('div');
      modal.id = 'szSourceModal';
      modal.style.cssText = `
        position:fixed;inset:0;z-index:999;
        background:rgba(0,0,0,.6);backdrop-filter:blur(10px);
        display:flex;align-items:flex-end;justify-content:center;
        animation:szModalIn .22s ease;
      `;
      modal.innerHTML = `
        <style>
          @keyframes szModalIn { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:none} }
          .sz-src-modal {
            width:100%;max-width:480px;
            background:var(--card);border:1px solid var(--border-2);
            border-radius:20px 20px 0 0;padding:28px 24px 44px;
            text-align:left;
          }
          .sz-src-title { font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:1.1rem;margin-bottom:6px; }
          .sz-src-sub { color:var(--text-2);font-size:.85rem;margin-bottom:22px; }
          .sz-src-options { display:flex;flex-direction:column;gap:10px;margin-bottom:16px; }
          .sz-src-opt {
            display:flex;align-items:center;gap:14px;
            padding:14px 16px;border-radius:12px;
            border:1.5px solid var(--border-2);background:var(--surface);
            cursor:pointer;transition:all .18s;text-align:left;
          }
          .sz-src-opt:hover { border-color:var(--c-1);background:rgba(56,189,248,.07); }
          .sz-src-opt-icon {
            width:40px;height:40px;border-radius:10px;
            display:flex;align-items:center;justify-content:center;
            flex-shrink:0;
          }
          .sz-src-opt-icon.internal { background:linear-gradient(135deg,#38bdf8,#818cf8); }
          .sz-src-opt-icon.mic      { background:linear-gradient(135deg,#34d399,#38bdf8); }
          .sz-src-opt-icon svg { width:20px;height:20px;color:white; }
          .sz-src-opt-label { font-weight:600;font-size:.95rem; }
          .sz-src-opt-desc  { color:var(--text-2);font-size:.78rem;margin-top:2px; }
          .sz-src-cancel { width:100%;text-align:center;padding:12px;color:var(--text-2);font-size:.88rem;cursor:pointer;border-radius:10px;transition:background .18s; }
          .sz-src-cancel:hover { background:var(--surface-2);color:var(--text); }
        </style>
        <div class="sz-src-modal">
          <div class="sz-src-title">Choose audio source</div>
          <div class="sz-src-sub">How should WAVR listen for the song?</div>
          <div class="sz-src-options">
            <button class="sz-src-opt" id="szSrcInternal">
              <div class="sz-src-opt-icon internal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                </svg>
              </div>
              <div>
                <div class="sz-src-opt-label">Phone / Device audio</div>
                <div class="sz-src-opt-desc">Capture songs playing directly on this device — no external speaker needed</div>
              </div>
            </button>
            <button class="sz-src-opt" id="szSrcMic">
              <div class="sz-src-opt-icon mic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z"/><path d="M19 11v1a7 7 0 01-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/>
                </svg>
              </div>
              <div>
                <div class="sz-src-opt-label">Microphone</div>
                <div class="sz-src-opt-desc">Listen via mic — hold near an external speaker or another phone</div>
              </div>
            </button>
          </div>
          <button class="sz-src-cancel" id="szSrcCancel">Cancel</button>
        </div>`;

      document.body.appendChild(modal);

      document.getElementById('szSrcInternal').addEventListener('click', async () => {
        modal.remove();
        const r = await getInternalAudioStream();
        if (!r) {
          // User cancelled the display picker — fall back to mic silently
          const mic = await getMicStream();
          resolve(mic);
        } else {
          resolve(r);
        }
      });

      document.getElementById('szSrcMic').addEventListener('click', async () => {
        modal.remove();
        const r = await getMicStream();
        if (!r) WAVR.toast('Microphone access denied');
        resolve(r);
      });

      document.getElementById('szSrcCancel').addEventListener('click', () => {
        modal.remove();
        resolve(null);
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) { modal.remove(); resolve(null); }
      });
    });
  }

  function stopRec() {
    if (!recording) return;
    recording = false;
    clearTimeout(timer);
    orb.classList.remove('listening');
    status.textContent = 'Identifying…';
    try { mediaRecorder.stop(); } catch {}
  }

  async function send() {
    if (!chunks.length) { status.textContent = 'Tap to start'; return; }
    const blob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' });
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const fd = new FormData();
    fd.append('audio', blob, `clip.${ext}`);
    try {
      const res = await fetch('/api/shazam', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.success) { status.textContent = data.message || "Couldn't identify — try again"; return; }
      showResult(data.track);
    } catch (e) {
      status.textContent = 'Error: ' + e.message;
    }
  }

  function showResult(track) {
    const cover = track.thumbnail || track.background || '';
    viewMic.hidden = true;
    viewResult.hidden = false;
    viewResult.innerHTML = `
      ${cover ? `<div class="sz-result-bg" style="background-image:url('${cover}')"></div>` : ''}
      <div class="sz-found-label">Found it</div>
      <div class="sz-result-cover">${cover ? `<img src="${cover}" alt=""/>` : ''}</div>
      <div class="sz-track-title">${WAVR.escHtml(track.title)}</div>
      <div class="sz-track-artist">${WAVR.escHtml(track.artist)}</div>
      ${track.genre ? `<div class="sz-track-genre">${WAVR.escHtml(track.genre)}</div>` : ''}
      <div class="sz-actions">
        ${track.youtube_id ? `<button class="sz-btn primary" id="szPlay">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          Play this song
        </button>` : ''}
        ${track.shazam_url ? `<a class="sz-btn ghost" href="${track.shazam_url}" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Open in Shazam
        </a>` : ''}
        <button class="sz-btn ghost" id="szAgain">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z"/><path d="M19 11v1a7 7 0 01-14 0v-1"/></svg>
          Listen again
        </button>
      </div>`;
    const playBtn = document.getElementById('szPlay');
    if (playBtn) playBtn.addEventListener('click', () => {
      WAVR.player.play({
        youtube_id: track.youtube_id, title: track.title, artist: track.artist,
        thumbnail: track.youtube_thumbnail || track.thumbnail, type: 'audio'
      });
      WAVR.navigate('/player');
    });
    document.getElementById('szAgain').addEventListener('click', showMicView);
  }

  orb.addEventListener('click', () => recording ? stopRec() : startRec());

  window.WAVR_PAGE_CLEANUP = () => {
    try { if (recording) mediaRecorder.stop(); } catch {}
    if (stream) stream.getTracks().forEach(t => t.stop());
    const modal = document.getElementById('szSourceModal');
    if (modal) modal.remove();
  };

  loadHistory();
})();
