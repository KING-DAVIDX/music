const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'musicapp.db'));

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    youtube_id TEXT UNIQUE,
    title TEXT NOT NULL,
    artist TEXT,
    thumbnail TEXT,
    duration INTEGER,
    format TEXT DEFAULT 'audio',
    file_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    youtube_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    thumbnail TEXT,
    duration INTEGER,
    format TEXT,
    file_path TEXT,
    downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL,
    results_count INTEGER,
    searched_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS play_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    youtube_id TEXT NOT NULL,
    title TEXT,
    artist TEXT,
    thumbnail TEXT,
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS shazam_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    detected_title TEXT,
    detected_artist TEXT,
    youtube_id TEXT,
    thumbnail TEXT,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Prepared statements
const stmts = {
  insertDownload: db.prepare(`
    INSERT INTO downloads (youtube_id, title, artist, thumbnail, duration, format, file_path)
    VALUES (@youtube_id, @title, @artist, @thumbnail, @duration, @format, @file_path)
  `),

  getRecentDownloads: db.prepare(`
    SELECT * FROM downloads ORDER BY downloaded_at DESC LIMIT ?
  `),

  insertSearch: db.prepare(`
    INSERT INTO search_history (query, results_count) VALUES (?, ?)
  `),

  getSearchHistory: db.prepare(`
    SELECT query, COUNT(*) as count FROM search_history
    GROUP BY query ORDER BY count DESC LIMIT ?
  `),

  insertPlay: db.prepare(`
    INSERT INTO play_history (youtube_id, title, artist, thumbnail)
    VALUES (@youtube_id, @title, @artist, @thumbnail)
  `),

  getRecentPlays: db.prepare(`
    SELECT * FROM play_history ORDER BY played_at DESC LIMIT ?
  `),

  getMostPlayed: db.prepare(`
    SELECT youtube_id, title, artist, thumbnail, COUNT(*) as play_count
    FROM play_history GROUP BY youtube_id
    ORDER BY play_count DESC LIMIT ?
  `),

  insertShazam: db.prepare(`
    INSERT INTO shazam_history (detected_title, detected_artist, youtube_id, thumbnail)
    VALUES (@detected_title, @detected_artist, @youtube_id, @thumbnail)
  `),

  getShazamHistory: db.prepare(`
    SELECT * FROM shazam_history ORDER BY detected_at DESC LIMIT ?
  `),

  getRecentSearchTerms: db.prepare(`
    SELECT DISTINCT query FROM search_history ORDER BY searched_at DESC LIMIT ?
  `)
};

module.exports = { db, stmts };
