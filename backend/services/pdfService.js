'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const PDFDocument = require('pdfkit');
const env = require('../config/env');
const { escapeHtml } = require('../security/sanitizer');

const THEMES = {
  turquoise: { primary: '#0b8b83', dark: '#0b1324', soft: '#e3f5f2', border: '#cce5e2' },
  navy: { primary: '#1e4273', dark: '#091529', soft: '#edf3fb', border: '#d2dfee' },
  minimal: { primary: '#334155', dark: '#0f172a', soft: '#f1f5f9', border: '#cbd5e1' }
};

function buildCatalogHtml({ project, product, facts, contentDraft, visualTheme = 'turquoise', language = 'fa', versionNumber = 1 }) {
  const theme = THEMES[visualTheme] || THEMES.turquoise;
  const isLtr = language === 'en';
  const dir = isLtr ? 'ltr' : 'rtl';
  const fontRegularPath = path.join(env.frontendDir, 'assets/fonts/Vazirmatn-Regular.ttf');
  const fontBoldPath = path.join(env.frontendDir, 'assets/fonts/Vazirmatn-Bold.ttf');

  const labels = isLtr ? {
    coverTag: `VERIFIED INDUSTRIAL CATALOG · v${versionNumber}`,
    manufacturer: 'Manufacturer / Brand',
    code: 'Model / Technical Code',
    sector: 'Industrial Sector',
    date: 'Issue Date',
    verifiedCount: 'Verified Specs Count',
    introTitle: 'Product Overview',
    specsTitle: `Verified Technical Specifications (${facts.length})`,
    colId: 'Ref ID',
    colAttr: 'Specification',
    colVal: 'Value',
    colUnit: 'Unit',
    colSrc: 'Source & Page',
    evidenceTitle: 'Traceability & Source Evidence Appendix',
    chartTitle: 'Specifications Breakdown by Verification Source',
    contactTitle: 'Contact Information',
    footerText: `SANATNEGAR · ${product.name} · v${versionNumber}`,
    pageCounter: 'Page " counter(page) " of " counter(pages) "'
  } : language === 'ar' ? {
    coverTag: `كتالوج فني موثق · الإصدار ${versionNumber}`,
    manufacturer: 'المصنّع / العلامة التجارية',
    code: 'الرمز الفني / الموديل',
    sector: 'القطاع الصناعي',
    date: 'تاريخ الإصدار',
    verifiedCount: 'عدد المواصفات المعتمدة',
    introTitle: 'مقدمة المنتج',
    specsTitle: `جدول المواصفات الفنية المعتمدة (${facts.length})`,
    colId: 'المرجع',
    colAttr: 'الخاصية',
    colVal: 'القيمة',
    colUnit: 'الوحدة',
    colSrc: 'المصدر والصفحة',
    evidenceTitle: 'ملحق الشواهد والمصادر المرجعية',
    chartTitle: 'توزيع المواصفات حسب الوثيقة المرجعية',
    contactTitle: 'معلومات التواصل',
    footerText: `صنعت‌نگار · ${product.name} · v${versionNumber}`,
    pageCounter: 'صفحة " counter(page) " من " counter(pages) "'
  } : {
    coverTag: `کاتالوگ فنی مستند · نسخه ${versionNumber}`,
    manufacturer: 'تولیدکننده / برند',
    code: 'کد فنی / مدل',
    sector: 'حوزه صنعتی',
    date: 'تاریخ صدور',
    verifiedCount: 'تعداد مشخصات تأییدشده',
    introTitle: 'معرفی محصول',
    specsTitle: `جدول مشخصات فنی تأییدشده (${facts.length} مورد)`,
    colId: 'شناسه',
    colAttr: 'ویژگی فنی',
    colVal: 'مقدار',
    colUnit: 'واحد',
    colSrc: 'سند مرجع و صفحه',
    evidenceTitle: 'پیوست شواهد و ردیابی منابع',
    chartTitle: 'توزیع مشخصات تأییدشده بر اساس سند منبع',
    contactTitle: 'اطلاعات تماس',
    footerText: `صنعت‌نگار · ${product.name} · نسخه ${versionNumber}`,
    pageCounter: 'صفحه " counter(page) " از " counter(pages) "'
  };

  // Build simple authentic SVG bar chart from real document distribution
  const docCounts = new Map();
  facts.forEach(f => {
    const key = f.document_filename || 'سند';
    docCounts.set(key, (docCounts.get(key) || 0) + 1);
  });
  const chartEntries = [...docCounts.entries()].slice(0, 6);
  const maxC = Math.max(1, ...chartEntries.map(e => e[1]));
  const chartSvg = chartEntries.length ? `
    <h2>${escapeHtml(labels.chartTitle)}</h2>
    <div style="border:1px solid ${theme.border};border-radius:8px;padding:12px;background:#fafcfd;margin-bottom:14px">
      ${chartEntries.map(([name, cnt]) => {
        const w = Math.round((cnt / maxC) * 100);
        return `<div style="margin-bottom:7px;font-size:10px">
          <div style="display:flex;justify-content:space-between;margin-bottom:2px"><span>${escapeHtml(name)}</span><b>${cnt}</b></div>
          <div style="background:#e9eef4;height:8px;border-radius:6px;overflow:hidden"><div style="width:${w}%;height:100%;background:${theme.primary}"></div></div>
        </div>`;
      }).join('')}
    </div>
  ` : '';

  const issueDate = new Date().toLocaleDateString(isLtr ? 'en-US' : 'fa-IR');
  const brand = product.brand_name || product.manufacturer || '—';

  return `<!doctype html>
<html lang="${escapeHtml(language)}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(product.name)}</title>
<style>
  @font-face {
    font-family: 'VazirmatnLocal';
    src: url('file://${fontRegularPath.replace(/\\/g, '/')}');
    font-weight: 400;
  }
  @font-face {
    font-family: 'VazirmatnLocal';
    src: url('file://${fontBoldPath.replace(/\\/g, '/')}');
    font-weight: 700;
  }
  @page {
    size: A4;
    margin: 20mm 14mm 20mm 14mm;
    @top-left {
      content: "${escapeHtml(labels.footerText)}";
      font-family: 'VazirmatnLocal', 'DejaVu Sans', sans-serif;
      font-size: 8.5pt;
      color: #6b7a90;
    }
    @bottom-center {
      content: "${labels.pageCounter}";
      font-family: 'VazirmatnLocal', 'DejaVu Sans', sans-serif;
      font-size: 8.5pt;
      color: #6b7a90;
    }
  }
  @page :first {
    @top-left { content: none; }
    @bottom-center { content: none; }
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'VazirmatnLocal', 'DejaVu Sans', sans-serif;
    color: #142238;
    font-size: 10.5pt;
    line-height: 1.8;
    margin: 0;
  }
  .cover {
    height: 252mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 18mm 14mm;
    border: 2px solid ${theme.border};
    border-radius: 6mm;
    background: linear-gradient(160deg, #ffffff 0%, ${theme.soft} 100%);
    page-break-after: always;
  }
  .cover-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid ${theme.primary};
    padding-bottom: 5mm;
  }
  .brand { font-size: 14pt; font-weight: 700; color: ${theme.primary}; }
  .tag { background: ${theme.soft}; color: ${theme.primary}; border: 1px solid ${theme.border}; padding: 2mm 4mm; border-radius: 12mm; font-size: 9pt; font-weight: 700; }
  .cover-title { text-align: center; margin: 20mm 0; }
  .cover-title h1 { font-size: 26pt; color: ${theme.dark}; margin: 0 0 4mm; line-height: 1.35; }
  .cover-title p { color: #52637a; font-size: 12pt; margin: 0; }
  .meta-grid {
    display: table;
    width: 100%;
    border-collapse: separate;
    border-spacing: 3mm;
    background: #ffffff;
    border: 1px solid ${theme.border};
    border-radius: 4mm;
    padding: 3mm;
  }
  .meta-row { display: table-row; }
  .meta-cell { display: table-cell; width: 50%; padding: 2.5mm 3mm; background: #f9fbfc; border-radius: 2mm; font-size: 9.5pt; }
  .meta-cell b { display: block; color: ${theme.primary}; font-size: 8.5pt; }
  .cover-foot { text-align: center; font-size: 8.5pt; color: #6b7a90; border-top: 1px solid ${theme.border}; padding-top: 4mm; }
  h2 {
    color: ${theme.primary};
    font-size: 13.5pt;
    border-bottom: 2px solid ${theme.primary};
    padding-bottom: 2mm;
    margin: 7mm 0 4mm;
    page-break-after: avoid;
  }
  table.specs { width: 100%; border-collapse: collapse; margin: 3mm 0 6mm; }
  table.specs th, table.specs td { border: 1px solid #d7e0ea; padding: 2.3mm 3mm; font-size: 9.5pt; vertical-align: top; text-align: ${isLtr ? 'left' : 'right'}; }
  table.specs th { background: ${theme.soft}; color: ${theme.dark}; font-weight: 700; }
  table.specs tr:nth-child(even) td { background: #fbfdfe; }
  .fid { font-weight: 700; color: ${theme.primary}; direction: ltr; display: inline-block; }
  .content-box { white-space: pre-wrap; line-height: 1.9; background: #fafcfd; border: 1px solid #e1e8ef; border-radius: 3mm; padding: 4.5mm; font-size: 10pt; margin-bottom: 6mm; }
  .evidence { background: #f7f9fc; border-${isLtr ? 'left' : 'right'}: 3px solid ${theme.primary}; padding: 2.5mm 3.5mm; font-size: 9pt; color: #435368; margin: 2.2mm 0; border-radius: 2mm; page-break-inside: avoid; }
</style>
</head>
<body>
  <div class="cover">
    <div class="cover-head">
      <div class="brand">SANATNEGAR · صنعت‌نگار</div>
      <div class="tag">${escapeHtml(labels.coverTag)}</div>
    </div>
    <div class="cover-title">
      <h1>${escapeHtml(product.name)}</h1>
      <p>${escapeHtml(project.sector)}</p>
    </div>
    <div>
      <div class="meta-grid">
        <div class="meta-row">
          <div class="meta-cell"><b>${escapeHtml(labels.manufacturer)}</b>${escapeHtml(brand)}</div>
          <div class="meta-cell"><b>${escapeHtml(labels.code)}</b>${escapeHtml(product.product_code || '—')}</div>
        </div>
        <div class="meta-row">
          <div class="meta-cell"><b>${escapeHtml(labels.sector)}</b>${escapeHtml(project.sector)}</div>
          <div class="meta-cell"><b>${escapeHtml(labels.date)}</b>${escapeHtml(issueDate)}</div>
        </div>
        <div class="meta-row">
          <div class="meta-cell"><b>${escapeHtml(labels.verifiedCount)}</b>${facts.length}</div>
          <div class="meta-cell"><b>${escapeHtml(labels.contactTitle)}</b>${escapeHtml(product.contact_info || '—')}</div>
        </div>
      </div>
      <div class="cover-foot">${escapeHtml(labels.footerText)}</div>
    </div>
  </div>

  ${contentDraft ? `<h2>${escapeHtml(labels.introTitle)}</h2><div class="content-box">${escapeHtml(contentDraft.body)}</div>` : ''}

  <h2>${escapeHtml(labels.specsTitle)}</h2>
  <table class="specs">
    <thead>
      <tr>
        <th>${escapeHtml(labels.colId)}</th>
        <th>${escapeHtml(labels.colAttr)}</th>
        <th>${escapeHtml(labels.colVal)}</th>
        <th>${escapeHtml(labels.colUnit)}</th>
        <th>${escapeHtml(labels.colSrc)}</th>
      </tr>
    </thead>
    <tbody>
      ${facts.map(f => `<tr>
        <td><span class="fid">[F${f.id}]</span></td>
        <td><b>${escapeHtml(f.attribute_name)}</b></td>
        <td>${escapeHtml(f.raw_value)}</td>
        <td>${escapeHtml(f.raw_unit || '—')}</td>
        <td>${escapeHtml(f.document_filename || '—')} (${escapeHtml(f.source_location || `p.${f.page_number}`)})</td>
      </tr>`).join('')}
    </tbody>
  </table>

  ${chartSvg}

  <h2>${escapeHtml(labels.evidenceTitle)}</h2>
  ${facts.map(f => `<div class="evidence"><span class="fid">[F${f.id}]</span> <b>${escapeHtml(f.attribute_name)}</b> — ${escapeHtml(f.document_filename || '—')} (${escapeHtml(f.source_location || `p.${f.page_number}`)}):<br>${escapeHtml(f.evidence_text)}</div>`).join('')}
</body>
</html>`;
}

function renderWithWeasyPrint(html, pdfPath) {
  const pyCode = `
import sys, weasyprint
html_str = sys.stdin.read()
weasyprint.HTML(string=html_str).write_pdf(sys.argv[1])
`;
  const proc = spawnSync('python3', ['-c', pyCode, pdfPath], {
    input: html,
    encoding: 'utf8',
    timeout: 30000
  });
  return proc.status === 0 && fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0;
}

function renderWithPdfKit({ project, product, facts, contentDraft, pdfPath }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const fontPath = path.join(env.frontendDir, 'assets/fonts/Vazirmatn-Regular.ttf');
    if (fs.existsSync(fontPath)) {
      doc.font(fontPath);
    }

    doc.fontSize(20).text(`SANATNEGAR Catalog: ${product.name}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Sector: ${project.sector} | Manufacturer: ${product.manufacturer || '-'} | Code: ${product.product_code || '-'}`, { align: 'center' });
    doc.moveDown(1.5);

    if (contentDraft) {
      doc.fontSize(14).text('Product Overview');
      doc.moveDown(0.4);
      doc.fontSize(10).text(contentDraft.body);
      doc.moveDown(1);
    }

    doc.fontSize(14).text(`Verified Technical Specifications (${facts.length})`);
    doc.moveDown(0.4);
    facts.forEach(f => {
      doc.fontSize(10).text(`[F${f.id}] ${f.attribute_name}: ${f.raw_value} ${f.raw_unit || ''} (${f.document_filename || '-'} · ${f.source_location || ''})`);
    });

    doc.end();
    stream.on('finish', () => resolve(true));
    stream.on('error', reject);
  });
}

async function generateCatalogPdf({ project, product, facts, contentDraft = null, visualTheme = 'turquoise', language = 'fa', versionNumber = 1 }) {
  if (!fs.existsSync(env.catalogsDir)) fs.mkdirSync(env.catalogsDir, { recursive: true });
  const safeBase = `${project.id}_${Date.now()}_v${versionNumber}.pdf`;
  const pdfPath = path.join(env.catalogsDir, safeBase);

  const html = buildCatalogHtml({ project, product, facts, contentDraft, visualTheme, language, versionNumber });
  let engine = 'weasyprint';

  const wpOk = renderWithWeasyPrint(html, pdfPath);
  if (!wpOk) {
    engine = 'pdfkit-fallback';
    await renderWithPdfKit({ project, product, facts, contentDraft, pdfPath });
  }

  const buf = fs.readFileSync(pdfPath);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

  return {
    filename: `${(product.name || project.name).replace(/[^\w\u0600-\u06FF-]+/g, '_')}_v${versionNumber}.pdf`,
    storedFilename: safeBase,
    storagePath: pdfPath,
    fileSize: buf.length,
    sha256,
    engine
  };
}

module.exports = { generateCatalogPdf, buildCatalogHtml };
