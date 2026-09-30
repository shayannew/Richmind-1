/* ==========================================================================
   RAVA V90 — Builder recovery watchdog
   The builder page has referenced /builder-recovery.js since V89, but the file
   was never present, so every builder load 404'd on it. This is the real
   implementation.

   The original "dead shell" root cause (a temporal-dead-zone crash in
   normalizeState) is fixed in builder.js itself. This file is the safety net:
   if the editor ever fails to boot again, the user gets a readable diagnosis
   and their unsaved content instead of an empty grey panel.
   ========================================================================== */
(() => {
  'use strict';

  const app = document.querySelector('.builder-app');
  if (!app) return;

  const bootErrors = [];
  window.addEventListener('error', e => {
    bootErrors.push(String(e?.error?.stack || e?.message || 'unknown error'));
  });
  window.addEventListener('unhandledrejection', e => {
    bootErrors.push(String(e?.reason?.stack || e?.reason || 'unhandled rejection'));
  });

  function booted() {
    if (window.__RAVA_BUILDER_BOOT_OK__ !== true) return false;
    if (!window.__RAVA_BUILDER_API__) return false;
    // A booted editor always has an element library; an empty one means the
    // render pass threw part-way through.
    const lib = document.getElementById('elementGroups');
    return !!(lib && lib.children.length);
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function snapshotState() {
    try {
      if (window.__RAVA_BUILDER_API__?.getState) return window.__RAVA_BUILDER_API__.getState();
    } catch (_) { /* fall through */ }
    return window.INITIAL || {};
  }

  function render() {
    if (document.getElementById('bpRecovery')) return;

    const state = snapshotState();
    const kind = window.BUILDER_KIND || 'product';
    const index = window.BUILDER_INDEX;
    const blocks = Array.isArray(state.blocks) ? state.blocks.length : 0;

    const panel = document.createElement('div');
    panel.id = 'bpRecovery';
    panel.dir = 'rtl';
    panel.innerHTML = `
      <div class="bpr-card" role="alertdialog" aria-labelledby="bprTitle">
        <div class="bpr-head">
          <span class="bpr-icon">!</span>
          <div>
            <h2 id="bprTitle">ویرایشگر بالا نیامد</h2>
            <p>محتوای این ${kind === 'blog' ? 'مقاله' : kind === 'page' ? 'صفحه' : 'محصول'} سالم است و از بین نرفته. از این‌جا می‌توانی آن را ویرایش یا خارج کنی.</p>
          </div>
        </div>

        <div class="bpr-stats">
          <div><small>نوع</small><strong>${esc(kind)}</strong></div>
          <div><small>شناسه</small><strong>${esc(index)}</strong></div>
          <div><small>تعداد بلوک</small><strong>${blocks}</strong></div>
        </div>

        <label class="bpr-field">
          <span>عنوان</span>
          <input id="bprTitleInput" type="text" value="${esc(state.title || '')}">
        </label>
        <label class="bpr-field">
          <span>خلاصه</span>
          <textarea id="bprExcerpt" rows="3">${esc(state.excerpt || '')}</textarea>
        </label>

        <div class="bpr-actions">
          <button id="bprSave" class="bpr-btn bpr-btn--primary">ذخیره‌ی اضطراری</button>
          <button id="bprReload" class="bpr-btn">بارگذاری دوباره</button>
          <button id="bprDownload" class="bpr-btn">دانلود نسخه پشتیبان (JSON)</button>
          <a class="bpr-btn" href="/admin">بازگشت به پنل</a>
        </div>

        <details class="bpr-details">
          <summary>جزئیات فنی خطا</summary>
          <pre>${esc(bootErrors.join('\n\n') || 'خطای جاوااسکریپتی ثبت نشد. احتمالاً یکی از فایل‌های Builder بارگذاری نشده است.')}</pre>
        </details>

        <p class="bpr-msg" id="bprMsg"></p>
      </div>`;

    document.body.appendChild(panel);

    const msg = panel.querySelector('#bprMsg');
    const say = (text, ok) => { msg.textContent = text; msg.dataset.ok = ok ? '1' : '0'; };

    panel.querySelector('#bprReload').onclick = () => location.reload();

    panel.querySelector('#bprDownload').onclick = () => {
      try {
        const payload = JSON.stringify({ kind, index, item: state }, null, 2);
        const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `rava-${kind}-${String(index).replace(/[^a-z0-9-]/gi, '')}-recovery.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (err) {
        say('دانلود ناموفق بود: ' + err.message, false);
      }
    };

    panel.querySelector('#bprSave').onclick = async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      say('در حال ذخیره...', true);
      try {
        const item = Object.assign({}, state, {
          title: panel.querySelector('#bprTitleInput').value,
          excerpt: panel.querySelector('#bprExcerpt').value
        });
        const res = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, index, item })
        });
        const out = await res.json();
        if (!out.ok) throw new Error(out.error || 'save failed');
        say('ذخیره شد. محتوای شما در امان است.', true);
      } catch (err) {
        say('ذخیره ناموفق بود: ' + err.message, false);
      } finally {
        btn.disabled = false;
      }
    };
  }

  // Give the editor a fair chance to finish its first paint before judging it.
  const check = () => { if (!booted()) render(); };
  if (document.readyState === 'complete') setTimeout(check, 1200);
  else window.addEventListener('load', () => setTimeout(check, 1200));

  window.__RAVA_BUILDER_RECOVERY__ = { check, render, errors: bootErrors };

  const css = document.createElement('style');
  css.textContent = `
  #bpRecovery{position:fixed;inset:0;z-index:900;background:rgba(10,15,26,.62);backdrop-filter:blur(6px);display:grid;place-items:center;padding:20px;font-family:Vazirmatn,system-ui,Arial,sans-serif}
  #bpRecovery .bpr-card{width:min(560px,100%);max-height:92vh;overflow:auto;background:#fff;color:#16202f;border-radius:20px;padding:26px;box-shadow:0 30px 90px rgba(6,11,20,.45)}
  #bpRecovery .bpr-head{display:flex;gap:14px;align-items:flex-start;margin-bottom:18px}
  #bpRecovery .bpr-icon{width:38px;height:38px;flex:none;border-radius:11px;background:#fdeceb;color:#d93a35;display:grid;place-items:center;font-size:20px;font-weight:900}
  #bpRecovery h2{margin:0 0 5px;font-size:19px;font-weight:800}
  #bpRecovery .bpr-head p{margin:0;font-size:13px;line-height:1.85;color:#5a6779}
  #bpRecovery .bpr-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:18px}
  #bpRecovery .bpr-stats div{background:#f1f4f9;border-radius:11px;padding:10px 12px}
  #bpRecovery .bpr-stats small{display:block;font-size:10px;color:#8d98a9;margin-bottom:3px}
  #bpRecovery .bpr-stats strong{font-size:13px;word-break:break-all}
  #bpRecovery .bpr-field{display:block;margin-bottom:12px}
  #bpRecovery .bpr-field span{display:block;font-size:11px;color:#5a6779;margin-bottom:6px;font-weight:600}
  #bpRecovery input,#bpRecovery textarea{width:100%;box-sizing:border-box;border:1px solid #e2e7ef;background:#f8fafc;border-radius:9px;padding:10px 12px;font:inherit;font-size:13px;color:inherit;resize:vertical}
  #bpRecovery input:focus,#bpRecovery textarea:focus{outline:0;border-color:#2f5fe0;background:#fff;box-shadow:0 0 0 3px rgba(47,95,224,.14)}
  #bpRecovery .bpr-actions{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 14px}
  #bpRecovery .bpr-btn{border:1px solid #e2e7ef;background:#fff;color:#16202f;border-radius:10px;padding:10px 14px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;text-decoration:none;display:inline-block}
  #bpRecovery .bpr-btn:hover{border-color:#bed0ff;background:#eaf0ff;color:#2f5fe0}
  #bpRecovery .bpr-btn--primary{background:#2f5fe0;border-color:#2f5fe0;color:#fff}
  #bpRecovery .bpr-btn--primary:hover{filter:brightness(1.07);color:#fff;background:#2f5fe0}
  #bpRecovery .bpr-btn:disabled{opacity:.5;cursor:not-allowed}
  #bpRecovery .bpr-details{border-top:1px solid #e2e7ef;padding-top:12px}
  #bpRecovery summary{cursor:pointer;font-size:12px;color:#5a6779;font-weight:700}
  #bpRecovery pre{margin:10px 0 0;padding:12px;background:#0f1420;color:#e8edf6;border-radius:10px;font-size:11px;line-height:1.7;overflow:auto;max-height:190px;direction:ltr;text-align:left;white-space:pre-wrap;word-break:break-word}
  #bpRecovery .bpr-msg{margin:10px 0 0;font-size:12.5px;font-weight:700;min-height:18px;color:#10a05f}
  #bpRecovery .bpr-msg[data-ok="0"]{color:#d93a35}
  @media(max-width:520px){#bpRecovery .bpr-card{padding:20px}#bpRecovery .bpr-stats{grid-template-columns:1fr}}`;
  document.head.appendChild(css);
})();
