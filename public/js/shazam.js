(() => {
  const orb = document.getElementById('szOrb');
  const status = document.getElementById('szStatus');
  const viewMic = document.getElementById('szViewMic');
  const viewResult = document.getElementById('szViewResult');
  const history = document.getElementById('szHistory');

  let mediaRecorder = null, chunks = [], stream = null, recording = false, timer = null;

  // Pick a MIME the browser supports — server converts via ffmpeg.
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
      if (!items.length) { history.innerHTML = ''; return; }
      history.innerHTML = `<div class="sz-history-title">Recently identified</div>
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
      history.querySelectorAll('.row').forEach(r => r.addEventListener('click', () => {
        const yt = r.dataset.yt;
        if (yt) WAVR.player.play({ youtube_id: yt, title: r.dataset.title, artist: r.dataset.artist, thumbnail: r.dataset.thumb, type: 'audio' });
      }));
    } catch {}
  }

  async function startRec() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      WAVR.toast('Microphone access denied'); return;
    }
    const mime = pickMime();
    try {
      mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      mediaRecorder = new MediaRecorder(stream);
    }
    chunks = [];
    mediaRecorder.addEventListener('dataavailable', (e) => { if (e.data.size) chunks.push(e.data); });
    mediaRecorder.addEventListener('stop', () => { stream.getTracks().forEach(t => t.stop()); send(); });
    mediaRecorder.start();
    recording = true;
    orb.classList.add('listening');
    status.textContent = 'Listening… hold near the music';
    timer = setTimeout(stopRec, 10000);
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
    const ext = (blob.type.includes('mp4') ? 'mp4' : 'webm');
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

  // Cleanup
  window.WAVR_PAGE_CLEANUP = () => {
    try { if (recording) mediaRecorder.stop(); } catch {}
    if (stream) stream.getTracks().forEach(t => t.stop());
  };

  loadHistory();
})();
