(() => {
  const list = document.getElementById('dlList');
  fetch('/api/downloads').then(r => r.json()).then(items => {
    if (!items.length) {
      list.innerHTML = `<div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        <h3>No downloads yet</h3><p>Use the download icon on a search result.</p>
      </div>`; return;
    }
    list.innerHTML = `<div class="dl-count">${items.length} download${items.length>1?'s':''}</div><div class="track-list" id="dlRows"></div>`;
    const rows = document.getElementById('dlRows');
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'row';
      const type = it.format === 'mp4' ? 'video' : 'audio';
      row.innerHTML = `
        <div class="row-num">${i+1}</div>
        <div class="row-thumb">${it.thumbnail ? `<img src="${it.thumbnail}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:var(--r-sm)"/>` : ''}</div>
        <div class="row-info">
          <div class="row-name">${WAVR.escHtml(it.title)}</div>
          <div class="row-meta">${WAVR.escHtml(it.artist || 'Unknown')} <span class="badge ${type}">${it.format}</span></div>
        </div>
        <div class="row-dur dl-date">${new Date(it.downloaded_at).toLocaleDateString()}</div>
        <div class="row-actions">
          ${it.file_path ? `<a href="${it.file_path}" download class="icon-btn" title="Re-download" onclick="event.stopPropagation()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </a>` : ''}
        </div>`;
      row.addEventListener('click', () => {
        if (it.file_path) {
          WAVR.player.play({ file_path: it.file_path, title: it.title, artist: it.artist, thumbnail: it.thumbnail, type });
        } else {
          WAVR.player.play({ youtube_id: it.youtube_id, title: it.title, artist: it.artist, thumbnail: it.thumbnail, type });
        }
      });
      rows.appendChild(row);
    });
  });
})();
