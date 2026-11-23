'use strict';

const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { getDb } = require('../database/db');
const { validateUploadedFile } = require('../security/fileValidator');
const { processDocumentBuffer } = require('../document-processing');
const { extractFactsHybrid } = require('../ai/extractor');
const { syncAndListConflicts } = require('../services/conflictService');
const { logActivity } = require('../services/auditService');

exports.list = (req, res) => {
  const db = getDb();
  const projectId = Number(req.query.project_id) || null;
  const status = req.query.status || '';
  const q = (req.query.q || '').trim().toLowerCase();

  let rows = db.prepare(`
    SELECT d.*,
           p.name AS project_name,
           dv.version_number, dv.file_size, dv.page_count, dv.extraction_method,
           dv.ocr_used, dv.ocr_pages_json, dv.status AS version_status,
           dv.error_message, dv.warning_message, dv.processing_ms, dv.sha256_hash,
           LENGTH(dv.extracted_text) AS text_length
    FROM documents d
    JOIN projects p ON p.id = d.project_id
    LEFT JOIN document_versions dv ON dv.id = d.current_version_id
    ORDER BY d.id DESC
  `).all();

  if (projectId) rows = rows.filter(r => r.project_id === projectId);
  if (status) rows = rows.filter(r => r.status === status);
  if (q) rows = rows.filter(r => `${r.original_filename} ${r.project_name}`.toLowerCase().includes(q));

  res.json({ documents: rows });
};

exports.upload = async (req, res) => {
  const projectId = Number(req.body?.project_id || req.params.projectId);
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'پروژه یافت نشد.' });

  const product = db.prepare('SELECT * FROM products WHERE project_id = ? ORDER BY id ASC LIMIT 1').get(projectId);
  const files = req.files && req.files.length ? req.files : (req.file ? [req.file] : []);
  if (!files.length) return res.status(400).json({ error: 'هیچ فایلی برای بارگذاری انتخاب نشده است.' });

  const useAiExtraction = req.body?.use_ai === 'true' || req.body?.use_ai === true;
  const consentConfirmed = req.body?.consent_confirmed === 'true' || req.body?.consent_confirmed === true;
  const customAttributes = db.prepare('SELECT * FROM custom_attributes').all();

  const results = [];

  for (const file of files) {
    const validation = validateUploadedFile(file);
    if (!validation.ok) {
      logActivity({
        user: req.user,
        projectId,
        action: 'رد فایل نامعتبر در بارگذاری',
        details: `${file.originalname}: ${validation.error}`,
        securityEvent: true,
        ip: req.ip
      });
      results.push({ filename: file.originalname, ok: false, status: 'failed', error: validation.error });
      continue;
    }

    const storagePath = path.join(env.uploadsDir, validation.storedFilename);
    fs.writeFileSync(storagePath, file.buffer);

    // Check if document with same filename already exists in project -> create new version!
    let doc = db.prepare('SELECT * FROM documents WHERE project_id = ? AND original_filename = ?')
      .get(projectId, validation.cleanName);

    let nextVersion = 1;
    if (!doc) {
      const docId = db.prepare(`
        INSERT INTO documents (project_id, product_id, original_filename, file_type, mime_type, status)
        VALUES (?, ?, ?, ?, ?, 'processing')
      `).run(projectId, product?.id || null, validation.cleanName, validation.ext, file.mimetype || '').lastInsertRowid;
      doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(docId);
    } else {
      const maxV = db.prepare('SELECT MAX(version_number) AS mv FROM document_versions WHERE document_id = ?').get(doc.id).mv || 0;
      nextVersion = maxV + 1;
    }

    let parsed;
    try {
      parsed = await processDocumentBuffer(validation.ext, file.buffer);
    } catch (procErr) {
      parsed = {
        ok: false,
        status: 'failed',
        pagesCount: 0,
        extractedText: '',
        pagesJson: [],
        segments: [],
        extractionMethod: 'error',
        ocrUsed: false,
        ocrPages: [],
        errorMessage: procErr.message,
        processingMs: 0
      };
    }

    const verId = db.prepare(`
      INSERT INTO document_versions (
        document_id, version_number, stored_filename, storage_path, file_size, sha256_hash,
        page_count, extracted_text, pages_json, extraction_method, ocr_used, ocr_pages_json,
        status, error_message, warning_message, processing_ms, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      doc.id, nextVersion, validation.storedFilename, storagePath, validation.size, validation.sha256,
      parsed.pagesCount || 0, parsed.extractedText || '', JSON.stringify(parsed.pagesJson || []),
      parsed.extractionMethod || '', parsed.ocrUsed ? 1 : 0, JSON.stringify(parsed.ocrPages || []),
      parsed.status, parsed.errorMessage || '', parsed.warningMessage || '', parsed.processingMs || 0, req.user.id
    ).lastInsertRowid;

    db.prepare("UPDATE documents SET current_version_id = ?, status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(verId, parsed.status, doc.id);

    if (!parsed.ok) {
      logActivity({
        user: req.user,
        projectId,
        action: 'پردازش ناموفق سند',
        entityType: 'document',
        entityId: doc.id,
        details: `${validation.cleanName} (v${nextVersion}): ${parsed.errorMessage}`,
        ip: req.ip
      });
      results.push({
        document_id: doc.id,
        version_id: verId,
        version_number: nextVersion,
        filename: validation.cleanName,
        ok: false,
        status: 'failed',
        error: parsed.errorMessage
      });
      continue;
    }

    const extraction = await extractFactsHybrid({
      segments: parsed.segments,
      pagesJson: parsed.pagesJson,
      fullText: parsed.extractedText,
      customAttributes,
      projectId,
      userId: req.user.id,
      useAi: useAiExtraction,
      consentConfirmed
    });

    const insFact = db.prepare(`
      INSERT INTO extracted_facts (
        project_id, product_id, document_id, document_version_id, attribute_key, attribute_name,
        raw_value, raw_unit, normalized_value, standard_unit, unit_dimension,
        extraction_method, confidence, status, evidence_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insEv = db.prepare(`
      INSERT INTO fact_evidence (fact_id, document_id, document_version_id, page_number, source_location, evidence_text, exact_match)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertTx = db.transaction(factsList => {
      for (const f of factsList) {
        const fid = insFact.run(
          projectId, product?.id || null, doc.id, verId,
          f.attribute_key, f.attribute_name, f.raw_value, f.raw_unit,
          f.normalized_value, f.standard_unit, f.unit_dimension,
          f.extraction_method, f.confidence, f.status, f.evidence_verified
        ).lastInsertRowid;
        insEv.run(fid, doc.id, verId, f.page_number, f.source_location, f.evidence_text, f.exact_match);
      }
    });
    insertTx(extraction.facts);

    syncAndListConflicts(projectId);

    logActivity({
      user: req.user,
      projectId,
      action: 'پردازش سند',
      entityType: 'document',
      entityId: doc.id,
      details: `${validation.cleanName} (v${nextVersion}) · ${parsed.pagesCount} صفحه · ${extraction.facts.length} مشخصه${parsed.ocrUsed ? ' · با OCR' : ''}`,
      ip: req.ip
    });

    results.push({
      document_id: doc.id,
      version_id: verId,
      version_number: nextVersion,
      filename: validation.cleanName,
      ok: true,
      status: parsed.status,
      pages: parsed.pagesCount,
      ocr_used: parsed.ocrUsed,
      warning: parsed.warningMessage || '',
      facts_extracted: extraction.facts.length,
      ai_extraction: extraction.aiStatus
    });
  }

  res.status(201).json({ results });
};

exports.getDetail = (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc) return res.status(404).json({ error: 'سند یافت نشد.' });

  const versions = db.prepare(`
    SELECT id, version_number, file_size, sha256_hash, page_count, extracted_text, pages_json,
           extraction_method, ocr_used, ocr_pages_json, status, error_message, warning_message, processing_ms, created_at
    FROM document_versions WHERE document_id = ? ORDER BY version_number DESC
  `).all(id);

  res.json({ document: doc, versions });
};

exports.remove = (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc) return res.status(404).json({ error: 'سند یافت نشد.' });

  const versions = db.prepare('SELECT storage_path FROM document_versions WHERE document_id = ?').all(id);
  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  versions.forEach(v => {
    try { if (v.storage_path && fs.existsSync(v.storage_path)) fs.unlinkSync(v.storage_path); } catch { /* ignore */ }
  });

  syncAndListConflicts(doc.project_id);
  logActivity({ user: req.user, projectId: doc.project_id, action: 'حذف سند و نسخه‌ها', entityType: 'document', entityId: id, details: doc.original_filename, ip: req.ip });
  res.json({ ok: true });
};
