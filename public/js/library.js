(() => {
  const list = document.getElementById('libList');
  fetch('/api/library').then(r => r.json()).then(files => {
    if (!files.length) {
      list.innerHTML = `<div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h4v16H4zM10 4h4v16h-4zM16 6l4 1-3 14-4-1z"/></svg>
        <h3>Your library is empty</h3><p>Download something from a search and it'll land here.</p>
      </div>`; return;
    }
    list.innerHTML = `<div class="lib-count">${files.length} file${files.length>1?'s':''}</div><div class="track-list" id="libRows"></div>`;
    const rows = document.getElementById('libRows');
    files.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'row';
      const iconSvg = f.type === 'video'
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
      row.innerHTML = `
        <div class="row-num">${i+1}</div>
        <div class="row-thumb">${iconSvg}</div>
        <div class="row-info">
          <div class="row-name">${WAVR.escHtml(f.title)}</div>
          <div class="row-meta"><span class="badge ${f.type}">${f.type}</span></div>
        </div>
        <div class="row-dur"></div>
        <div class="row-actions">
          <a href="${f.path}" download class="icon-btn" title="Download" onclick="event.stopPropagation()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </a>
        </div>`;
      row.addEventListener('click', () => {
        WAVR.player.play({ file_path: f.path, title: f.title, artist: 'Local', type: f.type });
      });
      rows.appendChild(row);
    });
  });
})();
