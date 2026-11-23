'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const env = require('../config/env');

let dbInstance = null;

function ensureStorageDirs() {
  [
    path.dirname(env.sqlitePath),
    env.uploadsDir,
    env.catalogsDir,
    env.exportsDir,
    env.tessdataDir
  ].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function getDb(customPath = null) {
  if (dbInstance && !customPath) return dbInstance;
  ensureStorageDirs();
  const dbPath = customPath || env.sqlitePath;
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  if (!customPath) dbInstance = db;
  return db;
}

function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

module.exports = { getDb, closeDb, ensureStorageDirs };
