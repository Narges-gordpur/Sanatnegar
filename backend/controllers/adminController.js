'use strict';

const fs = require('fs');
const env = require('../config/env');
const { getDb } = require('../database/db');
const { getProviderKeyStatus, callSingleProvider } = require('../ai/adapter');
const { cleanString } = require('../security/sanitizer');
const { logActivity } = require('../services/auditService');
const { createSqliteBackup } = require('../services/backupService');
const { seedDemoProject } = require('../database/demoSeed');

exports.analytics = (req, res) => {
  const db = getDb();
  const counts = {
    products: db.prepare('SELECT COUNT(*) AS c FROM products').get().c,
    projects: db.prepare('SELECT COUNT(*) AS c FROM projects').get().c,
    docs_processed: db.prepare("SELECT COUNT(*) AS c FROM documents WHERE status IN ('processed','warning_scanned')").get().c,
    docs_failed: db.prepare("SELECT COUNT(*) AS c FROM documents WHERE status = 'failed'").get().c,
    pages_processed: db.prepare("SELECT COALESCE(SUM(page_count),0) AS s FROM document_versions WHERE status IN ('processed','warning_scanned')").get().s,
    avg_processing_ms: Math.round(db.prepare("SELECT COALESCE(AVG(processing_ms),0) AS a FROM document_versions WHERE status IN ('processed','warning_scanned')").get().a),
    facts_total: db.prepare('SELECT COUNT(*) AS c FROM extracted_facts').get().c,
    facts_approved: db.prepare("SELECT COUNT(*) AS c FROM extracted_facts WHERE status = 'approved'").get().c,
    facts_rejected: db.prepare("SELECT COUNT(*) AS c FROM extracted_facts WHERE status = 'rejected'").get().c,
    facts_pending: db.prepare("SELECT COUNT(*) AS c FROM extracted_facts WHERE status IN ('pending_review','needs_correction','unverified')").get().c,
    conflicts_open: db.prepare("SELECT COUNT(*) AS c FROM conflicts WHERE status = 'open'").get().c,
    contents_total: db.prepare('SELECT COUNT(*) AS c FROM content_drafts').get().c,
    catalogs_total: db.prepare('SELECT COUNT(*) AS c FROM catalogs').get().c
  };

  const factsByStatus = db.prepare('SELECT status, COUNT(*) AS count FROM extracted_facts GROUP BY status').all();
  const contentByType = db.prepare('SELECT template_slug, COUNT(*) AS count FROM content_drafts GROUP BY template_slug').all();
  const docsTrend = db.prepare(`
    SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
    FROM document_versions
    GROUP BY substr(created_at, 1, 10)
    ORDER BY day DESC LIMIT 10
  `).all().reverse();

  res.json({ counts, factsByStatus, contentByType, docsTrend });
};

exports.activity = (req, res) => {
  const q = cleanString(req.query.q || '', 120).toLowerCase();
  let rows = getDb().prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 150').all();
  if (q) rows = rows.filter(r => `${r.action} ${r.details} ${r.actor_name}`.toLowerCase().includes(q));
  res.json({ logs: rows });
};

exports.globalSearch = (req, res) => {
  const q = cleanString(req.query.q || '', 120).toLowerCase();
  if (!q) return res.json({ projects: [], documents: [], facts: [] });
  const db = getDb();
  const like = `%${q}%`;
  const projects = db.prepare(`
    SELECT p.*, pr.product_code, pr.manufacturer FROM projects p
    LEFT JOIN products pr ON pr.project_id = p.id
    WHERE LOWER(p.name || ' ' || COALESCE(pr.manufacturer,'') || ' ' || COALESCE(pr.product_code,'') || ' ' || p.sector) LIKE ?
    LIMIT 20
  `).all(like);
  const documents = db.prepare(`
    SELECT d.*, p.name AS project_name FROM documents d
    JOIN projects p ON p.id = d.project_id
    WHERE LOWER(d.original_filename || ' ' || p.name) LIKE ?
    LIMIT 20
  `).all(like);
  const facts = db.prepare(`
    SELECT f.*, fe.evidence_text, p.name AS project_name FROM extracted_facts f
    JOIN projects p ON p.id = f.project_id
    LEFT JOIN fact_evidence fe ON fe.fact_id = f.id
    WHERE LOWER(f.attribute_name || ' ' || f.raw_value || ' ' || COALESCE(fe.evidence_text,'')) LIKE ?
    LIMIT 25
  `).all(like);

  res.json({ projects, documents, facts });
};

exports.getAiSettings = (req, res) => {
  const db = getDb();
  const tasks = db.prepare('SELECT * FROM ai_provider_settings ORDER BY id ASC').all();
  const jobs = db.prepare('SELECT * FROM ai_jobs ORDER BY id DESC LIMIT 50').all();
  res.json({
    server_keys_configured: getProviderKeyStatus(),
    default_models: env.aiDefaultModels,
    tasks,
    recent_jobs: jobs,
    system_limits: { max_file_size_mb: env.maxFileSizeMb, ocr_enabled: env.ocrEnabled }
  });
};

exports.updateAiSetting = (req, res) => {
  const taskType = cleanString(req.params.taskType, 40);
  const provider = cleanString(req.body?.provider || 'deepseek', 30);
  const model = cleanString(req.body?.model || '', 80);
  const isEnabled = req.body?.is_enabled ? 1 : 0;
  const allowExternalSend = req.body?.allow_external_send ? 1 : 0;
  const timeoutMs = Math.max(3000, Math.min(120000, Number(req.body?.timeout_ms) || 25000));
  const maxRetries = Math.max(0, Math.min(3, Number(req.body?.max_retries) ?? 2));

  if (!['openai', 'deepseek', 'gemini'].includes(provider)) {
    return res.status(400).json({ error: 'ارائه‌دهنده نامعتبر است.' });
  }

  getDb().prepare(`
    UPDATE ai_provider_settings
    SET provider = ?, model = ?, is_enabled = ?, allow_external_send = ?, timeout_ms = ?, max_retries = ?, updated_by = ?, updated_at = datetime('now')
    WHERE task_type = ?
  `).run(provider, model || env.aiDefaultModels[provider], isEnabled, allowExternalSend, timeoutMs, maxRetries, req.user.id, taskType);

  logActivity({ user: req.user, action: 'به‌روزرسانی تنظیمات AI', details: `${taskType}: ${provider} / ${model}`, securityEvent: true, ip: req.ip });
  res.json({ ok: true });
};

exports.testAiProvider = async (req, res) => {
  const provider = cleanString(req.body?.provider || 'deepseek', 30);
  const model = cleanString(req.body?.model || '', 80);
  const result = await callSingleProvider({
    provider,
    model,
    system: 'You are a connectivity test.',
    user: 'Reply briefly with OK.',
    timeoutMs: 15000
  });
  res.json({ ok: true, provider: result.provider, model: result.model, reply: result.text.slice(0, 80), latency_ms: result.latencyMs });
};

exports.backupDb = async (req, res) => {
  const b = await createSqliteBackup();
  logActivity({ user: req.user, action: 'ایجاد نسخه پشتیبان پایگاه داده', details: b.filename, securityEvent: true, ip: req.ip });
  res.setHeader('Content-Disposition', `attachment; filename="${b.filename}"`);
  fs.createReadStream(b.path).pipe(res);
};

exports.loadDemo = async (req, res) => {
  const result = await seedDemoProject(req.user.id);
  res.json(result);
};
