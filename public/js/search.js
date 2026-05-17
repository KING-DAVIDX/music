(() => {
  const stage = document.getElementById('searchStage');
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClear');
  let lastResults = (WAVR.searchCache && WAVR.searchCache.results) || [];
  let lastQuery   = (WAVR.searchCache && WAVR.searchCache.query) || '';

  function renderEmpty() {
    stage.innerHTML = `
      <div class="tip-bg">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <h3>Search for music</h3>
        <p>Type a song, artist, lyric, or album. We'll find it on YouTube and stream it for you.</p>
      </div>`;
  }

  function renderHistory(searches) {
    stage.innerHTML = `
      <div class="history-wrap" id="histWrap">
        <div class="history-head">
          <div class="history-title">Your recent searches</div>
        </div>
        <div class="history-chips">
          ${searches.map(s => `<button class="chip" data-q="${WAVR.escHtml(s.query)}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><polyline points="12,7 12,12 15,15"/></svg>
            ${WAVR.escHtml(s.query)}
          </button>`).join('')}
        </div>
      </div>`;
    stage.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
      input.value = c.dataset.q; doSearch(c.dataset.q);
    }));
  }

  function renderResults(query, results) {
    stage.innerHTML = `
      <div class="results-head">
        <div class="results-count"><strong>${results.length}</strong> results for "${WAVR.escHtml(query)}"</div>
      </div>
      <div class="track-grid" id="resGrid"></div>`;
    const grid = document.getElementById('resGrid');
    results.forEach((t, i) => grid.appendChild(card(t, i, results)));
  }

  function card(t, i, all) {
    const el = document.createElement('div');
    el.className = 'track-card';
    el.innerHTML = `
      <div class="tc-thumb">
        ${t.thumbnail ? `<img src="${t.thumbnail}" alt="" loading="lazy"/>` : ''}
        <div class="tc-overlay">
          <button class="tc-play" title="Play">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
      </div>
      <div class="tc-info">
        <div class="tc-name">${WAVR.escHtml(t.title)}</div>
        <div class="tc-artist">${WAVR.escHtml(t.artist)} · ${t.duration_text || ''}</div>
      </div>
      <div class="tc-actions">
        <button class="tc-dl-btn tc-dl-audio" title="Download Audio" data-id="${WAVR.escHtml(t.youtube_id || '')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
          <svg class="dl-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        </button>
        <button class="tc-dl-btn tc-dl-video" title="Download Video" data-id="${WAVR.escHtml(t.youtube_id || '')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="7" width="15" height="10" rx="2"/><path d="M17 9l5-3v12l-5-3"/>
          </svg>
          <svg class="dl-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12l7 7 7-7"/>
          </svg>
        </button>
      </div>`;

    // Play on card/play-btn click
    el.querySelector('.tc-play').addEventListener('click', (e) => {
      e.stopPropagation();
      WAVR.player.setQueue(all, i);
    });
    el.querySelector('.tc-thumb').addEventListener('click', () => WAVR.player.setQueue(all, i));
    el.querySelector('.tc-info').addEventListener('click', () => WAVR.player.setQueue(all, i));

    // Download audio
    el.querySelector('.tc-dl-audio').addEventListener('click', (e) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      if (!id) return WAVR.toast('No video ID available');
      triggerDownload(id, 'audio', t.title);
    });

    // Download video
    el.querySelector('.tc-dl-video').addEventListener('click', (e) => {
      e.stopPropagation();
      const id = e.currentTarget.dataset.id;
      if (!id) return WAVR.toast('No video ID available');
      triggerDownload(id, 'video', t.title);
    });

    return el;
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

  async function doSearch(q) {
    q = q.trim();
    if (!q) return;
    const existing = stage.firstElementChild;
    if (existing) existing.classList.add('is-fading');
    setTimeout(async () => {
      stage.innerHTML = '<div class="spinner"></div>';
      try {
        const r = await fetch('/api/search?q=' + encodeURIComponent(q) + '&limit=24');
        const data = await r.json();
        lastResults = data.results || [];
        lastQuery = q;
        WAVR.searchCache = { results: lastResults, query: lastQuery };
        if (!lastResults.length) {
          stage.innerHTML = `<div class="empty-state"><h3>No results</h3><p>Try a different query.</p></div>`;
        } else {
          renderResults(q, lastResults);
        }
      } catch (e) {
        stage.innerHTML = `<p style="color:var(--text-2)">Search failed: ${e.message}</p>`;
      }
    }, 280);
  }

  input.addEventListener('input', () => { clearBtn.hidden = !input.value; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(input.value); });
  clearBtn.addEventListener('click', () => { input.value = ''; clearBtn.hidden = true; input.focus(); });

  if (lastResults.length) {
    renderResults(lastQuery, lastResults);
    input.value = lastQuery; clearBtn.hidden = false;
  } else {
    fetch('/api/history').then(r => r.json()).then(h => {
      const searches = (h.searches || []).slice(0, 10);
      if (searches.length) renderHistory(searches);
      else renderEmpty();
    }).catch(() => renderEmpty());
  }

  setTimeout(() => input.focus(), 80);
})();
