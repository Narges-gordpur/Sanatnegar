'use strict';

window.SN = window.SN || {};
SN.views = SN.views || {};

SN.views.reports = async () => {
  const { $, esc, fmtDate, renderBars } = SN;
  const [analytics, aiData] = await Promise.all([
    SN.api.request('/analytics'),
    SN.api.request('/ai/settings')
  ]);
  const c = analytics.counts;
  const jobs = aiData.recent_jobs || [];

  $('reports-root').innerHTML = `
    <div class="grid four" style="margin-bottom:15px">
      <div class="card kpi"><div class="kpi-label">کل صفحات پردازش‌شده</div><div class="kpi-value">${c.pages_processed}</div><div class="kpi-note">میانگین زمان: ${c.avg_processing_ms} ms</div></div>
      <div class="card kpi"><div class="kpi-label">نرخ تأیید مشخصات</div><div class="kpi-value">${c.facts_total ? Math.round((c.facts_approved / c.facts_total) * 100) : 0}%</div><div class="kpi-note">${c.facts_approved} تأیید / ${c.facts_rejected} رد</div></div>
      <div class="card kpi"><div class="kpi-label">تعارض‌های باز</div><div class="kpi-value">${c.conflicts_open}</div><div class="kpi-note">نیازمند تصمیم انسانی</div></div>
      <div class="card kpi"><div class="kpi-label">فراخوانی‌های AI</div><div class="kpi-value">${jobs.length}</div><div class="kpi-note">ثبت‌شده در پایگاه داده</div></div>
    </div>

    <div class="split">
      <div class="card card-pad">
        <div class="section-head" style="margin-top:0"><div><h2>توزیع محتوای تولیدشده بر حسب قالب</h2></div></div>
        ${renderBars((analytics.contentByType || []).map(x => ({ label: x.template_slug, value: x.count })), 'محتوایی تولید نشده است')}
      </div>
      <div class="card card-pad">
        <div class="section-head" style="margin-top:0"><div><h2>گزارش فراخوانی‌ها و مصرف AI</h2></div></div>
        ${jobs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>وظیفه</th><th>مدل</th><th>وضعیت</th><th>توکن</th><th>زمان</th></tr></thead><tbody>
          ${jobs.slice(0, 10).map(j => `<tr>
            <td>${esc(j.task_type)}</td>
            <td class="tiny">${esc(j.provider)} / ${esc(j.model)}</td>
            <td><span class="status ${j.status === 'success' ? 'ok' : 'bad'}">${esc(j.status)}</span></td>
            <td>${j.total_tokens || '—'}</td>
            <td>${j.latency_ms}ms · ${fmtDate(j.created_at)}</td>
          </tr>`).join('')}
        </tbody></table></div>` : '<div class="empty"><b>فراخوانی AI ثبت نشده است</b></div>'}
      </div>
    </div>
  `;
};

SN.views['ai-settings'] = async () => {
  const { $, esc } = SN;
  const data = await SN.api.request('/ai/settings');
  const keys = data.server_keys_configured || {};
  const tasks = data.tasks || [];

  const taskLabels = {
    ocr: 'پردازش اسناد و OCR',
    extraction: 'استخراج معنایی مشخصات',
    conflict_analysis: 'تحلیل تعارض',
    content_generation: 'تولید محتوای فارسی',
    quality_check: 'دستیار پرسش و پاسخ / کنترل کیفیت',
    translation: 'تولید محتوای انگلیسی و عربی'
  };

  $('ai-settings-root').innerHTML = `
    <div class="notice good" style="margin-bottom:14px">
      <b>✓ معماری امن کلیدهای API:</b> کلیدهای OpenAI، DeepSeek و Google Gemini فقط در فایل <code>.env</code> سرور نگهداری می‌شوند و هرگز به مرورگر ارسال یا در <code>localStorage</code> ذخیره نمی‌شوند.
    </div>
    <div class="grid three" style="margin-bottom:15px">
      <div class="card card-pad"><b>DeepSeek (ENV)</b><div style="margin-top:6px">${keys.deepseek ? '<span class="status ok">✓ کلید در سرور تنظیم شده</span>' : '<span class="status pending">کلید تنظیم نشده (حالت پایه فعال)</span>'}</div><button class="btn btn-ghost btn-sm" style="margin-top:10px" data-test-provider="deepseek">تست اتصال</button></div>
      <div class="card card-pad"><b>OpenAI (ENV)</b><div style="margin-top:6px">${keys.openai ? '<span class="status ok">✓ کلید در سرور تنظیم شده</span>' : '<span class="status pending">کلید تنظیم نشده</span>'}</div><button class="btn btn-ghost btn-sm" style="margin-top:10px" data-test-provider="openai">تست اتصال</button></div>
      <div class="card card-pad"><b>Google Gemini (ENV)</b><div style="margin-top:6px">${keys.gemini ? '<span class="status ok">✓ کلید در سرور تنظیم شده</span>' : '<span class="status pending">کلید تنظیم نشده</span>'}</div><button class="btn btn-ghost btn-sm" style="margin-top:10px" data-test-provider="gemini">تست اتصال</button></div>
    </div>

    <div class="card card-pad">
      <div class="section-head" style="margin-top:0"><div><h2>تنظیم مدل و سیاست ارسال داده برای هر وظیفه</h2><p>توصیه: برای وظایف ساده از مدل‌های سبک‌تر استفاده کنید.</p></div></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>وظیفه</th><th>ارائه‌دهنده</th><th>شناسه مدل</th><th>فعال</th><th>اجازه ارسال متن به خارج</th><th>ذخیره</th></tr></thead><tbody>
        ${tasks.map(t => `<tr data-ai-task="${esc(t.task_type)}">
          <td><b>${esc(taskLabels[t.task_type] || t.task_type)}</b></td>
          <td><select data-ai-prov>
            <option value="deepseek" ${t.provider === 'deepseek' ? 'selected' : ''}>DeepSeek</option>
            <option value="openai" ${t.provider === 'openai' ? 'selected' : ''}>OpenAI</option>
            <option value="gemini" ${t.provider === 'gemini' ? 'selected' : ''}>Gemini</option>
          </select></td>
          <td><input data-ai-model value="${esc(t.model)}" style="width:170px"></td>
          <td><input type="checkbox" data-ai-en ${t.is_enabled ? 'checked' : ''}></td>
          <td><input type="checkbox" data-ai-ext ${t.allow_external_send ? 'checked' : ''}></td>
          <td><button class="btn btn-primary btn-sm" data-save-ai="${esc(t.task_type)}">ذخیره</button></td>
        </tr>`).join('')}
      </tbody></table></div>
    </div>
  `;
};

SN.views.activity = async () => {
  const { $, esc, fmtDate } = SN;
  const q = ($('act-search').value || '').trim();
  const data = await SN.api.request('/activity' + (q ? `?q=${encodeURIComponent(q)}` : ''));
  const logs = data.logs || [];
  $('act-list').innerHTML = logs.length ? logs.map(a => `
    <div class="check-row">
      <div class="check-left">
        <div class="check" style="background:${a.security_event ? 'var(--warning-soft)' : 'var(--success-soft)'};color:${a.security_event ? 'var(--warning)' : 'var(--success)'}">${a.security_event ? '🛡' : '◷'}</div>
        <div><b class="small">${esc(a.action)}</b> <span class="tiny muted">(${esc(a.actor_name)})</span><div class="tiny muted">${esc(a.details || '')} · ${esc(fmtDate(a.created_at))}</div></div>
      </div>
    </div>
  `).join('') : '<div class="empty"><b>رویدادی ثبت نشده است</b></div>';
};
