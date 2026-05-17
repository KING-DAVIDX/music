(() => {
  const grid = document.getElementById('homeGrid');
  let data = null;

  async function load() {
    try {
      const res = await fetch('/api/trending');
      data = await res.json();
      if (!data.trending?.length) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 9h.01M15 9h.01M9 15c1 1 2 1.5 3 1.5s2-.5 3-1.5"/></svg>
            <h3>Nothing here yet</h3>
            <p>Search for some music to seed your recommendations.</p>
          </div>`;
        return;
      }
      grid.innerHTML = '';
      data.trending.forEach(t => grid.appendChild(card(t)));
    } catch (e) {
      grid.innerHTML = `<p style="color:var(--text-2)">Couldn't load: ${e.message}</p>`;
    }
  }

  function card(t) {
    const el = document.createElement('div');
    el.className = 'track-card';
    el.innerHTML = `
      <div class="tc-thumb">
        ${t.thumbnail ? `<img src="${t.thumbnail}" alt="" loading="lazy"/>` : ''}
        <div class="tc-overlay"><button class="tc-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button></div>
      </div>
      <div class="tc-info">
        <div class="tc-name">${WAVR.escHtml(t.title)}</div>
        <div class="tc-artist">${WAVR.escHtml(t.artist)}</div>
      </div>`;
    el.addEventListener('click', () => WAVR.player.setQueue(data.trending, data.trending.indexOf(t)));
    return el;
  }

  document.querySelectorAll('[data-action]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.action;
    if (a === 'most-played' && data?.most_played?.length) WAVR.player.setQueue(data.most_played, 0);
    else if (a === 'recent' && data?.trending?.length) WAVR.player.setQueue(data.trending, 0);
    else WAVR.toast('Nothing to play yet — start listening!');
  }));

  load();
})();
