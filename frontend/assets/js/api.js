'use strict';

window.SN = window.SN || {};

SN.api = {
  async request(path, options = {}) {
    const opts = {
      credentials: 'same-origin',
      headers: { ...(options.headers || {}) },
      ...options
    };
    if (opts.body && !(opts.body instanceof FormData) && typeof opts.body === 'object') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }

    const res = await fetch('/api' + path, opts);
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/session') {
      if (typeof SN.showAuthOverlay === 'function') SN.showAuthOverlay();
    }
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) {
      const msg = (data && data.error) ? data.error : (typeof data === 'string' && data ? data : `خطای HTTP ${res.status}`);
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  uploadFiles(path, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api' + path, true);
      xhr.withCredentials = true;
      xhr.upload.onprogress = e => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText || '{}'); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `خطای بارگذاری (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('خطای شبکه در ارسال فایل‌ها.'));
      xhr.send(formData);
    });
  }
};
