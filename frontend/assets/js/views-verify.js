'use strict';

window.SN = window.SN || {};
SN.views = SN.views || {};

SN.views.verification = async () => {
  const { $, esc, statusBadge } = SN;
  const projData = await SN.api.request('/projects');
  const pSel = $('verif-project-filter');
  const curP = pSel.value || (SN.state.projectId ? String(SN.state.projectId) : '');
  pSel.innerHTML = '<option value="">همه پروژه‌ها</option>' + (projData.projects || []).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if (curP && (projData.projects || []).some(p => String(p.id) === curP)) pSel.value = curP;

  const params = new URLSearchParams();
  if (pSel.value) params.set('project_id', pSel.value);
  params.set('status', $('verif-status-filter').value || 'pending_review');
  if ($('verif-search').value.trim()) params.set('q', $('verif-search').value.trim());

  const data = await SN.api.request('/facts?' + params.toString());
  const facts = data.facts || [];
  $('verif-pending-badge').textContent = `${data.pendingCount} در انتظار`;

  if (!facts.length) {
    $('verif-list').innerHTML = `<div class="empty"><b>موردی در این فیلتر وجود ندارد</b><p>فیلتر پروژه یا وضعیت را تغییر دهید.</p></div>`;
    return;
  }

  $('verif-list').innerHTML = facts.map(f => `
    <article class="fact-card" data-fact="${f.id}">
      <div class="fact-head">
        <div>
          <span class="fact-id">[F${f.id}]</span>
          <b>${esc(f.attribute_name)}: ${esc(f.raw_value)} ${esc(f.raw_unit)}</b>
          <div class="tiny muted" style="margin-top:3px">
            پروژه: ${esc(f.project_name)} · سند: <b>${esc(f.document_filename || '—')}</b> (v${f.document_version_number || 1}) · محل: <span class="tag">${esc(f.source_location || `صفحه ${f.page_number}`)}</span> · روش: <span class="tag">${esc(f.extraction_method)}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${f.document_id ? `<button class="btn btn-ghost btn-sm" data-view-doc="${f.document_id}">مشاهده سند</button>` : ''}
          <button class="btn btn-ghost btn-sm" data-fact-history="${f.id}">سابقه</button>
          ${statusBadge(f.status)}
        </div>
      </div>
      <div class="fact-fields">
        <div class="field"><label>نام ویژگی</label><input data-fn value="${esc(f.attribute_name)}"></div>
        <div class="field"><label>مقدار</label><input data-fv value="${esc(f.raw_value)}"></div>
        <div class="field"><label>واحد</label><input data-fu value="${esc(f.raw_unit)}"></div>
      </div>
      <div class="field"><label>شاهد دقیق از سند</label><textarea data-fe rows="2">${esc(f.evidence_text || '')}</textarea></div>
      <div class="field" style="margin-top:6px"><label>علت اصلاح / رد (اختیاری)</label><input data-fr placeholder="در صورت تغییر مقدار یا رد، علت را ثبت کنید…"></div>
      <div class="actions">
        <button class="btn btn-primary btn-sm" data-fact-act="approved" data-id="${f.id}">✓ تأیید</button>
        <button class="btn btn-warning btn-sm" data-fact-act="rejected" data-id="${f.id}">× رد</button>
        <button class="btn btn-ghost btn-sm" data-fact-act="save" data-id="${f.id}">ذخیره ویرایش</button>
        <button class="btn btn-danger btn-sm" data-fact-act="delete" data-id="${f.id}">حذف</button>
      </div>
    </article>
  `).join('');
};

SN.views.conflicts = async () => {
  const { $, esc, statusBadge } = SN;
  const projData = await SN.api.request('/projects');
  const sel = $('conf-project-filter');
  const cur = sel.value || (SN.state.projectId ? String(SN.state.projectId) : '');
  sel.innerHTML = '<option value="">انتخاب پرونده…</option>' + (projData.projects || []).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  if (cur && (projData.projects || []).some(p => String(p.id) === cur)) sel.value = cur;

  if (!sel.value) {
    $('conf-summary').textContent = 'انتخاب پرونده';
    $('conf-list').innerHTML = `<div class="empty"><b>پرونده‌ای انتخاب نشده است</b></div>`;
    return;
  }

  const data = await SN.api.request(`/conflicts?project_id=${sel.value}`);
  const conflicts = data.conflicts || [];
  $('conf-summary').textContent = `${conflicts.length} تعارض باز · ${data.equivalentSkipped || 0} هم‌ارزی فیزیکی بدون تعارض`;

  $('conf-list').innerHTML = conflicts.length ? conflicts.map(c => `
    <article class="fact-card">
      <div class="fact-head">
        <div><b>ویژگی: ${esc(c.attribute_label)}</b><div class="tiny" style="color:var(--warning)">${esc(c.reason)}</div></div>
        <span class="status pending">تصمیم انسانی الزامی</span>
      </div>
      <div class="grid two" style="margin-top:10px">
        <div class="conflict-side left">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div><span class="fact-id">[F${c.left.id}]</span><b>${esc(c.left.attribute_name)}: ${esc(c.left.raw_value)} ${esc(c.left.raw_unit)}</b></div>
              ${statusBadge(c.left.status)}
            </div>
            <div class="tiny muted" style="margin-top:4px">سند: <b>${esc(c.left.document_filename || '—')}</b> (v${c.left.document_version_number || 1}) · ${esc(c.left.source_location || `صفحه ${c.left.page_number}`)}</div>
            <div class="evidence">${esc(c.left.evidence_text || '')}</div>
          </div>
          <div class="actions">
            <button class="btn btn-primary btn-sm" data-conf-choose="${c.id}" data-keep="${c.left.id}" data-rej="${c.right.id}">✓ انتخاب این مقدار (رد مقابل)</button>
            <button class="btn btn-warning btn-sm" data-conf-reject="${c.id}" data-rej="${c.left.id}">× رد این مورد</button>
          </div>
        </div>
        <div class="conflict-side right">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div><span class="fact-id">[F${c.right.id}]</span><b>${esc(c.right.attribute_name)}: ${esc(c.right.raw_value)} ${esc(c.right.raw_unit)}</b></div>
              ${statusBadge(c.right.status)}
            </div>
            <div class="tiny muted" style="margin-top:4px">سند: <b>${esc(c.right.document_filename || '—')}</b> (v${c.right.document_version_number || 1}) · ${esc(c.right.source_location || `صفحه ${c.right.page_number}`)}</div>
            <div class="evidence">${esc(c.right.evidence_text || '')}</div>
          </div>
          <div class="actions">
            <button class="btn btn-primary btn-sm" data-conf-choose="${c.id}" data-keep="${c.right.id}" data-rej="${c.left.id}">✓ انتخاب این مقدار (رد مقابل)</button>
            <button class="btn btn-warning btn-sm" data-conf-reject="${c.id}" data-rej="${c.right.id}">× رد این مورد</button>
          </div>
        </div>
      </div>
    </article>
  `).join('') : `<div class="empty"><b>تعارض بازی وجود ندارد</b><p>${data.equivalentSkipped ? `${data.equivalentSkipped} جفت مقدار هم‌ارز (با تبدیل واحدهای هم‌جنس) بدون تعارض تشخیص داده شد.` : 'همه مشخصات سازگار هستند.'}</p></div>`;
};
