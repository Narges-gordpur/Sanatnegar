'use strict';

window.SN = window.SN || {};

SN.views = SN.views || {};

/* ============ DASHBOARD ============ */
SN.views.dashboard = async () => {
  const { $, esc, fmtDate, renderBars } = SN;
  $('dash-kpis').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';

  const [analytics, projRes, actRes] = await Promise.all([
    SN.api.request('/analytics'),
    SN.api.request('/projects'),
    SN.api.request('/activity')
  ]);

  const c = analytics.counts;
  const bPend = $('nav-pending-badge');
  bPend.textContent = c.facts_pending;
  bPend.classList.toggle('hidden', c.facts_pending === 0);
  const bConf = $('nav-conflict-badge');
  bConf.textContent = c.conflicts_open;
  bConf.classList.toggle('hidden', c.conflicts_open === 0);

  $('dash-kpis').innerHTML = `
    <div class="card kpi"><div class="kpi-label">محصولات صنعتی</div><div class="kpi-value">${c.products}</div><div class="kpi-note">${c.projects} پرونده فعال</div></div>
    <div class="card kpi"><div class="kpi-label">اسناد پردازش‌شده</div><div class="kpi-value">${c.docs_processed}</div><div class="kpi-note">${c.pages_processed} صفحه · میانگین ${c.avg_processing_ms}ms${c.docs_failed ? ` · ${c.docs_failed} خطا` : ''}</div></div>
    <div class="card kpi"><div class="kpi-label">مشخصات تأییدشده</div><div class="kpi-value">${c.facts_approved}</div><div class="kpi-note">از ${c.facts_total} استخراج‌شده · ${c.facts_pending} در انتظار</div></div>
    <div class="card kpi"><div class="kpi-label">محتوا و کاتالوگ PDF</div><div class="kpi-value">${c.contents_total + c.catalogs_total}</div><div class="kpi-note">${c.contents_total} محتوا · ${c.catalogs_total} کاتالوگ</div></div>
  `;

  const projects = projRes.projects || [];
  $('dash-projects').innerHTML = projects.length ? `
    <div class="table-wrap"><table class="table"><thead><tr><th>محصول</th><th>حوزه</th><th>اسناد</th><th>تأییدشده</th><th>تعارض</th><th></th></tr></thead><tbody>
      ${projects.slice(0, 6).map(p => `<tr>
        <td><b>${esc(p.name)}</b><div class="tiny muted">${esc(p.manufacturer || '—')} · ${esc(p.product_code || 'بدون کد')}</div></td>
        <td>${esc(p.sector)}</td>
        <td>${p.doc_count}</td>
        <td>${p.approved_facts} / ${p.total_facts}</td>
        <td>${p.open_conflicts ? `<span class="status pending">${p.open_conflicts} باز</span>` : '<span class="status ok">۰</span>'}</td>
        <td><button class="btn btn-soft btn-sm" data-open-project="${p.id}">شناسنامه</button></td>
      </tr>`).join('')}
    </tbody></table></div>
  ` : `<div class="empty"><div class="empty-icon">▤</div><b>هنوز محصولی ثبت نشده است</b><p>می‌توانید محصول جدید بسازید یا سناریوی آزمایشی دمو را بارگذاری کنید.</p><button class="btn btn-primary" data-route="new-project">＋ ایجاد محصول</button></div>`;

  const statusLabels = {
    approved: ['تأییدشده', 'var(--success)'],
    pending_review: ['در انتظار بررسی', 'var(--warning)'],
    rejected: ['ردشده', 'var(--danger)'],
    unverified: ['شاهد تأییدنشده', '#b45309']
  };
  const statusBars = (analytics.factsByStatus || []).map(x => ({
    label: (statusLabels[x.status] && statusLabels[x.status][0]) || x.status,
    value: x.count,
    color: (statusLabels[x.status] && statusLabels[x.status][1]) || 'var(--brand)'
  }));

  $('dash-charts').innerHTML = `
    <div class="small" style="font-weight:700;margin-bottom:8px">وضعیت اعتبارسنجی مشخصات</div>
    ${renderBars(statusBars, 'مشخصه‌ای هنوز استخراج نشده است')}
    <div class="small" style="font-weight:700;margin:14px 0 8px">روند پردازش نسخه‌های اسناد</div>
    ${renderBars((analytics.docsTrend || []).map(d => ({ label: d.day, value: d.count })), 'سندی پردازش نشده است')}
  `;

  const logs = (actRes.logs || []).slice(0, 8);
  $('dash-activity').innerHTML = logs.length ? logs.map(a => `
    <div class="check-row"><div class="check-left"><div class="check">✓</div><div><b class="small">${esc(a.action)}</b><div class="tiny muted">${esc(a.actor_name)} · ${esc(a.details || '')} · ${esc(fmtDate(a.created_at))}</div></div></div></div>
  `).join('') : `<div class="empty"><b>هنوز فعالیتی ثبت نشده است</b></div>`;
};

/* ============ PRODUCTS LIST & COMPARE ============ */
SN.views.products = async () => {
  const { $, esc } = SN;
  const q = ($('products-search').value || '').trim();
  const data = await SN.api.request('/projects' + (q ? `?q=${encodeURIComponent(q)}` : ''));
  const projects = data.projects || [];
  $('products-count').textContent = `${projects.length} محصول`;

  $('products-table').innerHTML = projects.length ? `
    <div class="table-wrap"><table class="table"><thead><tr><th>نام محصول</th><th>تولیدکننده / برند</th><th>حوزه</th><th>اسناد</th><th>مشخصات</th><th>تعارض</th><th>عملیات</th></tr></thead><tbody>
      ${projects.map(p => `<tr>
        <td><b>${esc(p.name)}</b><div class="tiny muted">${esc(p.product_code || 'بدون کد')}</div></td>
        <td>${esc(p.manufacturer || '—')}</td>
        <td>${esc(p.sector)}</td>
        <td>${p.doc_count}${p.failed_doc_count ? ` <span class="tiny" style="color:var(--danger)">(${p.failed_doc_count} خطا)</span>` : ''}</td>
        <td>${p.approved_facts} / ${p.total_facts}</td>
        <td>${p.open_conflicts ? `<span class="status pending">${p.open_conflicts}</span>` : '۰'}</td>
        <td><div class="actions" style="margin:0">
          <button class="btn btn-soft btn-sm" data-open-project="${p.id}">باز کردن</button>
          <button class="btn btn-ghost btn-sm" data-edit-project="${p.id}">ویرایش</button>
          <button class="btn btn-danger btn-sm" data-delete-project="${p.id}">حذف</button>
        </div></td>
      </tr>`).join('')}
    </tbody></table></div>
  ` : `<div class="empty"><div class="empty-icon">▤</div><b>محصولی یافت نشد</b><button class="btn btn-primary" data-route="new-project">＋ ایجاد محصول</button></div>`;
};

/* ============ NEW PROJECT ============ */
let npFiles = [];
SN.views['new-project'] = () => {
  SN.renderNpFiles();
};
SN.renderNpFiles = () => {
  const { $, esc, fmtBytes, validateClientFile } = SN;
  $('np-file-list').innerHTML = npFiles.map((f, idx) => {
    const v = validateClientFile(f);
    return `<div class="file-chip ${v.ok ? '' : 'bad'}">
      <div><b>${esc(f.name)}</b> <span class="tiny muted">(${fmtBytes(f.size)})</span>${v.ok ? '' : `<div class="tiny">${esc(v.error)}</div>`}</div>
      <button type="button" class="btn btn-ghost btn-sm" data-np-rm="${idx}">✕</button>
    </div>`;
  }).join('');
};

/* ============ DIGITAL PASSPORT / WORKSPACE ============ */
SN.views.workspace = async () => {
  const { $, esc, docStatusBadge, statusBadge, openModal, toast } = SN;
  const pid = SN.state.projectId;
  if (!pid) {
    $('workspace-root').innerHTML = `<div class="empty"><div class="empty-icon">◫</div><b>محصولی انتخاب نشده است</b><p>از بخش «مدیریت محصولات» یک پرونده را باز کنید.</p><button class="btn btn-primary" data-route="products">مدیریت محصولات</button></div>`;
    return;
  }

  let data;
  try {
    data = await SN.api.request(`/projects/${pid}`);
  } catch {
    SN.setCurrentProject(null);
    $('workspace-root').innerHTML = `<div class="empty"><b>پرونده یافت نشد</b><button class="btn btn-primary" data-route="products">بازگشت</button></div>`;
    return;
  }

  const { project, product, documents, facts, readiness } = data;
  const approvedCount = facts.filter(f => f.status === 'approved').length;
  const pendingCount = facts.filter(f => f.status === 'pending_review').length;

  $('workspace-root').innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">شناسنامه دیجیتال محصول · ${esc(project.sector)}</div>
        <h1>${esc(product.name || project.name)}</h1>
        <p>${esc(product.manufacturer || 'تولیدکننده ثبت‌نشده')} · کد فنی: ${esc(product.product_code || '—')} · تماس: ${esc(product.contact_info || '—')}</p>
      </div>
      <div class="actions" style="margin:0">
        <button class="btn btn-ghost btn-sm" id="ws-export-json">⬇ خروجی JSON</button>
        <button class="btn btn-soft btn-sm" id="ws-goto-conflicts">⚖ تعارض‌ها (${readiness.open_conflicts_count})</button>
        <button class="btn btn-soft btn-sm" id="ws-goto-catalog" ${approvedCount ? '' : 'disabled'}>▣ کاتالوگ PDF</button>
        <button class="btn btn-primary btn-sm" id="ws-goto-studio">✧ تولید محتوا</button>
      </div>
    </div>

    <div class="grid four" style="margin-bottom:15px">
      <div class="card kpi"><div class="kpi-label">اسناد معتبر</div><div class="kpi-value">${documents.filter(d => d.status !== 'failed').length}</div><div class="kpi-note">${documents.filter(d => d.status === 'failed').length} ناموفق</div></div>
      <div class="card kpi"><div class="kpi-label">مشخصات تأییدشده</div><div class="kpi-value">${approvedCount}</div><div class="kpi-note">از ${facts.length} مشخصه</div></div>
      <div class="card kpi"><div class="kpi-label">در انتظار بررسی</div><div class="kpi-value">${pendingCount}</div><div class="kpi-note">نیازمند بازبینی</div></div>
      <div class="card kpi"><div class="kpi-label">آمادگی بازاریابی</div><div class="kpi-value">${readiness.score}%</div><div class="kpi-note">شاخص محتوا (نه استاندارد فنی)</div></div>
    </div>

    <div class="split">
      <div class="card card-pad">
        <div class="section-head" style="margin-top:0"><div><h2>اسناد مرجع و نسخه‌ها</h2></div></div>
        <div id="ws-docs-list">
          ${documents.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>فایل</th><th>نسخه</th><th>وضعیت</th><th>صفحه</th><th>عملیات</th></tr></thead><tbody>
            ${documents.map(d => `<tr>
              <td><b>${esc(d.original_filename)}</b>${d.ocr_used ? ' <span class="tag">OCR</span>' : ''}${d.error_message ? `<div class="tiny" style="color:var(--danger)">${esc(d.error_message)}</div>` : ''}${d.warning_message ? `<div class="tiny" style="color:var(--warning)">${esc(d.warning_message)}</div>` : ''}</td>
              <td>v${d.version_number || 1}</td>
              <td>${docStatusBadge(d.status)}</td>
              <td>${d.page_count || '—'}</td>
              <td><div class="actions" style="margin:0"><button class="btn btn-soft btn-sm" data-view-doc="${d.id}">متن و نسخه‌ها</button><button class="btn btn-danger btn-sm" data-delete-doc="${d.id}">حذف</button></div></td>
            </tr>`).join('')}
          </tbody></table></div>` : '<div class="empty" style="padding:16px"><b>سندی ثبت نشده است</b></div>'}
        </div>

        <div class="section-head"><div><h2>بارگذاری سند جدید / نسخه تازه</h2></div></div>
        <div class="dropzone" id="ws-dropzone">
          <div class="big">⇧</div>
          <b>فایل را رها کنید یا کلیک کنید</b>
          <span>PDF (همراه با OCR خودکار)، DOCX، XLSX، CSV، TXT · حداکثر ۲۰MB</span>
          <input type="file" id="ws-files" class="hidden" accept=".pdf,.docx,.xlsx,.csv,.txt" multiple>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:11px;cursor:pointer">
          <input type="checkbox" id="ws-use-ai"> استفاده از استخراج معنایی AI (با ارسال متن به سرور خارجی در صورت تنظیم کلید)
        </label>
        <div id="ws-progress-wrap" class="progress-wrap hidden"><div class="progress"><span id="ws-progress-bar" style="width:0%"></span></div></div>
        <div id="ws-upload-status" class="small muted" style="margin-top:8px"></div>
      </div>

      <div class="grid" style="gap:15px">
        <div class="card card-pad">
          <div class="section-head" style="margin-top:0"><div><h2>دستیار هوشمند مبتنی بر دانش محصول</h2><p>پاسخ‌گویی صرفاً بر پایه مشخصات تأییدشده [F#]</p></div></div>
          <div style="display:flex;gap:8px">
            <input id="ws-qa-input" placeholder="مثلاً: توان نامی یا فشار کاری این محصول چقدر است؟" style="flex:1;border:1px solid var(--line);border-radius:10px;padding:9px 11px;outline:none">
            <button class="btn btn-primary btn-sm" id="ws-qa-ask">پرسش</button>
          </div>
          <div id="ws-qa-answer" class="notice hidden" style="margin-top:10px;white-space:pre-wrap"></div>
        </div>

        <div class="card card-pad">
          <div class="section-head" style="margin-top:0"><div><h2>گزارش آمادگی بازاریابی (${readiness.score}/100)</h2></div></div>
          <div class="notice warn" style="margin-bottom:10px">${esc(readiness.disclaimer)}</div>
          ${readiness.checks.map(ch => `
            <div class="check-row">
              <div class="check-left">
                <div class="check" style="background:${ch.passed ? 'var(--success-soft)' : 'var(--warning-soft)'};color:${ch.passed ? 'var(--success)' : 'var(--warning)'}">${ch.passed ? '✓' : '!'}</div>
                <div><b class="small">${esc(ch.label)}</b>${ch.passed ? '' : `<div class="tiny muted">${esc(ch.missingHint)}</div>`}</div>
              </div>
              <span class="tiny">${ch.weight}%</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div class="section-head">
      <div><h2>آخرین مشخصات استخراج‌شده</h2></div>
      <button class="btn btn-soft btn-sm" id="ws-goto-verif">رفتن به صفحه اعتبارسنجی (${facts.length})</button>
    </div>
    <div class="card card-pad">
      ${facts.length ? facts.slice(0, 8).map(f => `
        <div class="fact-card">
          <div class="fact-head">
            <div><span class="fact-id">[F${f.id}]</span><b>${esc(f.attribute_name)}: ${esc(f.raw_value)} ${esc(f.raw_unit)}</b>
            <div class="tiny muted">${esc(f.document_filename || '—')} · ${esc(f.source_location || `صفحه ${f.page_number}`)} · ${esc((f.evidence_text || '').slice(0, 90))}</div></div>
            ${statusBadge(f.status)}
          </div>
        </div>
      `).join('') : '<div class="empty"><b>مشخصه‌ای استخراج نشده است</b></div>'}
    </div>
  `;

  $('ws-export-json').onclick = () => window.open(`/api/projects/${pid}/export`, '_blank');
  $('ws-goto-conflicts').onclick = () => SN.setRoute('conflicts');
  $('ws-goto-studio').onclick = () => SN.setRoute('studio');
  $('ws-goto-catalog').onclick = () => SN.setRoute('catalogs');
  $('ws-goto-verif').onclick = () => {
    SN.setRoute('verification');
    $('verif-project-filter').value = String(pid);
    SN.views.verification();
  };

  $('ws-qa-ask').onclick = async () => {
    const q = $('ws-qa-input').value.trim();
    if (!q) return;
    const ansBox = $('ws-qa-answer');
    ansBox.classList.remove('hidden');
    ansBox.innerHTML = '<span class="spinner"></span> در حال جست‌وجو در دانش تأییدشده محصول…';
    try {
      const r = await SN.api.request(`/projects/${pid}/assistant`, {
        method: 'POST',
        body: { question: q, use_ai: true, consent_confirmed: true }
      });
      ansBox.className = r.answered ? 'notice good' : 'notice warn';
      ansBox.textContent = r.answer + (r.isAiGenerated ? `\n\n[منبع پاسخ: AI (${r.provider})]` : '\n\n[منبع پاسخ: موتور دانش قاعده‌محور]');
    } catch (err) {
      ansBox.className = 'notice bad';
      ansBox.textContent = err.message;
    }
  };

  const wsDrop = $('ws-dropzone');
  const wsInput = $('ws-files');
  wsDrop.onclick = () => wsInput.click();
  wsDrop.ondragover = e => { e.preventDefault(); wsDrop.classList.add('drag'); };
  wsDrop.ondragleave = () => wsDrop.classList.remove('drag');
  wsDrop.ondrop = e => { e.preventDefault(); wsDrop.classList.remove('drag'); if (e.dataTransfer.files.length) uploadWorkspaceFiles(e.dataTransfer.files, pid); };
  wsInput.onchange = () => { if (wsInput.files.length) uploadWorkspaceFiles(wsInput.files, pid); wsInput.value = ''; };

  async function uploadWorkspaceFiles(fileList, projectId) {
    const fd = new FormData();
    fd.append('project_id', String(projectId));
    fd.append('use_ai', String($('ws-use-ai').checked));
    fd.append('consent_confirmed', String($('ws-use-ai').checked));
    for (const f of fileList) fd.append('files', f);

    $('ws-progress-wrap').classList.remove('hidden');
    $('ws-upload-status').innerHTML = '<span class="spinner"></span> در حال ارسال و پردازش در سرور (شامل OCR در صورت نیاز)…';
    try {
      const res = await SN.api.uploadFiles('/documents/upload', fd, pct => {
        $('ws-progress-bar').style.width = `${pct}%`;
      });
      const okCount = (res.results || []).filter(r => r.ok).length;
      const failCount = (res.results || []).filter(r => !r.ok).length;
      toast(`پردازش پایان یافت: ${okCount} موفق، ${failCount} ناموفق`, failCount && !okCount ? 'error' : 'success');
      SN.views.workspace();
    } catch (err) {
      $('ws-upload-status').textContent = 'خطا: ' + err.message;
      toast(err.message, 'error');
    }
  }
};
