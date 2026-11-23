'use strict';

window.SN = window.SN || {};

const ROUTE_TITLES = {
  dashboard: ['داشبورد تحلیلی صنعت‌نگار', 'داشبورد'],
  products: ['مدیریت محصولات صنعتی', 'محصولات'],
  'new-project': ['ایجاد پرونده محصول صنعتی', 'ایجاد محصول'],
  workspace: ['شناسنامه دیجیتال محصول', 'فضای کار'],
  documents: ['کتابخانه اسناد و نسخه‌ها', 'اسناد'],
  verification: ['اعتبارسنجی مشخصات فنی', 'اعتبارسنجی'],
  conflicts: ['کنترل تعارض مشخصات', 'تعارض‌ها'],
  studio: ['استودیو تولید محتوای مستند', 'تولید محتوا'],
  catalogs: ['کاتالوگ‌های PDF محصول', 'کاتالوگ‌ها'],
  templates: ['قالب‌های تخصصی محتوا', 'قالب‌ها'],
  reports: ['گزارش‌ها و تحلیل‌های عملکرد', 'گزارش‌ها'],
  'ai-settings': ['مدیریت امن هوش مصنوعی', 'مدیریت AI'],
  activity: ['تنظیمات و تاریخچه فعالیت', 'تاریخچه'],
  support: ['راهنما و سناریوی مسابقه', 'راهنما']
};

SN.setRoute = route => {
  if (!ROUTE_TITLES[route]) route = 'dashboard';
  SN.state.route = route;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + route));
  document.querySelectorAll('.nav button[data-route]').forEach(b => b.classList.toggle('active', b.dataset.route === route));
  SN.$('top-title').textContent = ROUTE_TITLES[route][0];
  SN.$('crumb').textContent = ROUTE_TITLES[route][1];
  SN.closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const handler = SN.views[route];
  if (handler) handler().catch(err => SN.toast(err.message, 'error'));
};

SN.closeSidebar = () => {
  SN.$('sidebar').classList.remove('open');
  SN.$('sidebar-backdrop').classList.remove('open');
};

/* ============ AUTH UI ============ */
let authRegisterMode = false;
SN.showAuthOverlay = () => {
  SN.$('auth-overlay').classList.remove('hidden');
  SN.$('auth-demo-btn').classList.toggle('hidden', !SN.state.demoMode);
  SN.$('auth-demo-note').classList.toggle('hidden', !SN.state.demoMode);
};
SN.hideAuthOverlay = () => SN.$('auth-overlay').classList.add('hidden');

async function initAuthAndApp() {
  const { $, toast } = SN;
  const sess = await SN.api.request('/auth/session');
  SN.state.demoMode = Boolean(sess.demoMode);
  if (sess.authenticated && sess.user) {
    SN.state.user = sess.user;
    $('topbar-user').textContent = sess.user.display_name || sess.user.username;
    SN.hideAuthOverlay();
    SN.setRoute('dashboard');
  } else {
    SN.showAuthOverlay();
  }

  $('auth-toggle-mode').onclick = () => {
    authRegisterMode = !authRegisterMode;
    $('auth-display-wrap').classList.toggle('hidden', !authRegisterMode);
    $('auth-submit').textContent = authRegisterMode ? 'ثبت‌نام و ورود' : 'ورود به سامانه';
    $('auth-toggle-mode').textContent = authRegisterMode ? 'قبلاً حساب دارید؟ ورود' : 'ساخت حساب کاربری جدید';
    $('auth-error').textContent = '';
  };

  $('auth-form').onsubmit = async e => {
    e.preventDefault();
    $('auth-error').textContent = '';
    try {
      const endpoint = authRegisterMode ? '/auth/register' : '/auth/login';
      const res = await SN.api.request(endpoint, {
        method: 'POST',
        body: {
          username: $('auth-username').value.trim(),
          display_name: $('auth-display').value.trim(),
          password: $('auth-password').value
        }
      });
      SN.state.user = res.user;
      $('topbar-user').textContent = res.user.display_name || res.user.username;
      SN.hideAuthOverlay();
      toast('خوش آمدید!');
      SN.setRoute('dashboard');
    } catch (err) {
      $('auth-error').textContent = err.message;
    }
  };

  $('auth-demo-btn').onclick = async () => {
    try {
      const res = await SN.api.request('/auth/demo-login', { method: 'POST' });
      SN.state.user = res.user;
      $('topbar-user').textContent = res.user.display_name || res.user.username;
      SN.hideAuthOverlay();
      toast('با حساب نمایشی وارد شدید.');
      SN.setRoute('dashboard');
    } catch (err) {
      $('auth-error').textContent = err.message;
    }
  };

  $('logout-btn').onclick = async () => {
    await SN.api.request('/auth/logout', { method: 'POST' }).catch(() => {});
    SN.state.user = null;
    SN.showAuthOverlay();
  };
}

/* ============ GLOBAL EVENTS ============ */
document.addEventListener('click', async e => {
  const routeBtn = e.target.closest('[data-route]');
  if (routeBtn) { e.preventDefault(); SN.setRoute(routeBtn.dataset.route); return; }

  const openProj = e.target.closest('[data-open-project]');
  if (openProj) {
    SN.closeModal();
    SN.setCurrentProject(openProj.dataset.openProject);
    SN.setRoute('workspace');
    return;
  }

  const delProj = e.target.closest('[data-delete-project]');
  if (delProj) {
    if (!confirm('این پروژه و همه اسناد، مشخصات و فایل‌های PDF مرتبط حذف شوند؟')) return;
    await SN.api.request(`/projects/${delProj.dataset.deleteProject}`, { method: 'DELETE' });
    SN.toast('پروژه حذف شد.');
    SN.views.products();
    return;
  }

  const editProj = e.target.closest('[data-edit-project]');
  if (editProj) {
    const id = editProj.dataset.editProject;
    const d = await SN.api.request(`/projects/${id}`);
    SN.openModal('ویرایش اطلاعات محصول', `
      <form id="edit-proj-form">
        <div class="form-grid">
          <div class="field"><label>نام محصول</label><input id="ep-name" required value="${SN.esc(d.product.name || d.project.name)}"></div>
          <div class="field"><label>کد فنی</label><input id="ep-code" value="${SN.esc(d.product.product_code || '')}"></div>
          <div class="field"><label>تولیدکننده</label><input id="ep-maker" value="${SN.esc(d.product.manufacturer || '')}"></div>
          <div class="field"><label>برند</label><input id="ep-brand" value="${SN.esc(d.product.brand_name || '')}"></div>
          <div class="field full"><label>اطلاعات تماس</label><input id="ep-contact" value="${SN.esc(d.product.contact_info || '')}"></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary" type="submit">ذخیره تغییرات</button></div>
      </form>
    `);
    SN.$('edit-proj-form').onsubmit = async ev => {
      ev.preventDefault();
      await SN.api.request(`/projects/${id}`, {
        method: 'PUT',
        body: {
          name: SN.$('ep-name').value.trim(),
          product_code: SN.$('ep-code').value.trim(),
          manufacturer: SN.$('ep-maker').value.trim(),
          brand_name: SN.$('ep-brand').value.trim(),
          contact_info: SN.$('ep-contact').value.trim()
        }
      });
      SN.closeModal();
      SN.toast('اطلاعات محصول به‌روزرسانی شد.');
      SN.views.products();
    };
    return;
  }

  const viewDoc = e.target.closest('[data-view-doc]');
  if (viewDoc) {
    SN.openDocModal(viewDoc.dataset.viewDoc).catch(err => SN.toast(err.message, 'error'));
    return;
  }

  const delDoc = e.target.closest('[data-delete-doc]');
  if (delDoc) {
    if (!confirm('این سند و تمام نسخه‌ها و مشخصات مرتبط با آن حذف شوند؟')) return;
    await SN.api.request(`/documents/${delDoc.dataset.deleteDoc}`, { method: 'DELETE' });
    SN.toast('سند حذف شد.');
    if (SN.state.route === 'workspace') SN.views.workspace();
    else SN.views.documents();
    return;
  }

  const factBtn = e.target.closest('[data-fact-act]');
  if (factBtn) {
    const id = factBtn.dataset.id;
    const act = factBtn.dataset.factAct;
    if (act === 'delete') {
      if (!confirm('این مشخصه حذف شود؟')) return;
      await SN.api.request(`/facts/${id}`, { method: 'DELETE' });
      SN.toast('مشخصه حذف شد.');
      SN.views.verification();
      return;
    }
    const card = factBtn.closest('[data-fact]');
    const body = {
      attribute_name: card.querySelector('[data-fn]').value.trim(),
      raw_value: card.querySelector('[data-fv]').value.trim(),
      raw_unit: card.querySelector('[data-fu]').value.trim(),
      evidence_text: card.querySelector('[data-fe]').value.trim(),
      reason: card.querySelector('[data-fr]').value.trim()
    };
    if (act !== 'save') body.status = act;
    await SN.api.request(`/facts/${id}/review`, { method: 'PATCH', body });
    SN.toast(act === 'approved' ? 'مشخصه تأیید شد.' : act === 'rejected' ? 'مشخصه رد شد.' : 'ویرایش ثبت شد.');
    SN.views.verification();
    return;
  }

  const factHist = e.target.closest('[data-fact-history]');
  if (factHist) {
    const id = factHist.dataset.factHistory;
    const data = await SN.api.request(`/facts/${id}/history`);
    const rows = data.reviews || [];
    SN.openModal(`سابقه تغییرات [F${id}]`, rows.length ? `
      <div class="table-wrap"><table class="table"><thead><tr><th>تغییر</th><th>وضعیت</th><th>توسط</th><th>علت</th><th>تاریخ</th></tr></thead><tbody>
        ${rows.map(r => `<tr>
          <td>${SN.esc(r.previous_value)} ${SN.esc(r.previous_unit)} ← <b>${SN.esc(r.new_value)} ${SN.esc(r.new_unit)}</b></td>
          <td>${SN.esc(r.previous_status)} ← <b>${SN.esc(r.new_status)}</b></td>
          <td>${SN.esc(r.reviewer_name)}</td>
          <td>${SN.esc(r.reason || '—')}</td>
          <td>${SN.fmtDate(r.created_at)}</td>
        </tr>`).join('')}
      </tbody></table></div>
    ` : '<p class="small muted">هنوز سابقه بازبینی ثبت نشده است.</p>');
    return;
  }

  const confChoose = e.target.closest('[data-conf-choose]');
  if (confChoose) {
    const cid = confChoose.dataset.confChoose;
    const keep = Number(confChoose.dataset.keep);
    const rej = Number(confChoose.dataset.rej);
    const reason = prompt('علت انتخاب این مقدار را وارد کنید (اختیاری):') || '';
    await SN.api.request(`/conflicts/${cid}/resolve`, {
      method: 'POST',
      body: { action: 'choose_one', chosen_fact_id: keep, rejected_fact_id: rej, reason }
    });
    SN.toast(`تعارض حل شد: [F${keep}] تأیید و [F${rej}] رد شد.`);
    SN.views.conflicts();
    return;
  }

  const confRej = e.target.closest('[data-conf-reject]');
  if (confRej) {
    const cid = confRej.dataset.confReject;
    const rej = Number(confRej.dataset.rej);
    await SN.api.request(`/conflicts/${cid}/resolve`, {
      method: 'POST',
      body: { action: 'reject_one', rejected_fact_id: rej, reason: 'رد مقدار متعارض توسط کاربر' }
    });
    SN.toast(`مقدار [F${rej}] رد شد.`);
    SN.views.conflicts();
    return;
  }

  const openDraft = e.target.closest('[data-open-draft]');
  if (openDraft) {
    const pid = Number(SN.$('st-project').value);
    const data = await SN.api.request(`/content?project_id=${pid}`);
    const d = (data.drafts || []).find(x => x.id === Number(openDraft.dataset.openDraft));
    if (d) {
      SN.state.currentDraftId = d.id;
      SN.state.currentDraftProjectId = d.project_id;
      SN.$('st-title').value = d.title;
      SN.$('st-body').value = d.latest_body || '';
      SN.$('st-body').dir = d.language === 'en' ? 'ltr' : 'rtl';
      SN.renderSourceBanner(Boolean(d.is_ai_generated), d.provider, d.model);
      try { SN.renderClaimReport(JSON.parse(d.verification_report_json || '{}')); } catch {}
      SN.$('st-save').disabled = false;
      SN.$('st-verify').disabled = false;
      SN.$('st-copy').disabled = false;
      SN.$('st-make-pdf').disabled = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }

  const delDraft = e.target.closest('[data-del-draft]');
  if (delDraft) {
    if (!confirm('این پیش‌نویس حذف شود؟')) return;
    await SN.api.request(`/content/${delDraft.dataset.delDraft}`, { method: 'DELETE' });
    SN.toast('پیش‌نویس حذف شد.');
    SN.loadStudioHistory();
    return;
  }

  const delCat = e.target.closest('[data-del-catalog]');
  if (delCat) {
    if (!confirm('این کاتالوگ PDF حذف شود؟')) return;
    await SN.api.request(`/catalogs/${delCat.dataset.delCatalog}`, { method: 'DELETE' });
    SN.toast('کاتالوگ حذف شد.');
    SN.views.catalogs();
    return;
  }

  const useTpl = e.target.closest('[data-use-tpl]');
  if (useTpl) {
    const slug = useTpl.dataset.useTpl;
    await SN.setRoute('studio');
    SN.$('st-template').value = slug;
    return;
  }

  const saveAi = e.target.closest('[data-save-ai]');
  if (saveAi) {
    const task = saveAi.dataset.saveAi;
    const row = saveAi.closest('[data-ai-task]');
    await SN.api.request(`/ai/settings/${task}`, {
      method: 'PUT',
      body: {
        provider: row.querySelector('[data-ai-prov]').value,
        model: row.querySelector('[data-ai-model]').value.trim(),
        is_enabled: row.querySelector('[data-ai-en]').checked,
        allow_external_send: row.querySelector('[data-ai-ext]').checked
      }
    });
    SN.toast('تنظیمات AI ذخیره شد.');
    return;
  }

  const testProv = e.target.closest('[data-test-provider]');
  if (testProv) {
    const prov = testProv.dataset.testProvider;
    testProv.disabled = true;
    try {
      const r = await SN.api.request('/ai/test', { method: 'POST', body: { provider: prov } });
      SN.toast(`اتصال موفق (${r.provider} · ${r.model}): ${r.reply}`);
    } catch (err) {
      SN.toast(err.message, 'error');
    } finally {
      testProv.disabled = false;
    }
  }
});

/* ============ STATIC WIDGET BINDINGS ============ */
(function bindStaticControls() {
  const { $, toast } = SN;
  $('hamburger').onclick = () => { $('sidebar').classList.add('open'); $('sidebar-backdrop').classList.add('open'); };
  $('sidebar-close').onclick = SN.closeSidebar;
  $('sidebar-backdrop').onclick = SN.closeSidebar;
  $('modal-close').onclick = SN.closeModal;
  $('modal-backdrop').onclick = e => { if (e.target === $('modal-backdrop')) SN.closeModal(); };

  // Demo triggers
  const loadDemoFn = async () => {
    const res = await SN.api.request('/demo/load', { method: 'POST' });
    SN.setCurrentProject(res.projectId);
    toast(res.alreadyExists ? 'پرونده نمایشی از قبل موجود بود؛ باز شد.' : 'سناریوی نمایشی دمو با موفقیت ایجاد شد.');
    SN.setRoute('workspace');
  };
  $('dash-load-demo').onclick = loadDemoFn;
  $('support-load-demo').onclick = loadDemoFn;

  // Products search & compare
  $('products-search').oninput = () => SN.views.products();
  $('btn-compare-products').onclick = async () => {
    const data = await SN.api.request('/projects/compare');
    const box = $('products-compare-box');
    box.classList.remove('hidden');
    if (!data.products?.length || !data.matrix?.length) {
      box.innerHTML = '<div class="empty"><b>برای مقایسه، حداقل دو محصول با مشخصات تأییدشده لازم است</b></div>';
      return;
    }
    box.innerHTML = `
      <div class="section-head" style="margin-top:0"><div><h2>ماتریس دانش و مقایسه محصولات</h2></div><button class="btn btn-ghost btn-sm" onclick="document.getElementById('products-compare-box').classList.add('hidden')">بستن</button></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>ویژگی</th>${data.products.map(p => `<th>${SN.esc(p.name)}</th>`).join('')}</tr></thead><tbody>
        ${data.matrix.map(m => `<tr><td><b>${SN.esc(m.label)}</b></td>${data.products.map(p => `<td>${SN.esc(m.values[p.id] || '—')}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>
    `;
  };

  // New project form & dropzone
  const npFilesInput = $('np-files');
  const addNpFiles = list => {
    for (const f of list) if (!npFiles.some(x => x.name === f.name && x.size === f.size)) npFiles.push(f);
    SN.renderNpFiles();
  };
  $('np-dropzone').onclick = () => npFilesInput.click();
  $('np-dropzone').ondragover = e => { e.preventDefault(); $('np-dropzone').classList.add('drag'); };
  $('np-dropzone').ondragleave = () => $('np-dropzone').classList.remove('drag');
  $('np-dropzone').ondrop = e => { e.preventDefault(); $('np-dropzone').classList.remove('drag'); if (e.dataTransfer.files.length) addNpFiles(e.dataTransfer.files); };
  npFilesInput.onchange = () => { if (npFilesInput.files.length) addNpFiles(npFilesInput.files); npFilesInput.value = ''; };
  document.addEventListener('click', e => {
    const rm = e.target.closest('[data-np-rm]');
    if (rm) { npFiles.splice(Number(rm.dataset.npRm), 1); SN.renderNpFiles(); }
  });
  $('np-reset').onclick = () => {
    $('new-project-form').reset();
    npFiles = [];
    SN.renderNpFiles();
    $('np-status').textContent = '';
    $('np-progress-wrap').classList.add('hidden');
  };

  $('new-project-form').onsubmit = async e => {
    e.preventDefault();
    const name = $('np-name').value.trim();
    if (!name) { toast('نام محصول الزامی است.', 'error'); $('np-name').focus(); return; }
    $('np-submit').disabled = true;
    $('np-status').innerHTML = '<span class="spinner"></span> در حال ایجاد پرونده محصول…';
    try {
      const created = await SN.api.request('/projects', {
        method: 'POST',
        body: {
          name,
          product_code: $('np-code').value.trim(),
          manufacturer: $('np-maker').value.trim(),
          sector: $('np-sector').value,
          brand_name: $('np-brand').value.trim(),
          contact_info: $('np-contact').value.trim(),
          description: $('np-desc').value.trim()
        }
      });
      const pid = created.project.id;

      if (npFiles.length) {
        const fd = new FormData();
        fd.append('project_id', String(pid));
        fd.append('use_ai', String($('np-use-ai').checked));
        fd.append('consent_confirmed', String($('np-use-ai').checked));
        npFiles.forEach(f => fd.append('files', f));
        $('np-progress-wrap').classList.remove('hidden');
        $('np-status').innerHTML = '<span class="spinner"></span> در حال پردازش اسناد و استخراج مشخصات…';
        const up = await SN.api.uploadFiles('/documents/upload', fd, pct => {
          $('np-progress-bar').style.width = `${pct}%`;
        });
        const okC = (up.results || []).filter(r => r.ok).length;
        const failC = (up.results || []).filter(r => !r.ok).length;
        toast(`پرونده ساخته شد (${okC} سند موفق، ${failC} سند ناموفق).`, failC && !okC ? 'warn' : 'success');
      } else {
        toast('پرونده محصول ایجاد شد.');
      }

      npFiles = [];
      $('new-project-form').reset();
      SN.renderNpFiles();
      SN.setCurrentProject(pid);
      SN.setRoute('workspace');
    } catch (err) {
      $('np-status').textContent = 'خطا: ' + err.message;
      toast(err.message, 'error');
    } finally {
      $('np-submit').disabled = false;
    }
  };

  // Documents filters
  $('docs-project-filter').onchange = () => SN.views.documents();
  $('docs-status-filter').onchange = () => SN.views.documents();
  $('docs-search').oninput = () => SN.views.documents();

  // Verification filters & custom attribute modal
  $('verif-project-filter').onchange = () => SN.views.verification();
  $('verif-status-filter').onchange = () => SN.views.verification();
  $('verif-search').oninput = () => SN.views.verification();
  $('verif-refresh').onclick = () => SN.views.verification();
  $('btn-manage-attrs').onclick = async () => {
    const data = await SN.api.request('/attributes');
    SN.openModal('تعریف ویژگی‌های صنعتی قابل استخراج', `
      <form id="custom-attr-form" style="margin-bottom:14px">
        <div class="form-grid">
          <div class="field"><label>نام ویژگی جدید *</label><input id="ca-label" required placeholder="مثلاً گشتاور راه‌اندازی"></div>
          <div class="field"><label>واحد پیشنهادی</label><input id="ca-unit" placeholder="Nm"></div>
        </div>
        <div class="form-actions"><button class="btn btn-primary btn-sm" type="submit">افزودن ویژگی</button></div>
      </form>
      <div class="table-wrap"><table class="table"><thead><tr><th>ویژگی</th><th>واحد</th><th>دسته</th></tr></thead><tbody>
        ${(data.attributes || []).map(a => `<tr><td><b>${SN.esc(a.attribute_label)}</b></td><td>${SN.esc(a.unit_hint || '—')}</td><td>${SN.esc(a.category)}</td></tr>`).join('')}
      </tbody></table></div>
    `);
    $('custom-attr-form').onsubmit = async ev => {
      ev.preventDefault();
      await SN.api.request('/attributes', {
        method: 'POST',
        body: { attribute_label: $('ca-label').value.trim(), unit_hint: $('ca-unit').value.trim() }
      });
      toast('ویژگی جدید ثبت شد.');
      SN.closeModal();
    };
  };

  // Conflicts
  $('conf-project-filter').onchange = () => SN.views.conflicts();
  $('conf-refresh').onclick = () => SN.views.conflicts();

  // Studio
  $('st-project').onchange = () => { SN.setCurrentProject($('st-project').value); SN.loadStudioHistory(); };
  $('st-language').onchange = () => { $('st-body').dir = $('st-language').value === 'en' ? 'ltr' : 'rtl'; };
  $('st-reload-history').onclick = () => SN.loadStudioHistory();

  $('st-generate').onclick = async () => {
    const pid = Number($('st-project').value);
    if (!pid) { toast('پرونده محصول را انتخاب کنید.', 'error'); return; }
    $('st-generate').disabled = true;
    $('st-status').innerHTML = '<span class="spinner"></span> در حال تولید محتوای مستند…';
    try {
      const useAi = $('st-use-ai').checked;
      const res = await SN.api.request('/content/generate', {
        method: 'POST',
        body: {
          project_id: pid,
          template_slug: $('st-template').value,
          language: $('st-language').value,
          audience: $('st-audience').value.trim(),
          target_market: $('st-market').value.trim(),
          tone: $('st-tone').value,
          length_pref: $('st-length').value,
          use_ai: useAi,
          consent_confirmed: useAi
        }
      });
      SN.state.currentDraftId = res.draft_id;
      SN.state.currentDraftProjectId = pid;
      $('st-title').value = res.title;
      $('st-body').value = res.body;
      $('st-body').dir = res.language === 'en' ? 'ltr' : 'rtl';
      SN.renderSourceBanner(res.is_ai_generated, res.provider, res.model, res.fallback_reason);
      SN.renderClaimReport(res.verification_report);
      $('st-save').disabled = false;
      $('st-verify').disabled = false;
      $('st-copy').disabled = false;
      $('st-make-pdf').disabled = false;
      $('st-status').textContent = res.is_ai_generated ? 'پیش‌نویس AI آماده شد.' : 'پیش‌نویس با قالب پایه (غیر AI) تولید شد.';
      SN.loadStudioHistory();
    } catch (err) {
      $('st-status').textContent = 'خطا: ' + err.message;
      toast(err.message, 'error');
    } finally {
      $('st-generate').disabled = false;
    }
  };

  $('st-verify').onclick = async () => {
    const pid = SN.state.currentDraftProjectId || Number($('st-project').value);
    if (!pid) return;
    const res = await SN.api.request('/content/verify', { method: 'POST', body: { project_id: pid, body: $('st-body').value } });
    SN.renderClaimReport(res.verification_report);
    toast('اعتبار ادعاهای عددی بررسی شد.');
  };

  $('st-save').onclick = async () => {
    if (!SN.state.currentDraftId) return;
    const res = await SN.api.request(`/content/${SN.state.currentDraftId}`, {
      method: 'PUT',
      body: { title: $('st-title').value.trim(), body: $('st-body').value }
    });
    SN.renderClaimReport(res.verification_report);
    toast(`نسخه v${res.version_number} ذخیره شد.`);
    SN.loadStudioHistory();
  };

  $('st-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('st-title').value + '\n\n' + $('st-body').value);
      toast('کپی شد.');
    } catch { toast('کپی ممکن نشد.', 'error'); }
  };

  $('st-make-pdf').onclick = async () => {
    const pid = SN.state.currentDraftProjectId || Number($('st-project').value);
    if (!pid) return;
    SN.setCurrentProject(pid);
    await SN.setRoute('catalogs');
    $('cat-project').value = String(pid);
    await SN.loadCatalogDrafts();
    if (SN.state.currentDraftId) $('cat-draft').value = String(SN.state.currentDraftId);
  };

  // Catalogs
  $('cat-project').onchange = () => SN.loadCatalogDrafts();
  $('cat-filter-project').onchange = () => SN.views.catalogs();
  $('cat-refresh').onclick = () => SN.views.catalogs();
  $('cat-generate').onclick = async () => {
    const pid = Number($('cat-project').value);
    if (!pid) { toast('پروژه را انتخاب کنید.', 'error'); return; }
    $('cat-generate').disabled = true;
    $('cat-status').innerHTML = '<span class="spinner"></span> در حال تولید فایل PDF در سرور…';
    try {
      const res = await SN.api.request('/catalogs/generate', {
        method: 'POST',
        body: {
          project_id: pid,
          content_draft_id: Number($('cat-draft').value) || null,
          visual_theme: $('cat-theme').value,
          language: $('cat-lang').value
        }
      });
      $('cat-status').textContent = `کاتالوگ PDF آماده دانلود است (${res.engine}).`;
      toast('فایل کاتالوگ PDF تولید شد.');
      SN.views.catalogs();
    } catch (err) {
      $('cat-status').textContent = 'خطا: ' + err.message;
      toast(err.message, 'error');
    } finally {
      $('cat-generate').disabled = false;
    }
  };

  // Reports, Activity, Backup, Global search
  $('rep-refresh').onclick = () => SN.views.reports();
  $('act-refresh').onclick = () => SN.views.activity();
  $('act-search').oninput = () => SN.views.activity();
  $('btn-backup-db').onclick = () => window.open('/api/backup', '_blank');

  $('global-search').onkeydown = async e => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim();
    if (!q) return;
    const res = await SN.api.request(`/search?q=${encodeURIComponent(q)}`);
    SN.openModal(`نتایج جست‌وجو: ${q}`, `
      <h4 style="margin:0 0 8px;font-size:13px">محصولات (${res.projects.length})</h4>
      ${res.projects.map(p => `<div class="check-row"><div><b>${SN.esc(p.name)}</b><div class="tiny muted">${SN.esc(p.sector)}</div></div><button class="btn btn-soft btn-sm" data-open-project="${p.id}">باز کردن</button></div>`).join('') || '<p class="tiny muted">—</p>'}
      <h4 style="margin:12px 0 8px;font-size:13px">اسناد (${res.documents.length})</h4>
      ${res.documents.map(d => `<div class="check-row"><div><b>${SN.esc(d.original_filename)}</b><div class="tiny muted">${SN.esc(d.project_name)}</div></div><button class="btn btn-soft btn-sm" data-view-doc="${d.id}">متن</button></div>`).join('') || '<p class="tiny muted">—</p>'}
      <h4 style="margin:12px 0 8px;font-size:13px">مشخصات (${res.facts.length})</h4>
      ${res.facts.map(f => `<div class="check-row"><div><span class="fact-id">[F${f.id}]</span><b>${SN.esc(f.attribute_name)}: ${SN.esc(f.raw_value)} ${SN.esc(f.raw_unit)}</b><div class="tiny muted">${SN.esc(f.project_name)}</div></div>${SN.statusBadge(f.status)}</div>`).join('') || '<p class="tiny muted">—</p>'}
    `);
  };
})();

initAuthAndApp().catch(err => console.error(err));
