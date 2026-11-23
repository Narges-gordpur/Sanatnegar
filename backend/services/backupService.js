'use strict';

const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { getDb } = require('../database/db');

function exportProjectBundle(projectId) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;

  const products = db.prepare('SELECT * FROM products WHERE project_id = ?').all(projectId);
  const documents = db.prepare('SELECT id, project_id, product_id, original_filename, file_type, status, created_at FROM documents WHERE project_id = ?').all(projectId);
  const versions = db.prepare(`
    SELECT dv.id, dv.document_id, dv.version_number, dv.file_size, dv.sha256_hash, dv.page_count, dv.extraction_method, dv.ocr_used, dv.status, dv.created_at
    FROM document_versions dv
    JOIN documents d ON d.id = dv.document_id
    WHERE d.project_id = ?
  `).all(projectId);
  const facts = db.prepare('SELECT * FROM extracted_facts WHERE project_id = ?').all(projectId);
  const evidence = db.prepare(`
    SELECT fe.* FROM fact_evidence fe
    JOIN extracted_facts ef ON ef.id = fe.fact_id
    WHERE ef.project_id = ?
  `).all(projectId);
  const reviews = db.prepare(`
    SELECT fr.* FROM fact_reviews fr
    JOIN extracted_facts ef ON ef.id = fr.fact_id
    WHERE ef.project_id = ?
  `).all(projectId);
  const conflicts = db.prepare('SELECT * FROM conflicts WHERE project_id = ?').all(projectId);
  const drafts = db.prepare('SELECT * FROM content_drafts WHERE project_id = ?').all(projectId);
  const contentVersions = db.prepare(`
    SELECT cv.* FROM content_versions cv
    JOIN content_drafts cd ON cd.id = cv.draft_id
    WHERE cd.project_id = ?
  `).all(projectId);
  const catalogs = db.prepare('SELECT id, project_id, title, version_number, visual_theme, language, filename, file_size, fact_count, created_at FROM catalogs WHERE project_id = ?').all(projectId);

  return {
    exported_at: new Date().toISOString(),
    platform: 'SANATNEGAR v2.0',
    project,
    products,
    documents,
    document_versions: versions,
    facts,
    evidence,
    reviews,
    conflicts,
    content_drafts: drafts,
    content_versions: contentVersions,
    catalogs
  };
}

async function createSqliteBackup() {
  if (!fs.existsSync(env.exportsDir)) fs.mkdirSync(env.exportsDir, { recursive: true });
  const filename = `sanatnegar_backup_${Date.now()}.sqlite`;
  const dest = path.join(env.exportsDir, filename);
  await getDb().backup(dest);
  return { filename, path: dest, size: fs.statSync(dest).size };
}

module.exports = { exportProjectBundle, createSqliteBackup };
