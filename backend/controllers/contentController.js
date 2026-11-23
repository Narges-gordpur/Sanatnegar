'use strict';

const { getDb } = require('../database/db');
const { cleanString } = require('../security/sanitizer');
const { generateProductContent } = require('../ai/contentGenerator');
const { verifyGeneratedClaims } = require('../ai/claimVerifier');
const { logActivity } = require('../services/auditService');

exports.listTemplates = (req, res) => {
  const rows = getDb().prepare('SELECT * FROM templates ORDER BY id ASC').all();
  res.json({ templates: rows });
};

exports.listDrafts = (req, res) => {
  const projectId = Number(req.query.project_id);
  if (!projectId) return res.json({ drafts: [] });
  const rows = getDb().prepare(`
    SELECT cd.*,
           (SELECT body FROM content_versions cv WHERE cv.draft_id = cd.id ORDER BY cv.version_number DESC LIMIT 1) AS latest_body,
           (SELECT version_number FROM content_versions cv WHERE cv.draft_id = cd.id ORDER BY cv.version_number DESC LIMIT 1) AS latest_version
    FROM content_drafts cd
    WHERE cd.project_id = ?
    ORDER BY cd.id DESC
  `).all(projectId);
  res.json({ drafts: rows });
};

exports.generate = async (req, res) => {
  const projectId = Number(req.body?.project_id);
  const templateSlug = cleanString(req.body?.template_slug || 'technical', 60);
  const language = cleanString(req.body?.language || 'fa', 10);
  const useAi = req.body?.use_ai !== false;
  const consentConfirmed = Boolean(req.body?.consent_confirmed);

  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'پروژه یافت نشد.' });

  const product = db.prepare('SELECT * FROM products WHERE project_id = ? ORDER BY id ASC LIMIT 1').get(projectId) || { name: project.name };
  const template = db.prepare('SELECT * FROM templates WHERE slug = ?').get(templateSlug);
  if (!template) return res.status(400).json({ error: 'قالب انتخاب‌شده یافت نشد.' });

  // STRICT GROUNDING: ONLY approved facts may enter generated content
  const approvedFacts = db.prepare(`
    SELECT f.*, d.original_filename AS document_filename, fe.page_number, fe.source_location, fe.evidence_text
    FROM extracted_facts f
    LEFT JOIN documents d ON d.id = f.document_id
    LEFT JOIN fact_evidence fe ON fe.fact_id = f.id
    WHERE f.project_id = ? AND f.status = 'approved'
    ORDER BY f.id ASC
  `).all(projectId);

  if (!approvedFacts.length) {
    return res.status(400).json({ error: 'حداقل یک مشخصه تأییدشده انسانی برای تولید محتوای مستند لازم است.' });
  }

  const options = {
    audience: cleanString(req.body?.audience || '', 120),
    target_market: cleanString(req.body?.target_market || '', 120),
    tone: cleanString(req.body?.tone || '', 80),
    expertise_level: cleanString(req.body?.expertise_level || '', 80),
    length_pref: cleanString(req.body?.length_pref || '', 80),
    brand_name: cleanString(req.body?.brand_name || product.brand_name || '', 150),
    contact_info: cleanString(req.body?.contact_info || product.contact_info || '', 250)
  };

  const gen = await generateProductContent({
    project,
    product,
    approvedFacts,
    template,
    language,
    options,
    userId: req.user.id,
    useAi,
    consentConfirmed
  });

  const draftId = db.transaction(() => {
    const id = db.prepare(`
      INSERT INTO content_drafts (
        project_id, product_id, template_id, template_slug, title, language,
        audience, target_market, tone, expertise_level, length_pref, brand_name, contact_info,
        provider, model, is_ai_generated, verification_report_json, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      projectId, product.id || null, template.id, template.slug, gen.title, language,
      options.audience, options.target_market, options.tone, options.expertise_level, options.length_pref,
      options.brand_name, options.contact_info,
      gen.provider, gen.model, gen.isAiGenerated ? 1 : 0, JSON.stringify(gen.verificationReport), req.user.id
    ).lastInsertRowid;

    db.prepare(`
      INSERT INTO content_versions (draft_id, version_number, title, body, cited_fact_ids_json, verification_report_json, edited_by)
      VALUES (?, 1, ?, ?, ?, ?, ?)
    `).run(
      id, gen.title, gen.body,
      JSON.stringify(gen.verificationReport.cited_fact_ids),
      JSON.stringify(gen.verificationReport), req.user.id
    );
    return id;
  })();

  logActivity({
    user: req.user,
    projectId,
    action: gen.isAiGenerated ? 'تولید محتوا با AI' : 'تولید محتوا با قالب پایه (غیر AI)',
    entityType: 'content_draft',
    entityId: draftId,
    details: `${template.name} (${language}) · ${approvedFacts.length} مشخصه`,
    ip: req.ip
  });

  res.status(201).json({
    draft_id: draftId,
    title: gen.title,
    body: gen.body,
    language,
    provider: gen.provider,
    model: gen.model,
    is_ai_generated: gen.isAiGenerated,
    fallback_reason: gen.fallbackReason,
    verification_report: gen.verificationReport,
    approved_facts: approvedFacts
  });
};

exports.updateDraft = (req, res) => {
  const draftId = Number(req.params.id);
  const db = getDb();
  const draft = db.prepare('SELECT * FROM content_drafts WHERE id = ?').get(draftId);
  if (!draft) return res.status(404).json({ error: 'پیش‌نویس یافت نشد.' });

  const title = cleanString(req.body?.title || draft.title, 250);
  const body = String(req.body?.body || '');
  const product = db.prepare('SELECT * FROM products WHERE project_id = ? ORDER BY id ASC LIMIT 1').get(draft.project_id) || {};
  const approvedFacts = db.prepare("SELECT * FROM extracted_facts WHERE project_id = ? AND status = 'approved'").all(draft.project_id);
  const report = verifyGeneratedClaims(body, approvedFacts, product);

  const maxV = db.prepare('SELECT MAX(version_number) AS mv FROM content_versions WHERE draft_id = ?').get(draftId).mv || 0;
  const nextV = maxV + 1;

  db.transaction(() => {
    db.prepare("UPDATE content_drafts SET title = ?, verification_report_json = ?, updated_at = datetime('now') WHERE id = ?")
      .run(title, JSON.stringify(report), draftId);
    db.prepare(`
      INSERT INTO content_versions (draft_id, version_number, title, body, cited_fact_ids_json, verification_report_json, edited_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(draftId, nextV, title, body, JSON.stringify(report.cited_fact_ids), JSON.stringify(report), req.user.id);
  })();

  res.json({ ok: true, version_number: nextV, verification_report: report });
};

exports.verifyBody = (req, res) => {
  const projectId = Number(req.body?.project_id);
  const body = String(req.body?.body || '');
  const db = getDb();
  const product = db.prepare('SELECT * FROM products WHERE project_id = ? ORDER BY id ASC LIMIT 1').get(projectId) || {};
  const approvedFacts = db.prepare("SELECT * FROM extracted_facts WHERE project_id = ? AND status = 'approved'").all(projectId);
  const report = verifyGeneratedClaims(body, approvedFacts, product);
  res.json({ verification_report: report });
};

exports.removeDraft = (req, res) => {
  const draftId = Number(req.params.id);
  const db = getDb();
  const draft = db.prepare('SELECT * FROM content_drafts WHERE id = ?').get(draftId);
  if (!draft) return res.status(404).json({ error: 'پیش‌نویس یافت نشد.' });
  db.prepare('DELETE FROM content_drafts WHERE id = ?').run(draftId);
  res.json({ ok: true });
};
