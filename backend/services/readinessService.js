'use strict';

const { getDb } = require('../database/db');
const { canonicalAttribute } = require('./units');

function analyzeMarketingReadiness(projectId) {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;

  const product = db.prepare('SELECT * FROM products WHERE project_id = ? ORDER BY id ASC LIMIT 1').get(projectId) || {};
  const docs = db.prepare(`
    SELECT d.*, dv.status AS version_status, dv.page_count
    FROM documents d
    LEFT JOIN document_versions dv ON dv.id = d.current_version_id
    WHERE d.project_id = ?
  `).all(projectId);
  const facts = db.prepare('SELECT * FROM extracted_facts WHERE project_id = ?').all(projectId);
  const openConflicts = db.prepare("SELECT COUNT(*) AS c FROM conflicts WHERE project_id = ? AND status = 'open'").get(projectId).c;
  const drafts = db.prepare('SELECT language, template_slug FROM content_drafts WHERE project_id = ?').all(projectId);
  const catalogs = db.prepare('SELECT COUNT(*) AS c FROM catalogs WHERE project_id = ?').get(projectId).c;

  const approvedFacts = facts.filter(f => f.status === 'approved');
  const pendingFacts = facts.filter(f => f.status === 'pending_review');
  const approvedKeys = new Set(approvedFacts.map(f => canonicalAttribute(f.attribute_name).key));

  const checks = [
    {
      key: 'has_docs',
      label: 'اسناد مرجع معتبر بارگذاری شده است',
      passed: docs.some(d => d.status === 'processed' || d.status === 'warning_scanned'),
      weight: 15,
      missingHint: 'حداقل یک دیتاشیت یا سند فنی معتبر (PDF/DOCX/XLSX/TXT) بارگذاری کنید.'
    },
    {
      key: 'has_approved_specs',
      label: 'حداقل ۳ مشخصه فنی توسط انسان تأیید شده است',
      passed: approvedFacts.length >= 3,
      weight: 20,
      missingHint: `در حال حاضر ${approvedFacts.length} مشخصه تأییدشده و ${pendingFacts.length} مورد در انتظار بررسی وجود دارد.`
    },
    {
      key: 'no_open_conflicts',
      label: 'تعارض باز میان اسناد وجود ندارد',
      passed: openConflicts === 0,
      weight: 15,
      missingHint: `${openConflicts} تعارض باز در بخش کنترل تعارض نیازمند تصمیم انسانی است.`
    },
    {
      key: 'has_weight_or_dims',
      label: 'مشخصات فیزیکی (وزن یا ابعاد) ثبت و تأیید شده است',
      passed: approvedKeys.has('weight') || approvedKeys.has('length') || approvedKeys.has('width') || approvedKeys.has('height') || approvedKeys.has('diameter'),
      weight: 10,
      missingHint: 'وزن یا ابعاد محصول برای حمل‌ونقل و کاتالوگ تأیید نشده است.'
    },
    {
      key: 'has_contact_brand',
      label: 'نام برند / تولیدکننده و اطلاعات تماس ثبت شده است',
      passed: Boolean((product.brand_name || product.manufacturer) && product.contact_info),
      weight: 10,
      missingHint: 'نام تولیدکننده/برند یا اطلاعات تماس در پرونده محصول تکمیل نشده است.'
    },
    {
      key: 'has_fa_content',
      label: 'محتوای تجاری فارسی تولید شده است',
      passed: drafts.some(d => d.language === 'fa'),
      weight: 10,
      missingHint: 'از استودیو تولید محتوا یک معرفی فارسی بسازید.'
    },
    {
      key: 'has_export_en',
      label: 'نسخه انگلیسی / صادراتی تکمیل شده است',
      passed: drafts.some(d => d.language === 'en'),
      weight: 10,
      missingHint: 'برای بازار صادراتی، محتوای انگلیسی تولید نشده است.'
    },
    {
      key: 'has_catalog_pdf',
      label: 'کاتالوگ PDF آماده ارائه تولید شده است',
      passed: catalogs > 0,
      weight: 10,
      missingHint: 'هنوز کاتالوگ PDF قابل دانلود تولید نشده است.'
    }
  ];

  const score = checks.reduce((acc, c) => acc + (c.passed ? c.weight : 0), 0);

  return {
    project_id: projectId,
    product_name: product.name || project.name,
    score,
    max_score: 100,
    approved_facts_count: approvedFacts.length,
    pending_facts_count: pendingFacts.length,
    open_conflicts_count: openConflicts,
    checks,
    missing_items: checks.filter(c => !c.passed).map(c => ({ key: c.key, label: c.label, hint: c.missingHint })),
    disclaimer: 'این ارزیابی صرفاً شاخص آمادگی محتوا و بازاریابی محصول در صنعت‌نگار است و به‌هیچ‌وجه جایگزین تأییدیه فنی، مهندسی یا استاندارد رسمی نیست.'
  };
}

module.exports = { analyzeMarketingReadiness };
