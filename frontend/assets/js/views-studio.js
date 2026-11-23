'use strict';

window.SN = window.SN || {};
SN.views = SN.views || {};

SN.renderClaimReport = report => {
  const box = SN.$('st-claim-report');
  if (!report) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.className = 'claim-box ' + (report.has_warnings ? 'notice warn' : 'notice good');
  let html = `<div><b>گزارش اعتبار محتوای تولیدشده:</b> ارجاعات معتبر: ${report.cited_fact_ids?.length ? report.cited_fact_ids.map(id => `<span class="ltr">[F${id}]</span>`).join('، ') : 'ندارد'}</div>`;
  if (report.invalid_fact_ids?.length) {
    html += `<div style="margin-top:4px;color:var(--danger)">⚠ شناسه‌های نامعتبر: ${report.invalid_fact_ids.map(id => `[F${id}]`).join('، ')}</div>`;
  }
  if (report.unsupported_numbers?.length) {
    html += `<div style="margin-top:4px;color:var(--danger)">⚠ اعداد بدون پشتوانه در مشخصات تأییدشده: <b class="ltr">${SN.esc(report.unsupported_numbers.join(', '))}</b></div>`;
  }
  if (report.uncited_numeric_lines?.length) {
    html += `<div style="margin-top:4px">⚠ خطوط دارای عدد بدون شناسه ارجاع [F#]: سطرهای ${report.uncited_numeric_lines.join('، ')}</div>`;
  }
  if (!report.has_warnings) {
    html += `<div style="margin-top:4px">✓ تمامی اعداد و ارجاعات متن با مشخصات تأییدشده هم‌خوانی دارند.</div>`;
  }
  html += `<div class="tiny muted" style="margin-top:6px">${SN.esc(report.disclaimer || '')}</div>`;
  box.innerHTML = html;
};

SN.renderSourceBanner = (isAi, provider, model, fallbackReason = '') => {
  const b = SN.$('st-source-banner');
  b.classList.remove('hidden');
  if (isAi) {
    b.className = 'source-banner ai';
    b.innerHTML = `<div><b>✧ تولیدشده با هوش مصنوعی</b> (${SN.esc(provider)} · ${SN.esc(model)})</div><span class="status ok">AI Generated</span>`;
  } else {
    b.className = 'source-banner fallback';
    b.innerHTML = `<div><b>▤ خروجی پایه بدون هوش مصنوعی</b>${fallbackReason ? ` — <span class="tiny">${SN.esc(fallbackReason)}</span>` : ''}</div><span class="status pending">Non-AI Base Template</span>`;
  }
};

SN.views.studio = async () => {
  const { $, esc } = SN;
  const [projData, tplData] = await Promise.all([
    SN.api.request('/projects'),
    SN.api.request('/templates')
  ]);

  const pSel = $('st-project');
  const curP = String(SN.state.projectId || pSel.value || '');
  pSel.innerHTML = '<option value="">انتخاب پرونده…</option>' + (projData.projects || []).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if (curP && (projData.projects || []).some(p => String(p.id) === curP)) pSel.value = curP;

  const tSel = $('st-template');
  const curT = tSel.value;
  tSel.innerHTML = (tplData.templates || []).map(t => `<option value="${esc(t.slug)}">${esc(t.name)} (${esc(t.category)})</option>`).join('');
  if (curT) tSel.value = curT;

  $('st-body').dir = $('st-language').value === 'en' ? 'ltr' : 'rtl';
  await SN.loadStudioHistory();
};

SN.loadStudioHistory = async () => {
  const { $, esc, fmtDate } = SN;
  const pid = Number($('st-project').value);
  if (!pid) {
    $('st-facts-note').textContent = '';
    $('st-history').innerHTML = `<div class="empty"><b>پرونده‌ای انتخاب نشده است</b></div>`;
    return;
  }

  const [factsData, draftsData] = await Promise.all([
    SN.api.request(`/facts?project_id=${pid}&status=approved`),
    SN.api.request(`/content?project_id=${pid}`)
  ]);

  const appCount = (factsData.facts || []).length;
  $('st-facts-note').innerHTML = appCount
    ? `<span style="color:var(--success)">✓ ${appCount} مشخصه تأییدشده آماده تولید محتوا</span>`
    : `<span style="color:var(--danger)">⚠ هیچ مشخصه تأییدشده‌ای برای این محصول نیست (${factsData.pendingCount} مورد در انتظار بررسی).</span>`;

  const drafts = draftsData.drafts || [];
  $('st-history').innerHTML = drafts.length ? `
    <div class="table-wrap"><table class="table"><thead><tr><th>عنوان</th><th>قالب</th><th>زبان</th><th>روش تولید</th><th>نسخه</th><th>تاریخ</th><th></th></tr></thead><tbody>
      ${drafts.map(d => `<tr>
        <td><b>${esc(d.title)}</b></td>
        <td>${esc(d.template_slug)}</td>
        <td>${esc((d.language || 'fa').toUpperCase())}</td>
        <td>${d.is_ai_generated ? `<span class="status ok">AI · ${esc(d.provider)}</span>` : '<span class="status pending">قالب پایه بدون AI</span>'}</td>
        <td>v${d.latest_version || 1}</td>
        <td>${fmtDate(d.updated_at)}</td>
        <td><div class="actions" style="margin:0"><button class="btn btn-soft btn-sm" data-open-draft="${d.id}">باز کردن</button><button class="btn btn-danger btn-sm" data-del-draft="${d.id}">حذف</button></div></td>
      </tr>`).join('')}
    </tbody></table></div>
  ` : `<div class="empty"><b>پیش‌نویسی هنوز ذخیره نشده است</b></div>`;
};

SN.views.catalogs = async () => {
  const { $, esc, fmtBytes, fmtDate } = SN;
  const projData = await SN.api.request('/projects');
  const projects = projData.projects || [];
  const pSel = $('cat-project');
  const fSel = $('cat-filter-project');
  const curP = String(SN.state.projectId || pSel.value || '');

  pSel.innerHTML = '<option value="">انتخاب کنید…</option>' + projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  fSel.innerHTML = '<option value="">همه پروژه‌ها</option>' + projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if (curP && projects.some(p => String(p.id) === curP)) pSel.value = curP;

  await SN.loadCatalogDrafts();
  const q = fSel.value ? `?project_id=${fSel.value}` : '';
  const data = await SN.api.request('/catalogs' + q);
  const catalogs = data.catalogs || [];

  $('cat-list').innerHTML = catalogs.length ? `
    <div class="table-wrap"><table class="table"><thead><tr><th>فایل PDF</th><th>پروژه</th><th>تم</th><th>مشخصات</th><th>حجم</th><th>تاریخ</th><th>دانلود</th></tr></thead><tbody>
      ${catalogs.map(c => `<tr>
        <td><b>${esc(c.filename)}</b></td>
        <td>${esc(c.project_name)}</td>
        <td>${esc(c.visual_theme)} · ${esc(c.language.toUpperCase())}</td>
        <td>${c.fact_count}</td>
        <td>${fmtBytes(c.file_size)}</td>
        <td>${fmtDate(c.created_at)}</td>
        <td><div class="actions" style="margin:0"><a class="btn btn-primary btn-sm" href="/api/catalogs/${c.id}/download" target="_blank" style="text-decoration:none">⬇ دانلود PDF</a><button class="btn btn-danger btn-sm" data-del-catalog="${c.id}">حذف</button></div></td>
      </tr>`).join('')}
    </tbody></table></div>
  ` : `<div class="empty"><b>هنوز کاتالوگ PDF تولید نشده است</b></div>`;
};

SN.loadCatalogDrafts = async () => {
  const pid = Number(SN.$('cat-project').value);
  const dSel = SN.$('cat-draft');
  if (!pid) { dSel.innerHTML = '<option value="">فقط جدول مشخصات و شواهد</option>'; return; }
  const data = await SN.api.request(`/content?project_id=${pid}`);
  dSel.innerHTML = '<option value="">فقط جدول مشخصات و شواهد</option>' + (data.drafts || []).map(d => `<option value="${d.id}">${SN.esc(d.title)} (${d.language.toUpperCase()})</option>`).join('');
};

SN.views.templates = async () => {
  const data = await SN.api.request('/templates');
  SN.$('templates-grid').innerHTML = (data.templates || []).map(t => `
    <article class="card card-pad">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <span class="tag">${SN.esc(t.category)}</span>
      </div>
      <h3 style="font-size:14px;margin:0 0 5px">${SN.esc(t.name)}</h3>
      <p class="small muted" style="margin:0 0 12px;min-height:40px">${SN.esc(t.description)}</p>
      <button class="btn btn-soft btn-block" data-use-tpl="${SN.esc(t.slug)}">استفاده در استودیو</button>
    </article>
  `).join('');
};
