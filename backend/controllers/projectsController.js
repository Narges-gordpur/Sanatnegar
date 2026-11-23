'use strict';

const fs = require('fs');
const { getDb } = require('../database/db');
const { cleanString } = require('../security/sanitizer');
const { logActivity } = require('../services/auditService');
const { analyzeMarketingReadiness } = require('../services/readinessService');
const { exportProjectBundle } = require('../services/backupService');
const { answerProductQuestion } = require('../ai/assistant');
const { canonicalAttribute } = require('../services/units');

exports.list = (req, res) => {
  const db = getDb();
  const q = cleanString(req.query.q || '', 120).toLowerCase();
  const rows = db.prepare(`
    SELECT p.*,
      pr.id AS product_id,
      pr.name AS product_name,
      pr.product_code,
      pr.manufacturer,
      pr.model_name,
      pr.brand_name,
      pr.contact_info,
      (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id AND d.status IN ('processed','warning_scanned')) AS doc_count,
      (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id AND d.status = 'failed') AS failed_doc_count,
      (SELECT COUNT(*) FROM extracted_facts f WHERE f.project_id = p.id) AS total_facts,
      (SELECT COUNT(*) FROM extracted_facts f WHERE f.project_id = p.id AND f.status = 'approved') AS approved_facts,
      (SELECT COUNT(*) FROM extracted_facts f WHERE f.project_id = p.id AND f.status = 'pending_review') AS pending_facts,
      (SELECT COUNT(*) FROM conflicts c WHERE c.project_id = p.id AND c.status = 'open') AS open_conflicts,
      (SELECT COUNT(*) FROM content_drafts cd WHERE cd.project_id = p.id) AS content_count,
      (SELECT COUNT(*) FROM catalogs cat WHERE cat.project_id = p.id) AS catalog_count
    FROM projects p
    LEFT JOIN products pr ON pr.project_id = p.id
    ORDER BY p.is_demo ASC, p.id DESC
  `).all();

  const filtered = q
    ? rows.filter(r => `${r.name} ${r.product_code || ''} ${r.manufacturer || ''} ${r.sector}`.toLowerCase().includes(q))
    : rows;
  res.json({ projects: filtered });
};

exports.create = (req, res) => {
  const name = cleanString(req.body?.name, 200);
  if (!name) return res.status(400).json({ error: 'نام محصول / پروژه الزامی است.' });

  const sector = cleanString(req.body?.sector || 'صنعت و تولید', 100);
  const productCode = cleanString(req.body?.product_code || '', 100);
  const manufacturer = cleanString(req.body?.manufacturer || '', 150);
  const modelName = cleanString(req.body?.model_name || productCode, 120);
  const brandName = cleanString(req.body?.brand_name || manufacturer, 150);
  const contactInfo = cleanString(req.body?.contact_info || '', 300);
  const description = cleanString(req.body?.description || '', 1000);

  const db = getDb();
  const tx = db.transaction(() => {
    const pId = db.prepare(`
      INSERT INTO projects (user_id, name, description, sector)
      VALUES (?, ?, ?, ?)
    `).run(req.user.id, name, description, sector).lastInsertRowid;

    const prodId = db.prepare(`
      INSERT INTO products (project_id, name, product_code, manufacturer, model_name, category, brand_name, contact_info)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(pId, name, productCode, manufacturer, modelName, sector, brandName, contactInfo).lastInsertRowid;

    return { pId, prodId };
  });

  const { pId, prodId } = tx();
  logActivity({
    user: req.user,
    projectId: pId,
    action: 'ایجاد پرونده محصول',
    entityType: 'project',
    entityId: pId,
    details: `${name} (${sector})`,
    ip: req.ip
  });

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(pId);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(prodId);
  res.status(201).json({ project, product });
};

exports.getDetail = (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return res.status(404).json({ error: 'پروژه یافت نشد.' });

  const product = db.prepare('SELECT * FROM products WHERE project_id = ? ORDER BY id ASC LIMIT 1').get(id) || {};
  const docs = db.prepare(`
    SELECT d.*,
           dv.version_number, dv.file_size, dv.page_count, dv.extraction_method, dv.ocr_used, dv.ocr_pages_json,
           dv.status AS version_status, dv.error_message, dv.warning_message, dv.processing_ms, dv.sha256_hash
    FROM documents d
    LEFT JOIN document_versions dv ON dv.id = d.current_version_id
    WHERE d.project_id = ?
    ORDER BY d.id DESC
  `).all(id);

  const facts = db.prepare(`
    SELECT f.*, d.original_filename AS document_filename, dv.version_number AS document_version_number,
           fe.page_number, fe.source_location, fe.evidence_text, fe.exact_match
    FROM extracted_facts f
    LEFT JOIN documents d ON d.id = f.document_id
    LEFT JOIN document_versions dv ON dv.id = f.document_version_id
    LEFT JOIN fact_evidence fe ON fe.fact_id = f.id
    WHERE f.project_id = ?
    ORDER BY f.id DESC
  `).all(id);

  const readiness = analyzeMarketingReadiness(id);

  res.json({ project, product, documents: docs, facts, readiness });
};

exports.update = (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return res.status(404).json({ error: 'پروژه یافت نشد.' });

  const name = cleanString(req.body?.name || project.name, 200);
  const sector = cleanString(req.body?.sector || project.sector, 100);
  const description = cleanString(req.body?.description ?? project.description, 1000);
  const productCode = cleanString(req.body?.product_code ?? '', 100);
  const manufacturer = cleanString(req.body?.manufacturer ?? '', 150);
  const brandName = cleanString(req.body?.brand_name ?? manufacturer, 150);
  const contactInfo = cleanString(req.body?.contact_info ?? '', 300);

  db.transaction(() => {
    db.prepare("UPDATE projects SET name = ?, sector = ?, description = ?, updated_at = datetime('now') WHERE id = ?")
      .run(name, sector, description, id);
    db.prepare(`
      UPDATE products SET name = ?, product_code = ?, manufacturer = ?, brand_name = ?, contact_info = ?, updated_at = datetime('now')
      WHERE project_id = ?
    `).run(name, productCode, manufacturer, brandName, contactInfo, id);
  })();

  logActivity({ user: req.user, projectId: id, action: 'ویرایش پرونده محصول', entityType: 'project', entityId: id, details: name, ip: req.ip });
  res.json({ ok: true });
};

exports.remove = (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return res.status(404).json({ error: 'پروژه یافت نشد.' });

  // Collect stored files before cascade delete
  const files = db.prepare(`
    SELECT dv.storage_path FROM document_versions dv
    JOIN documents d ON d.id = dv.document_id
    WHERE d.project_id = ?
  `).all(id);
  const catFiles = db.prepare('SELECT storage_path FROM catalogs WHERE project_id = ?').all(id);

  db.prepare('DELETE FROM projects WHERE id = ?').run(id);

  [...files, ...catFiles].forEach(f => {
    try { if (f.storage_path && fs.existsSync(f.storage_path)) fs.unlinkSync(f.storage_path); } catch { /* ignore */ }
  });

  logActivity({ user: req.user, action: 'حذف پروژه و فایل‌های مرتبط', entityType: 'project', entityId: id, details: project.name, ip: req.ip });
  res.json({ ok: true });
};

exports.passport = (req, res) => {
  const id = Number(req.params.id);
  const bundle = exportProjectBundle(id);
  if (!bundle) return res.status(404).json({ error: 'پروژه یافت نشد.' });
  const readiness = analyzeMarketingReadiness(id);
  res.json({ ...bundle, readiness });
};

exports.exportJson = (req, res) => {
  const id = Number(req.params.id);
  const bundle = exportProjectBundle(id);
  if (!bundle) return res.status(404).json({ error: 'پروژه یافت نشد.' });
  res.setHeader('Content-Disposition', `attachment; filename="sanatnegar_project_${id}.json"`);
  res.json(bundle);
};

exports.askAssistant = async (req, res) => {
  const id = Number(req.params.id);
  const question = cleanString(req.body?.question || '', 500);
  if (!question) return res.status(400).json({ error: 'متن پرسش را وارد کنید.' });

  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return res.status(404).json({ error: 'پروژه یافت نشد.' });
  const product = db.prepare('SELECT * FROM products WHERE project_id = ? ORDER BY id ASC LIMIT 1').get(id) || { name: project.name };

  const approvedFacts = db.prepare(`
    SELECT f.*, d.original_filename AS document_filename, fe.page_number, fe.source_location, fe.evidence_text
    FROM extracted_facts f
    LEFT JOIN documents d ON d.id = f.document_id
    LEFT JOIN fact_evidence fe ON fe.fact_id = f.id
    WHERE f.project_id = ? AND f.status = 'approved'
    ORDER BY f.id ASC
  `).all(id);

  const result = await answerProductQuestion({
    project,
    product,
    approvedFacts,
    question,
    userId: req.user.id,
    useAi: req.body?.use_ai !== false,
    consentConfirmed: Boolean(req.body?.consent_confirmed)
  });

  res.json(result);
};

exports.compareProducts = (req, res) => {
  const rawIds = String(req.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 5);
  const db = getDb();
  const projects = rawIds.length
    ? db.prepare(`SELECT p.*, pr.product_code, pr.manufacturer FROM projects p LEFT JOIN products pr ON pr.project_id = p.id WHERE p.id IN (${rawIds.map(() => '?').join(',')})`).all(...rawIds)
    : db.prepare('SELECT p.*, pr.product_code, pr.manufacturer FROM projects p LEFT JOIN products pr ON pr.project_id = p.id ORDER BY p.id DESC LIMIT 4').all();

  if (!projects.length) return res.json({ products: [], matrix: [] });

  const pids = projects.map(p => p.id);
  const approvedFacts = db.prepare(`
    SELECT f.*, fe.page_number, d.original_filename
    FROM extracted_facts f
    LEFT JOIN fact_evidence fe ON fe.fact_id = f.id
    LEFT JOIN documents d ON d.id = f.document_id
    WHERE f.project_id IN (${pids.map(() => '?').join(',')}) AND f.status = 'approved'
  `).all(...pids);

  const attrMap = new Map();
  for (const f of approvedFacts) {
    const canon = canonicalAttribute(f.attribute_name);
    if (!attrMap.has(canon.key)) attrMap.set(canon.key, { key: canon.key, label: canon.label, values: {} });
    attrMap.get(canon.key).values[f.project_id] = `${f.raw_value}${f.raw_unit ? ' ' + f.raw_unit : ''} [F${f.id}]`;
  }

  res.json({ products: projects, matrix: [...attrMap.values()] });
};
