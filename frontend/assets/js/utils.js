'use strict';

window.SN = window.SN || {};

SN.$ = id => document.getElementById(id);

SN.state = {
  user: null,
  demoMode: true,
  route: 'dashboard',
  projectId: Number(sessionStorage.getItem('sn_project_id')) || null,
  currentDraftId: null,
  currentDraftProjectId: null
};

SN.setCurrentProject = id => {
  SN.state.projectId = id ? Number(id) : null;
  if (SN.state.projectId) sessionStorage.setItem('sn_project_id', String(SN.state.projectId));
  else sessionStorage.removeItem('sn_project_id');
};

SN.esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

SN.fmtBytes = s => {
  if (!s && s !== 0) return '—';
  return s < 1024 * 1024 ? `${Math.max(1, Math.round(s / 1024))} KB` : `${(s / (1024 * 1024)).toFixed(2)} MB`;
};

SN.fmtDate = v => {
  if (!v) return '—';
  const iso = v.includes('T') ? v : v.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return isNaN(d) ? v : new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
};

SN.toast = (msg, type = 'success') => {
  const n = document.createElement('div');
  n.className = 'toast ' + type;
  n.textContent = msg;
  SN.$('toast-host').appendChild(n);
  setTimeout(() => n.remove(), 4500);
};

SN.statusBadge = s => {
  const map = {
    approved: '<span class="status ok">✓ تأییدشده</span>',
    rejected: '<span class="status bad">× ردشده</span>',
    unverified: '<span class="status bad">⚠ شاهد تأییدنشده</span>',
    needs_correction: '<span class="status pending">✎ نیازمند اصلاح</span>',
    conflicted: '<span class="status pending">⚖ متعارض</span>',
    candidate: '<span class="status info">نامزد</span>',
    pending_review: '<span class="status pending">در انتظار بررسی</span>'
  };
  return map[s] || `<span class="status info">${SN.esc(s)}</span>`;
};

SN.docStatusBadge = st => {
  if (st === 'failed') return '<span class="status bad">× ناموفق</span>';
  if (st === 'warning_scanned') return '<span class="status pending">⚠ ناقص / اسکن</span>';
  if (st === 'processed') return '<span class="status ok">✓ پردازش‌شده</span>';
  return `<span class="status info">${SN.esc(st)}</span>`;
};

SN.openModal = (title, html) => {
  SN.$('modal-title').textContent = title;
  SN.$('modal-body').innerHTML = html;
  SN.$('modal-backdrop').classList.add('open');
};

SN.closeModal = () => SN.$('modal-backdrop').classList.remove('open');

SN.renderBars = (items, emptyMsg = 'داده‌ای ثبت نشده است') => {
  if (!items || !items.length) return `<div class="empty" style="padding:18px"><p class="tiny">${SN.esc(emptyMsg)}</p></div>`;
  const max = Math.max(1, ...items.map(i => i.value));
  return items.map(i => {
    const w = Math.round((i.value / max) * 100);
    return `<div class="bar-row">
      <div style="display:flex;justify-content:space-between"><span>${SN.esc(i.label)}</span><b>${i.value}</b></div>
      <div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${i.color || 'var(--brand)'}"></div></div>
    </div>`;
  }).join('');
};

SN.validateClientFile = file => {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['pdf', 'docx', 'xlsx', 'csv', 'txt'].includes(ext)) {
    return { ok: false, error: `فرمت «.${ext || '?'}» مجاز نیست.` };
  }
  if (file.size === 0) return { ok: false, error: 'فایل خالی است (0 بایت).' };
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: 'حجم فایل از سقف ۲۰ مگابایت بیشتر است.' };
  return { ok: true };
};
