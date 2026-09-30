/* ==========================================================================
   RAVA V135 — Version history panel for the builder.
   Talks to /api/versions*. Every save already creates (or extends) a version
   on the server; this panel lists them, lets you pin/name one, and restore.
   Restore = server swaps content (after pinning a "before restore" point),
   then the builder reloads so editor state == stored state.
   ========================================================================== */
(() => {
  'use strict';
  const app = document.querySelector('.builder-app');
  const api = window.__RAVA_BUILDER_API__;
  if (!app || !api) return;
  const kind = () => window.BUILDER_KIND, index = () => window.BUILDER_INDEX;
  if (!kind() || index() === 'new') { /* nothing saved yet → no history */ }

  const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
  function rel(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'همین الان';
    if (s < 3600) return `${fa(Math.floor(s / 60))} دقیقه پیش`;
    if (s < 86400) return `${fa(Math.floor(s / 3600))} ساعت پیش`;
    if (s < 86400 * 7) return `${fa(Math.floor(s / 86400))} روز پیش`;
    try { return new Date(iso).toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' }); } catch { return iso; }
  }
  const clock = iso => { try { return new Date(iso).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const qs = () => `kind=${encodeURIComponent(kind())}&index=${encodeURIComponent(index())}`;

  /* ---------- button in the top bar ---------- */
  const anchor = document.getElementById('undoBtn');
  const btn = document.createElement('button');
  btn.id = 'bpHistoryBtn'; btn.className = 'bp-icon'; btn.type = 'button';
  btn.title = 'تاریخچه نسخه‌ها'; btn.innerHTML = '&#128339;';
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(btn, anchor);

  /* ---------- drawer ---------- */
  const drawer = document.createElement('div');
  drawer.className = 'bph-overlay'; drawer.hidden = true;
  drawer.innerHTML = `<aside class="bph-drawer" role="dialog" aria-modal="true" aria-label="تاریخچه نسخه‌ها">
    <header class="bph-head"><div><b>تاریخچه نسخه‌ها</b><small>هر ذخیره یک نسخه می‌سازد؛ ویرایش‌های پشت‌سرهم در یک نسخه جمع می‌شوند.</small></div><button type="button" class="bph-x" aria-label="بستن">×</button></header>
    <div class="bph-list" id="bphList"></div>
    <footer class="bph-foot">نسخه‌های سنجاق‌شده هیچ‌وقت پاک نمی‌شوند. بقیه تا ۶۰ نسخهٔ آخر نگه داشته می‌شوند.</footer>
  </aside>`;
  app.appendChild(drawer);
  const list = drawer.querySelector('#bphList');
  const close = () => { drawer.hidden = true; };
  drawer.addEventListener('click', e => { if (e.target === drawer || e.target.closest('.bph-x')) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !drawer.hidden) close(); });

  async function load() {
    if (index() === 'new') { list.innerHTML = '<div class="bph-empty">اول صفحه را ذخیره کن تا تاریخچه شروع شود.</div>'; return; }
    list.innerHTML = '<div class="bph-empty">در حال بارگذاری…</div>';
    try {
      const r = await fetch('/api/versions?' + qs()); const o = await r.json();
      if (!o.ok) throw new Error(o.error || 'خطا');
      if (!o.versions.length) { list.innerHTML = '<div class="bph-empty">هنوز نسخه‌ای ثبت نشده. بعد از اولین ذخیره اینجا پر می‌شود.</div>'; return; }
      list.innerHTML = o.versions.map((v, i) => `
        <div class="bph-item${v.pinned ? ' is-pinned' : ''}${i === 0 ? ' is-current' : ''}" data-v="${E(v.id)}">
          <div class="bph-meta">
            <b>${i === 0 ? 'نسخهٔ فعلی' : rel(v.savedAt)}</b>
            <small>${clock(v.savedAt)} · ${fa(v.blockCount)} عنصر${v.edits > 1 ? ` · ${fa(v.edits)} ویرایش` : ''}</small>
            ${v.label ? `<span class="bph-tag">${E(v.label)}</span>` : ''}
          </div>
          <div class="bph-actions">
            <button type="button" data-act="pin" title="${v.pinned ? 'برداشتن سنجاق' : 'سنجاق و نام‌گذاری'}">${v.pinned ? '★' : '☆'}</button>
            ${i === 0 ? '' : '<button type="button" data-act="restore" class="bph-restore">بازگردانی</button>'}
          </div>
        </div>`).join('');
    } catch (e) { list.innerHTML = `<div class="bph-empty">بارگذاری تاریخچه ناموفق بود: ${E(e.message)}</div>`; }
  }

  list.addEventListener('click', async e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const row = b.closest('[data-v]'); const vid = row.dataset.v;
    if (b.dataset.act === 'pin') {
      const pinned = !row.classList.contains('is-pinned');
      const label = pinned ? (prompt('یک نام برای این نسخه (اختیاری):', '') ?? null) : '';
      if (label === null) return;
      await fetch('/api/versions/pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: kind(), index: index(), version: vid, label, pinned }) });
      return load();
    }
    if (b.dataset.act === 'restore') {
      if (!confirm('صفحه به این نسخه برگردد؟\nوضعیت فعلی قبلش به‌صورت یک نسخهٔ سنجاق‌شده ذخیره می‌شود، پس چیزی از دست نمی‌رود.')) return;
      b.disabled = true; b.textContent = '…';
      try {
        /* flush unsaved edits first so they become a version too */
        if (window.__RAVA_BUILDER_DIRTY__) { try { await api.save(); } catch (_) {} }
        const r = await fetch('/api/versions/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: kind(), index: index(), version: vid }) });
        const o = await r.json(); if (!o.ok) throw new Error(o.error || 'خطا');
        window.__RAVA_BUILDER_DIRTY__ = false;
        api.showToast('نسخه بازگردانی شد ✓');
        setTimeout(() => location.reload(), 350);
      } catch (err) { api.showToast('بازگردانی ناموفق بود: ' + err.message); b.disabled = false; b.textContent = 'بازگردانی'; }
    }
  });

  btn.addEventListener('click', () => { drawer.hidden = false; load(); });
})();
