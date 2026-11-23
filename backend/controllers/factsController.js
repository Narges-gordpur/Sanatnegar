'use strict';

const { getDb } = require('../database/db');
const { cleanString } = require('../security/sanitizer');
const { digitsToAscii } = require('../document-processing/normalizer');
const { canonicalAttribute, normalizeFactMeasurement } = require('../services/units');
const { syncAndListConflicts } = require('../services/conflictService');
const { logActivity } = require('../services/auditService');

const ALLOWED_STATUSES = new Set([
  'candidate', 'pending_review', 'approved', 'rejected', 'needs_correction', 'conflicted', 'unverified'
]);

exports.list = (req, res) => {
  const db = getDb();
  const projectId = Number(req.query.project_id) || null;
  const status = req.query.status || '';
  const q = cleanString(req.query.q || '', 120).toLowerCase();

  let rows = db.prepare(`
    SELECT f.*,
           p.name AS project_name,
           d.original_filename AS document_filename,
           dv.version_number AS document_version_number,
           fe.page_number, fe.source_location, fe.evidence_text, fe.exact_match
    FROM extracted_facts f
    JOIN projects p ON p.id = f.project_id
    LEFT JOIN documents d ON d.id = f.document_id
    LEFT JOIN document_versions dv ON dv.id = f.document_version_id
    LEFT JOIN fact_evidence fe ON fe.fact_id = f.id
    ORDER BY f.id DESC
  `).all();

  if (projectId) rows = rows.filter(r => r.project_id === projectId);
  const pendingCount = rows.filter(r => r.status === 'pending_review' || r.status === 'needs_correction' || r.status === 'unverified').length;

  if (status && status !== 'all') rows = rows.filter(r => r.status === status);
  if (q) {
    rows = rows.filter(r =>
      `${r.attribute_name} ${r.raw_value} ${r.raw_unit} ${r.evidence_text || ''} ${r.document_filename || ''}`.toLowerCase().includes(q)
    );
  }

  res.json({ facts: rows, pendingCount });
};

exports.review = (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const fact = db.prepare(`
    SELECT f.*, fe.evidence_text FROM extracted_facts f
    LEFT JOIN fact_evidence fe ON fe.fact_id = f.id
    WHERE f.id = ?
  `).get(id);
  if (!fact) return res.status(404).json({ error: 'مشخصه یافت نشد.' });

  const newStatus = req.body?.status && ALLOWED_STATUSES.has(req.body.status) ? req.body.status : fact.status;
  const newName = cleanString(req.body?.attribute_name ?? fact.attribute_name, 180);
  const newValue = digitsToAscii(cleanString(req.body?.raw_value ?? fact.raw_value, 180));
  const newUnit = cleanString(req.body?.raw_unit ?? fact.raw_unit, 50);
  const newEvidence = cleanString(req.body?.evidence_text ?? fact.evidence_text ?? '', 1500);
  const reason = cleanString(req.body?.reason || '', 400);

  if (!newName || !newValue) {
    return res.status(400).json({ error: 'نام ویژگی و مقدار نمی‌توانند خالی باشند.' });
  }
  if (newStatus === 'approved' && !newEvidence) {
    return res.status(400).json({ error: 'برای تأیید مشخصه، وجود متن شاهد الزامی است.' });
  }

  const canon = canonicalAttribute(newName);
  const norm = normalizeFactMeasurement(newValue, newUnit);

  db.transaction(() => {
    db.prepare(`
      UPDATE extracted_facts
      SET attribute_key = ?, attribute_name = ?, raw_value = ?, raw_unit = ?,
          normalized_value = ?, standard_unit = ?, unit_dimension = ?,
          status = ?, evidence_verified = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      canon.key, newName, newValue, newUnit,
      norm.normalizedValue, norm.standardUnit, norm.unitDimension,
      newStatus, newEvidence ? 1 : 0, id
    );

    if (newEvidence !== undefined) {
      db.prepare('UPDATE fact_evidence SET evidence_text = ? WHERE fact_id = ?').run(newEvidence, id);
    }

    db.prepare(`
      INSERT INTO fact_reviews (
        fact_id, reviewer_id, reviewer_name, previous_value, new_value,
        previous_unit, new_unit, previous_status, new_status, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.user.id, req.user.display_name, fact.raw_value, newValue,
      fact.raw_unit, newUnit, fact.status, newStatus, reason
    );
  })();

  syncAndListConflicts(fact.project_id);
  logActivity({
    user: req.user,
    projectId: fact.project_id,
    action: `بازبینی مشخصه (${newStatus})`,
    entityType: 'fact',
    entityId: id,
    details: `[F${id}] ${newName}: ${newValue} ${newUnit}${reason ? ' | علت: ' + reason : ''}`,
    ip: req.ip
  });

  res.json({ ok: true });
};

exports.history = (req, res) => {
  const id = Number(req.params.id);
  const reviews = getDb().prepare('SELECT * FROM fact_reviews WHERE fact_id = ? ORDER BY id DESC').all(id);
  res.json({ reviews });
};

exports.remove = (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const fact = db.prepare('SELECT * FROM extracted_facts WHERE id = ?').get(id);
  if (!fact) return res.status(404).json({ error: 'مشخصه یافت نشد.' });

  db.prepare('DELETE FROM extracted_facts WHERE id = ?').run(id);
  syncAndListConflicts(fact.project_id);
  logActivity({ user: req.user, projectId: fact.project_id, action: 'حذف مشخصه', entityType: 'fact', entityId: id, details: fact.attribute_name, ip: req.ip });
  res.json({ ok: true });
};

exports.listCustomAttributes = (req, res) => {
  const rows = getDb().prepare('SELECT * FROM custom_attributes ORDER BY id ASC').all();
  res.json({ attributes: rows });
};

exports.addCustomAttribute = (req, res) => {
  const label = cleanString(req.body?.attribute_label, 120);
  const unitHint = cleanString(req.body?.unit_hint || '', 60);
  const category = cleanString(req.body?.category || 'سفارشی', 60);
  if (!label) return res.status(400).json({ error: 'عنوان ویژگی سفارشی الزامی است.' });

  const key = 'custom:' + label.toLowerCase().replace(/\s+/g, '_');
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO custom_attributes (attribute_key, attribute_label, unit_hint, category, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(key, label, unitHint, category, req.user.id);

  res.status(201).json({ ok: true, attribute_key: key, attribute_label: label });
};
