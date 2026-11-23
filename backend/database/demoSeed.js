'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('../config/env');
const { getDb } = require('./db');
const { runMigrations } = require('./migrate');
const { processDocumentBuffer } = require('../document-processing');
const { extractFactsHybrid } = require('../ai/extractor');
const { syncAndListConflicts } = require('../services/conflictService');

async function seedDemoProject(userId = 1) {
  runMigrations();
  const db = getDb();

  // Avoid duplicating demo if already loaded
  const existing = db.prepare("SELECT id FROM projects WHERE is_demo = 1 ORDER BY id DESC LIMIT 1").get();
  if (existing) {
    return { alreadyExists: true, projectId: existing.id };
  }

  const demoDoc1Text = [
    'فایل آزمایشی شماره ۱ - دیتاشیت مهندسی پمپ سانتریفیوژ SP-250 [DEMO]',
    'نام محصول: پمپ سانتریفیوژ صنعتی SP-250',
    'مدل محصول: SP-250-A',
    'توان نامی موتور: ۱۵ کیلووات',
    'ولتاژ کاری: ۳۸۰ V',
    'فرکانس: ۵۰ Hz',
    'ظرفیت آبدهی: ۱۰۰ لیتر در دقیقه',
    'حداکثر فشار کاری: ۱۰ bar',
    'دمای کاری مجاز: -۱۰ تا ۱۲۰ °C',
    'وزن خالص: ۸۵ کیلوگرم',
    'جنس بدنه: چدن داکتیل GG40',
    'درجه حفاظت: IP55',
    'استاندارد: ISO 5199',
    'ویژگی ایمنی: مجهز به سوپاپ اطمینان فشار اضافی و سنسور دمای سیم‌پیچ'
  ].join('\n');

  const demoDoc2Csv = [
    'ویژگی,مقدار,واحد,یادداشت',
    'توان موتور,18.5,kW,بررسی نسخه پیش‌نویس کاتالوگ',
    'دبی نامی,6,m3/h,معادل 100 لیتر بر دقیقه',
    'فشار کاری,1,MPa,معادل 10 بار',
    'سرعت چرخش,2900,rpm,دور نامی موتور',
    'بازده هیدرولیکی,78,%,در نقطه بهینه'
  ].join('\n');

  const pRes = db.prepare(`
    INSERT INTO projects (user_id, name, description, sector, is_demo)
    VALUES (?, ?, ?, ?, 1)
  `).run(
    userId,
    'پروژه نمایشی: پمپ سانتریفیوژ صنعتی SP-250 [DEMO]',
    'پرونده آزمایشی جهت نمایش استخراج مشخصات، معادل‌یابی واحدها (۱۰۰ لیتر/دقیقه = ۶ مترمکعب/ساعت) و کنترل تعارض توان (۱۵ در برابر ۱۸.۵ کیلووات).',
    'صنعت و تولید'
  );
  const projectId = pRes.lastInsertRowid;

  const prodRes = db.prepare(`
    INSERT INTO products (project_id, name, product_code, manufacturer, model_name, category, brand_name, contact_info, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    projectId,
    'پمپ سانتریفیوژ صنعتی SP-250 [DEMO]',
    'SP-250-A',
    'گروه مهندسی نمونه [DEMO]',
    'SP-250',
    'تجهیزات انتقال سیالات',
    'SANATNEGAR DEMO',
    'demo@sanatnegar.local (داده آزمایشی)'
  );
  const productId = prodRes.lastInsertRowid;

  async function ingestSample(filename, ext, mime, buf) {
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    const storedName = `demo_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const storagePath = path.join(env.uploadsDir, storedName);
    fs.writeFileSync(storagePath, buf);

    const parsed = await processDocumentBuffer(ext, buf);
    const docId = db.prepare(`
      INSERT INTO documents (project_id, product_id, original_filename, file_type, mime_type, status, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(projectId, productId, filename, ext, mime, parsed.status).lastInsertRowid;

    const verId = db.prepare(`
      INSERT INTO document_versions (document_id, version_number, stored_filename, storage_path, file_size, sha256_hash, page_count, extracted_text, pages_json, extraction_method, ocr_used, status, processing_ms, uploaded_by)
      VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      docId, storedName, storagePath, buf.length, sha, parsed.pagesCount,
      parsed.extractedText, JSON.stringify(parsed.pagesJson), parsed.extractionMethod,
      parsed.status, parsed.processingMs, userId
    ).lastInsertRowid;

    db.prepare('UPDATE documents SET current_version_id = ? WHERE id = ?').run(verId, docId);

    const { facts } = await extractFactsHybrid({
      segments: parsed.segments,
      pagesJson: parsed.pagesJson,
      fullText: parsed.extractedText,
      projectId,
      userId,
      useAi: false
    });

    const insFact = db.prepare(`
      INSERT INTO extracted_facts (project_id, product_id, document_id, document_version_id, attribute_key, attribute_name, raw_value, raw_unit, normalized_value, standard_unit, unit_dimension, extraction_method, confidence, status, evidence_verified, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const insEv = db.prepare(`
      INSERT INTO fact_evidence (fact_id, document_id, document_version_id, page_number, source_location, evidence_text, exact_match)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertedIds = [];
    for (const f of facts) {
      const fId = insFact.run(
        projectId, productId, docId, verId,
        f.attribute_key, f.attribute_name, f.raw_value, f.raw_unit,
        f.normalized_value, f.standard_unit, f.unit_dimension,
        f.extraction_method, f.confidence, f.status, f.evidence_verified
      ).lastInsertRowid;
      insEv.run(fId, docId, verId, f.page_number, f.source_location, f.evidence_text, f.exact_match);
      insertedIds.push({ id: fId, ...f });
    }
    return insertedIds;
  }

  const facts1 = await ingestSample('demo_datasheet_v1.txt', 'txt', 'text/plain', Buffer.from(demoDoc1Text, 'utf8'));
  const facts2 = await ingestSample('demo_catalog_specs_v2.csv', 'csv', 'text/csv', Buffer.from(demoDoc2Csv, 'utf8'));

  // Approve a few baseline facts (e.g. voltage, flow_rate, operating_pressure, weight, material) while leaving power conflict & speed pending for demo judging!
  const approveKeys = new Set(['voltage', 'frequency', 'flow_rate', 'operating_pressure', 'weight', 'material', 'standards']);
  const reviewStmt = db.prepare(`
    INSERT INTO fact_reviews (fact_id, reviewer_id, reviewer_name, previous_value, new_value, previous_unit, new_unit, previous_status, new_status, reason)
    VALUES (?, ?, 'مدیر دمو', ?, ?, ?, ?, 'pending_review', 'approved', 'تأیید اولیه سناریوی آزمایشی')
  `);
  for (const f of [...facts1, ...facts2]) {
    if (approveKeys.has(f.attribute_key)) {
      db.prepare("UPDATE extracted_facts SET status = 'approved' WHERE id = ?").run(f.id);
      reviewStmt.run(f.id, userId, f.raw_value, f.raw_value, f.raw_unit, f.raw_unit);
    }
  }

  syncAndListConflicts(projectId);

  db.prepare(`
    INSERT INTO activity_logs (user_id, actor_name, project_id, action, entity_type, entity_id, details)
    VALUES (?, 'سیستم', ?, 'بارگذاری سناریوی نمایشی [DEMO]', 'project', ?, 'ایجاد پرونده پمپ سانتریفیوژ SP-250 با ۲ سند آزمایشی')
  `).run(userId, projectId, projectId);

  return { alreadyExists: false, projectId, productId };
}

if (require.main === module) {
  seedDemoProject(1).then(res => {
    console.log('Demo seed result:', res);
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { seedDemoProject };
