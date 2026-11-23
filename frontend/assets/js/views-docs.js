'use strict';

window.SN = window.SN || {};
SN.views = SN.views || {};

SN.views.documents = async () => {
  const { $, esc, fmtBytes, fmtDate, docStatusBadge } = SN;
  const projData = await SN.api.request('/projects');
  const pSel = $('docs-project-filter');
  const curP = pSel.value;
  pSel.innerHTML = '<option value="">همه پروژه‌ها</option>' + (projData.projects || []).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if (curP) pSel.value = curP;

  const params = new URLSearchParams();
  if (pSel.value) params.set('project_id', pSel.value);
  if ($('docs-status-filter').value) params.set('status', $('docs-status-filter').value);
  if ($('docs-search').value.trim()) params.set('q', $('docs-search').value.trim());

  const data = await SN.api.request('/documents?' + params.toString());
  const docs = data.documents || [];
  $('docs-count').textContent = `${docs.length} سند`;

  $('docs-table').innerHTML = docs.length ? `
    <div class="table-wrap"><table class="table"><thead><tr><th>نام فایل</th><th>پروژه</th><th>نسخه</th><th>وضعیت</th><th>صفحه</th><th>عملیات</th></tr></thead><tbody>
      ${docs.map(d => `<tr>
        <td><b>${esc(d.original_filename)}</b>${d.ocr_used ? ' <span class="tag">OCR</span>' : ''}<div class="tiny muted">${esc((d.file_type || '').toUpperCase())} · ${fmtBytes(d.file_size)} · ${fmtDate(d.created_at)}</div>${d.error_message ? `<div class="tiny" style="color:var(--danger)">${esc(d.error_message)}</div>` : ''}</td>
        <td>${esc(d.project_name)}</td>
        <td>v${d.version_number || 1}</td>
        <td>${docStatusBadge(d.status)}</td>
        <td>${d.page_count || '—'}</td>
        <td><div class="actions" style="margin:0"><button class="btn btn-soft btn-sm" data-view-doc="${d.id}">متن و نسخه‌ها</button><button class="btn btn-danger btn-sm" data-delete-doc="${d.id}">حذف</button></div></td>
      </tr>`).join('')}
    </tbody></table></div>
  ` : `<div class="empty"><b>سندی یافت نشد</b><p>فایل‌های بارگذاری‌شده در پرونده محصولات اینجا نمایش داده می‌شوند.</p></div>`;
};

SN.openDocModal = async docId => {
  const { esc, fmtBytes, fmtDate, docStatusBadge, openModal } = SN;
  const data = await SN.api.request(`/documents/${docId}`);
  const { document: doc, versions } = data;
  const latest = versions[0] || {};
  let pages = [];
  try { pages = JSON.parse(latest.pages_json || '[]'); } catch { pages = []; }

  openModal(`سند: ${doc.original_filename}`, `
    <div class="notice" style="margin-bottom:12px">
      تعداد نسخه‌ها: <b>${versions.length}</b> · روش استخراج: <b>${esc(latest.extraction_method || '—')}</b>
      ${latest.ocr_used ? ' · <span class="tag">OCR اجرا شده</span>' : ''}
    </div>
    <h4 style="margin:0 0 8px;font-size:13px">تاریخچه نسخه‌های سند</h4>
    <div class="table-wrap" style="margin-bottom:14px"><table class="table"><thead><tr><th>نسخه</th><th>حجم</th><th>وضعیت</th><th>صفحات</th><th>هش SHA-256</th><th>زمان</th></tr></thead><tbody>
      ${versions.map(v => `<tr>
        <td>v${v.version_number}</td><td>${fmtBytes(v.file_size)}</td><td>${docStatusBadge(v.status)}</td>
        <td>${v.page_count}</td><td class="tiny ltr">${esc((v.sha256_hash || '').slice(0, 14))}…</td><td>${fmtDate(v.created_at)}</td>
      </tr>`).join('')}
    </tbody></table></div>
    <h4 style="margin:0 0 8px;font-size:13px">متن استخراج‌شده آخرین نسخه (صفحه‌به‌صفحه)</h4>
    ${pages.length ? pages.map(p => `
      <div style="margin-bottom:10px">
        <div class="tiny" style="font-weight:700;color:var(--brand)">صفحه / بخش ${p.page} (${esc(p.method || '')})</div>
        <div class="source-text" style="max-height:220px">${esc(p.text || '—')}</div>
      </div>
    `).join('') : `<div class="source-text">${esc(latest.extracted_text || latest.error_message || 'متنی موجود نیست.')}</div>`}
  `);
};
