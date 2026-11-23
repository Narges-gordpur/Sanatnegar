'use strict';

const fs = require('fs');
const env = require('../config/env');
const { getDb } = require('../database/db');
const { cleanString } = require('../security/sanitizer');
const { safeResolveWithin } = require('../security/fileValidator');
const { generateCatalogPdf } = require('../services/pdfService');
const { logActivity } = require('../services/auditService');

exports.list = (req, res) => {
  const projectId = Number(req.query.project_id) || null;
  let rows = getDb().prepare(`
    SELECT c.*, p.name AS project_name
    FROM catalogs c
    JOIN projects p ON p.id = c.project_id
    ORDER BY c.id DESC
  `).all();
  if (projectId) rows = rows.filter(r => r.project_id === projectId);
  res.json({ catalogs: rows });
};

exports.generate = async (req, res) => {
  const projectId = Number(req.body?.project_id);
  const contentDraftId = Number(req.body?.content_draft_id) || null;
  const visualTheme = cleanString(req.body?.visual_theme || 'turquoise', 30);
  const language = cleanString(req.body?.language || 'fa', 10);

  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'پروژه یافت نشد.' });

  const product = db.prepare('SELECT * FROM products WHERE project_id = ? ORDER BY id ASC LIMIT 1').get(projectId) || { name: project.name };

  const facts = db.prepare(`
    SELECT f.*, d.original_filename AS document_filename, fe.page_number, fe.source_location, fe.evidence_text
    FROM extracted_facts f
    LEFT JOIN documents d ON d.id = f.document_id
    LEFT JOIN fact_evidence fe ON fe.fact_id = f.id
    WHERE f.project_id = ? AND f.status = 'approved'
    ORDER BY f.id ASC
  `).all(projectId);

  if (!facts.length) {
    return res.status(400).json({ error: 'برای تولید کاتالوگ مستند، حداقل یک مشخصه تأییدشده الزامی است.' });
  }

  let contentDraft = null;
  if (contentDraftId) {
    contentDraft = db.prepare(`
      SELECT cd.*, cv.body FROM content_drafts cd
      JOIN content_versions cv ON cv.draft_id = cd.id
      WHERE cd.id = ? AND cd.project_id = ?
      ORDER BY cv.version_number DESC LIMIT 1
    `).get(contentDraftId, projectId);
  }

  const maxVer = db.prepare('SELECT MAX(version_number) AS mv FROM catalogs WHERE project_id = ?').get(projectId).mv || 0;
  const nextVer = maxVer + 1;

  const pdfRes = await generateCatalogPdf({
    project,
    product,
    facts,
    contentDraft,
    visualTheme,
    language,
    versionNumber: nextVer
  });

  const info = db.prepare(`
    INSERT INTO catalogs (
      project_id, product_id, content_draft_id, version_number, title, visual_theme,
      language, filename, storage_path, file_size, fact_count, verified_only, sha256_hash, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    projectId, product.id || null, contentDraftId, nextVer,
    `${product.name} (نسخه ${nextVer})`, visualTheme, language,
    pdfRes.filename, pdfRes.storagePath, pdfRes.fileSize, facts.length, pdfRes.sha256, req.user.id
  );

  logActivity({
    user: req.user,
    projectId,
    action: 'تولید کاتالوگ PDF',
    entityType: 'catalog',
    entityId: info.lastInsertRowid,
    details: `${pdfRes.filename} (${pdfRes.engine}) · ${facts.length} مشخصه`,
    ip: req.ip
  });

  const catalog = db.prepare('SELECT * FROM catalogs WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ catalog, engine: pdfRes.engine });
};

exports.download = (req, res) => {
  const id = Number(req.params.id);
  const catalog = getDb().prepare('SELECT * FROM catalogs WHERE id = ?').get(id);
  if (!catalog) return res.status(404).json({ error: 'کاتالوگ یافت نشد.' });

  let safePath;
  try {
    safePath = safeResolveWithin(env.catalogsDir, require('path').basename(catalog.storage_path));
  } catch (err) {
    return res.status(403).json({ error: err.message });
  }
  if (!fs.existsSync(safePath)) {
    return res.status(404).json({ error: 'فایل PDF در مخزن سرور یافت نشد.' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(catalog.filename)}`);
  fs.createReadStream(safePath).pipe(res);
};

exports.remove = (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const cat = db.prepare('SELECT * FROM catalogs WHERE id = ?').get(id);
  if (!cat) return res.status(404).json({ error: 'کاتالوگ یافت نشد.' });
  db.prepare('DELETE FROM catalogs WHERE id = ?').run(id);
  try { if (cat.storage_path && fs.existsSync(cat.storage_path)) fs.unlinkSync(cat.storage_path); } catch { /* ignore */ }
  res.json({ ok: true });
};
