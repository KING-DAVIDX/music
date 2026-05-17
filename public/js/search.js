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
        <div class="tc-overlay"><button class="tc-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button></div>
      </div>
      <div class="tc-info">
        <div class="tc-name">${WAVR.escHtml(t.title)}</div>
        <div class="tc-artist">${WAVR.escHtml(t.artist)} · ${t.duration_text || ''}</div>
      </div>`;
    el.addEventListener('click', () => WAVR.player.setQueue(all, i));
    return el;
  }

  async function doSearch(q) {
    q = q.trim();
    if (!q) return;
    // fade out current stage content, then load
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

  // Init
  input.addEventListener('input', () => { clearBtn.hidden = !input.value; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(input.value); });
  clearBtn.addEventListener('click', () => { input.value = ''; clearBtn.hidden = true; input.focus(); });

  // Initial render
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
