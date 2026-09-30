/* ==========================================================================
   RAVA V90 — Builder Pro
   Additive feature layer for the page builder. It talks to the editor only
   through window.__RAVA_BUILDER_API__, so the fragile core stays untouched.

   Adds: light/dark theme, tabbed left panel, element glyphs + favourites,
   ready-made section presets, a command palette, a shortcuts sheet, draggable
   panel widths, grid/outline/focus toggles, zoom-to-fit, a live save
   indicator, an unsaved-changes guard, and style copy/paste between elements.
   ========================================================================== */
(() => {
  'use strict';

  const app = document.querySelector('.builder-app');
  const api = window.__RAVA_BUILDER_API__;
  if (!app || !api) return;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const frame = $('#canvasFrame');
  const stage = $('.builder-stage');
  const toast = msg => api.showToast(msg);

  const LS = {
    get(key, fallback) {
      try { const v = localStorage.getItem('rava.builder.' + key); return v === null ? fallback : JSON.parse(v); }
      catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('rava.builder.' + key, JSON.stringify(value)); } catch (_) { /* private mode */ }
    }
  };

  const isTyping = () => {
    const a = document.activeElement;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(a?.tagName) || a?.isContentEditable;
  };

  /* ======================================================================
     1. Theme
     ====================================================================== */
  function applyTheme(mode) {
    app.dataset.bpTheme = mode;
    LS.set('theme', mode);
    const btn = $('#bpThemeBtn');
    if (btn) {
      btn.textContent = mode === 'dark' ? '\u25D1' : '\u25D0';
      btn.title = mode === 'dark' ? 'تم روشن' : 'تم تیره';
    }
  }
  function initTheme() {
    const saved = LS.get('theme', null);
    const preferred = saved || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(preferred);
    $('#bpThemeBtn')?.addEventListener('click', () => {
      applyTheme(app.dataset.bpTheme === 'dark' ? 'light' : 'dark');
    });
  }

  /* ======================================================================
     2. Left panel tabs (elements / layers / presets)
     ====================================================================== */
  function showLeftTab(name) {
    $$('.bp-left-tabs button').forEach(b => b.classList.toggle('active', b.dataset.lefttab === name));
    $$('.bp-left-body').forEach(b => { b.hidden = b.dataset.leftpane !== name; });
    LS.set('leftTab', name);
    if (name === 'elements') setTimeout(() => $('#elementSearch')?.focus(), 60);
  }
  function initLeftTabs() {
    $$('.bp-left-tabs button').forEach(b => b.addEventListener('click', () => showLeftTab(b.dataset.lefttab)));
    showLeftTab(LS.get('leftTab', 'elements'));
    // Selecting something on the canvas is a strong hint the user wants layers.
    const origSelect = api.select;
    api.select = function (id) {
      const out = origSelect.apply(this, arguments);
      updateBreadcrumb();
      return out;
    };
  }

  /* ======================================================================
     3. Element library — glyphs, favourites, recents
     ====================================================================== */
  const GLYPHS = {
    section: '\u25A6', columns: '\u25EB', spacer: '\u2195', divider: '\u2014',
    heading: 'H', text: '\u00B6', button: '\u2B21', buyButton: '\u2B21', image: '\u25A3', video: '\u25B6',
    audio: '\u266B', logo: '\u25C8', badge: '\u25CF', icon: '\u2726', quote: '\u201C', list: '\u2261',
    card: '\u25A2', feature: '\u2713', rating: '\u2605', testimonial: '\u275D',
    faq: '?', form: '\u2709', pricing: '\u00A4', stats: '\u2211', announcement: '\u2762',
    embed: '\u2329', countdown: '\u25F4', social: '\u25CE', carousel: '\u25B7',
    stickyCta: '\u2691', stickyButton: '\u2691', stickySection: '\u2338', stickyColumn: '\u2338', stickyBuyBar: '\u2338', trustBar: '\u2714', iconGrid: '\u229E',
    steps: '\u2460', timeline: '\u2937', ctaSplit: '\u25E7', buttonGroup: '\u29C9',
    guarantee: '\u26E8', leadMagnet: '\u2B07', featureCompare: '\u2338', avatarStack: '\u25CC',
    latestProducts: '\u25A4', latestPosts: '\u25A5', latestElements: '\u25A4', group: '\u2751', marquee: '\u27A4',
    logoCloud: '\u2601', progress: '\u25AC', comparison: '\u25EA',
    upsellBox: '\uFF0B', offerCard: '\u25A3', offerBox: '\u25A3', countdownOffer: '\u25F4',
    testiMarquee: '\u27F3', logoWall: '\u2601', roadmap: '\u2937', forWho: '\u003F',
    popupSection: '\u29C9', mediaMarquee: '\u21C4', stickyWidget: '\u2691', custom: '\u2039\u203A', bonusStack: '\u{1F381}', beforeAfter: '\u25C0', curriculum: '\u2261', instructor: '\u2605'
  };

  function favourites() { return LS.get('favourites', []); }
  function toggleFavourite(type) {
    const list = favourites();
    const i = list.indexOf(type);
    if (i >= 0) list.splice(i, 1); else list.push(type);
    LS.set('favourites', list.slice(0, 8));
    decorateLibrary();
    renderFavRow();
  }

  function decorateLibrary() {
    const favs = favourites();
    $$('.add-el').forEach(btn => {
      const type = btn.dataset.elementType;
      if (!type) return;
      btn.dataset.bpGlyph = GLYPHS[type] || '\u25AB';
      btn.classList.toggle('bp-is-fav', favs.includes(type));
      if (!btn.dataset.bpBound) {
        btn.dataset.bpBound = '1';
        btn.addEventListener('contextmenu', e => {
          e.preventDefault();
          toggleFavourite(type);
          toast(favourites().includes(type) ? 'به علاقه‌مندی‌ها اضافه شد' : 'از علاقه‌مندی‌ها حذف شد');
        });
      }
    });
  }

  function renderFavRow() {
    const row = $('#bpFavRow');
    if (!row) return;
    const known = new Set((window.ELEMENTS || []).map(x => x[2]));
    const favs = favourites().filter(t => !known.size || known.has(t)); /* V200 — removed elements drop out of favourites */
    if (!favs.length) { row.hidden = true; row.innerHTML = ''; return; }
    const labelOf = t => (window.ELEMENTS || []).find(x => x[2] === t)?.[1] || t;
    row.hidden = false;
    row.innerHTML = favs.map(t =>
      `<button type="button" class="bp-fav-chip" data-fav="${t}">${GLYPHS[t] || '\u25AB'} ${labelOf(t)}</button>`
    ).join('');
    $$('[data-fav]', row).forEach(b => b.addEventListener('click', () => api.addElement(b.dataset.fav)));
  }

  function initLibrary() {
    decorateLibrary();
    renderFavRow();
    // The core re-renders the library on every search keystroke.
    const groups = $('#elementGroups');
    if (groups) new MutationObserver(() => decorateLibrary()).observe(groups, { childList: true, subtree: true });
  }

  /* ======================================================================
     4. Section presets
     V118 — همهٔ بخش‌های آماده حذف شدند (خواستهٔ کاربر). الگوی «محصولات و مقالات»
     به کتابخانهٔ عناصر (بخش «عناصر دیگر») منتقل شد و پنل «الگوهای شما» از حالا
     فقط بلوک‌های ذخیره‌شدهٔ خود کاربر را نشان می‌دهد (ذخیره با دکمهٔ
     «ذخیره به‌عنوان بلوک قابل‌استفاده مجدد» در تب پیشرفته).
     ====================================================================== */
  const PRESETS = [];

  function insertPreset(preset) {
    try {
      const section = api.addElementToTarget('section', null, 'append');
      if (!section) throw new Error('section could not be created');
      preset.parts.forEach(([type, patch]) => {
        const block = api.addElementToTarget(type, section.id, 'inside');
        if (block && patch) Object.assign(block, patch);
      });
      api.snapshot();
      api.renderAll();
      api.select(section.id);
      document.querySelector(`.builder-node[data-id="${section.id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast(`بخش «${preset.name}» اضافه شد`);
    } catch (err) {
      toast('افزودن بخش ناموفق بود: ' + err.message);
    }
  }

  function initPresets() {
    const host = $('#bpPresetList');
    if (!host) return;
    host.innerHTML = PRESETS.map(p => `
      <button type="button" class="bp-preset" data-preset="${p.id}">
        <span class="bp-preset-glyph">${p.glyph}</span>
        <strong>${p.name}</strong>
        <small>${p.desc}</small>
      </button>`).join('');
    $$('[data-preset]', host).forEach(btn => btn.addEventListener('click', () => {
      const preset = PRESETS.find(p => p.id === btn.dataset.preset);
      if (preset) insertPreset(preset);
    }));
  }

  /* ======================================================================
     5. Stage tools — grid, outline, focus, zoom
     ====================================================================== */
  function initStageTools() {
    const gridBtn = $('#bpGridBtn');
    const outlineBtn = $('#bpOutlineBtn');
    const focusBtn = $('#focusBtn');

    const setGrid = on => { app.classList.toggle('bp-grid', on); gridBtn?.classList.toggle('is-on', on); LS.set('grid', on); };
    const setOutline = on => { app.classList.toggle('bp-outline', on); outlineBtn?.classList.toggle('is-on', on); LS.set('outline', on); };

    setGrid(LS.get('grid', false));
    setOutline(LS.get('outline', false));

    gridBtn?.addEventListener('click', () => setGrid(!app.classList.contains('bp-grid')));
    outlineBtn?.addEventListener('click', () => setOutline(!app.classList.contains('bp-outline')));

    focusBtn?.addEventListener('click', () => {
      const on = app.classList.toggle('bp-focus');
      focusBtn.classList.toggle('is-on', on);
      setTimeout(fitCanvas, 240);
    });

    $('#bpZoomFit')?.addEventListener('click', fitCanvas);
    $('#zoomValue')?.addEventListener('click', () => setZoom(1));

    // V91: switching to a smaller device now scales the frame to fit the stage,
    // so the whole phone/tablet is visible instead of running off the bottom.
    $$('.device-switch button').forEach(btn => btn.addEventListener('click', () => {
      setTimeout(fitCanvas, 60);
    }));
  }

  function setZoom(z) {
    if (!frame) return;
    z = Math.max(0.35, Math.min(2, z));
    frame.style.zoom = z;
    const out = $('#zoomValue');
    if (out) out.textContent = Math.round(z * 100) + '%';
  }

  function fitCanvas() {
    if (!frame || !stage) return;
    const availableW = Math.max(260, stage.clientWidth - 70);
    const availableH = Math.max(320, stage.clientHeight - 110);
    const device = frame.dataset.device
      || ['mobile', 'tablet', 'desktop', 'preview'].find(d => frame.classList.contains(d))
      || 'desktop';
    /* V100 — the mobile canvas width is configurable (375/390/393/412/428/custom);
       fit against the REAL frame width instead of a hardcoded 390. */
    const configuredW = parseInt(frame.style.width, 10);
    const base = device === 'mobile' ? (configuredW || 390)
      : device === 'tablet' ? 820 : 1200;

    if (device === 'mobile' || device === 'tablet') {
      // V99.1 — the device screen is a fixed-height viewport now (canvas scrolls
      // inside it), so "fit" means: the WHOLE device fits the stage, both axes.
      const frameH = { mobile: 844 + 28, tablet: 1120 + 36 }[device]; // + bezel padding
      const z = Math.min(1, availableW / (base + 24), availableH / frameH);
      setZoom(Math.max(0.35, z));
    } else {
      // V99.2 — narrow windows: keep desktop readable (min 50%) and tell the
      // user when the stage is simply too small for a desktop preview.
      const z = Math.max(0.5, Math.min(1, availableW / base));
      setZoom(z);
      const hint = $('#stageHint');
      if (hint) {
        if (z <= 0.5 && availableW / base < 0.5) {
          hint.textContent = 'پنجره برای نمای دسکتاپ کوچک است';
        } else if (hint.dataset.defaultHint) {
          hint.textContent = hint.dataset.defaultHint;
        }
      }
    }
  }

  /* ======================================================================
     6. Resizable side panels
     ====================================================================== */
  function initResizers() {
    const left = $('.builder-panel--left');
    const right = $('.builder-panel--right');
    if (!stage || !left || !right) return;

    const savedLeft = LS.get('leftWidth', null);
    const savedRight = LS.get('rightWidth', null);
    if (savedLeft) app.style.setProperty('--bp-left-w', savedLeft + 'px');
    if (savedRight) app.style.setProperty('--bp-right-w', savedRight + 'px');

    const rtl = document.documentElement.dir === 'rtl';

    function makeResizer(side) {
      const el = document.createElement('div');
      el.className = 'bp-resizer';
      el.dataset.side = side;
      // In RTL the left panel sits on the visual right of the stage.
      const onStart = side === 'left' ? (rtl ? 'right' : 'left') : (rtl ? 'left' : 'right');
      el.style[onStart] = '0';
      stage.appendChild(el);

      let startX = 0, startW = 0, active = false;

      el.addEventListener('pointerdown', e => {
        active = true;
        startX = e.clientX;
        startW = parseFloat(getComputedStyle(app).getPropertyValue(side === 'left' ? '--bp-left-w' : '--bp-right-w')) || 320;
        el.setPointerCapture(e.pointerId);
        el.classList.add('is-active');
        document.body.style.userSelect = 'none';
      });

      el.addEventListener('pointermove', e => {
        if (!active) return;
        let delta = e.clientX - startX;
        // Dragging toward the stage should shrink the panel on either side.
        if (side === 'left') delta = rtl ? delta : -delta;
        else delta = rtl ? -delta : delta;
        const width = Math.max(220, Math.min(560, startW - delta));
        app.style.setProperty(side === 'left' ? '--bp-left-w' : '--bp-right-w', width + 'px');
      });

      const end = e => {
        if (!active) return;
        active = false;
        el.classList.remove('is-active');
        document.body.style.userSelect = '';
        try { el.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
        const width = parseFloat(getComputedStyle(app).getPropertyValue(side === 'left' ? '--bp-left-w' : '--bp-right-w'));
        LS.set(side === 'left' ? 'leftWidth' : 'rightWidth', Math.round(width));
        fitCanvas();
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('dblclick', () => {
        app.style.removeProperty(side === 'left' ? '--bp-left-w' : '--bp-right-w');
        LS.set(side === 'left' ? 'leftWidth' : 'rightWidth', null);
      });
    }

    makeResizer('left');
    makeResizer('right');
  }

  /* ======================================================================
     7. Save indicator + unsaved-changes guard
     ====================================================================== */
  function initSaveState() {
    const dot = $('#bpSaveDot');
    const status = $('#saveStatus');
    if (!dot || !status) return;

    const sync = () => {
      const text = status.textContent || '';
      const state = window.__RAVA_BUILDER_SAVE_STATE__
        || (/خطا/.test(text) ? 'error'
          : /ذخیره شد/.test(text) ? 'saved'
            : /در حال/.test(text) ? 'saving' : 'dirty');
      dot.dataset.state = state;
      dot.title = text.trim() || 'وضعیت ذخیره';
    };

    sync();
    new MutationObserver(sync).observe(status, { childList: true, characterData: true, subtree: true });

    window.addEventListener('beforeunload', e => {
      if (window.__RAVA_BUILDER_DIRTY__) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  /* ======================================================================
     8. Inspector breadcrumb + style copy/paste
     ====================================================================== */
  const STYLE_KEYS = [
    'bg', 'backgroundColor', 'color', 'fg', 'accent', 'border', 'borderWidth', 'borderStyle',
    'radius', 'shadow', 'size', 'weight', 'line', 'letter', 'fontFamily', 'italic',
    'decoration', 'transform', 'align', 'padX', 'padY', 'padTop', 'padRight', 'padBottom',
    'padLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'opacity',
    'gradient', 'gradient1', 'gradient2', 'gradientDir', 'maxWidth'
  ];
  let styleClipboard = null;

  function updateBreadcrumb() {
    const crumb = $('#bpBreadcrumb');
    if (!crumb) return;
    const sel = api.getSelection?.();
    if (!sel?.id) { crumb.textContent = 'تنظیمات کل صفحه'; return; }
    const trail = [];
    let entry = api.find(sel.id);
    let guard = 0;
    while (entry && guard++ < 12) {
      trail.unshift(entry.b.type);
      entry = entry.parent ? api.find(entry.parent.id) : null;
    }
    crumb.textContent = trail.join(' \u203A ') || 'عنصر';
  }

  function initStyleClipboard() {
    /* V124 — دکمه‌های ▣ کپی/◧ پیست استایل برگشتند: استایل بصری عنصر انتخاب‌شده را
       (کلیدهای STYLE_KEYS) یک‌جا منتقل می‌کند؛ پیست روی عنصر انتخاب‌شدهٔ فعلی می‌نشیند. */
    const copyBtn = $('#bpCopyStyle');
    const pasteBtn = $('#bpPasteStyle');
    if (copyBtn) copyBtn.addEventListener('click', () => {
      const sel = api.getSelected?.();
      if (!sel) { api.showToast?.('یک عنصر را انتخاب کن'); return; }
      styleClipboard = {};
      STYLE_KEYS.forEach(k => { if (sel[k] !== undefined) styleClipboard[k] = sel[k]; });
      api.showToast?.('استایل کپی شد — عنصر دیگری را انتخاب و پیست کن');
    });
    if (pasteBtn) pasteBtn.addEventListener('click', () => {
      const sel = api.getSelected?.();
      if (!sel) { api.showToast?.('یک عنصر را انتخاب کن'); return; }
      if (!styleClipboard) { api.showToast?.('اول استایلی را کپی کن'); return; }
      Object.entries(styleClipboard).forEach(([k, v]) => { sel[k] = v; });
      api.snapshot?.(); api.renderAll?.();
      api.showToast?.('استایل اعمال شد');
    });
  }

  /* ======================================================================
     9. Command palette
     ====================================================================== */
  function buildCommands() {
    const cmds = [
      { glyph: '\u{1F4BE}', label: 'ذخیره‌ی صفحه', meta: 'Ctrl+S', run: () => api.save() },
      { glyph: '\u2630', label: 'پیش‌نمایش در تب جدید', meta: 'Ctrl+Shift+P', run: () => $('#previewBtn')?.click() },
      { glyph: '\u21B6', label: 'واگرد', meta: 'Ctrl+Z', run: () => api.undo() },
      { glyph: '\u21B7', label: 'انجام دوباره', meta: 'Ctrl+Shift+Z', run: () => api.redo() },
      { glyph: '\u2398', label: 'تکثیر عنصر انتخاب‌شده', meta: 'Ctrl+D', run: () => api.duplicateSelected() },
      { glyph: '\u2751', label: 'گروه‌کردن انتخاب', meta: 'Ctrl+G', run: () => api.groupSelected() },
      { glyph: '\u2750', label: 'خارج‌کردن از گروه', meta: 'Ctrl+U', run: () => api.ungroupSelected() },
      { glyph: '\u232B', label: 'حذف عنصر انتخاب‌شده', meta: 'Delete', run: () => api.deleteSelected() },
      { glyph: '\u2699', label: 'تنظیمات کل صفحه', meta: '', run: () => $('#globalBtn')?.click() },
      { glyph: '\u25D0', label: 'تغییر تم روشن / تیره', meta: '', run: () => $('#bpThemeBtn')?.click() },
      { glyph: '\u25A6', label: 'نمایش/مخفی‌کردن شبکه‌ی راهنما', meta: '', run: () => $('#bpGridBtn')?.click() },
      { glyph: '\u25A1', label: 'نمایش/مخفی‌کردن مرز عناصر', meta: '', run: () => $('#bpOutlineBtn')?.click() },
      { glyph: '\u25C9', label: 'حالت تمرکز', meta: '', run: () => $('#focusBtn')?.click() },
      { glyph: '\u2750', label: 'اندازه‌کردن بوم در صفحه', meta: '', run: fitCanvas },
      { glyph: '\u2328', label: 'میان‌برهای صفحه‌کلید', meta: '?', run: openShortcuts }
    ];

    (window.ELEMENTS || []).forEach(([, label, type]) => {
      cmds.push({ glyph: GLYPHS[type] || '\u25AB', label: `افزودن: ${label}`, meta: 'عنصر', run: () => api.addElement(type) });
    });
    PRESETS.forEach(p => {
      cmds.push({ glyph: p.glyph, label: `بخش آماده: ${p.name}`, meta: 'الگو', run: () => insertPreset(p) });
    });
    return cmds;
  }

  let paletteEl = null, paletteCmds = [], paletteIndex = 0, paletteFiltered = [];

  function openPalette() {
    if (!paletteEl) createPalette();
    paletteCmds = buildCommands();
    paletteEl.hidden = false;
    const input = $('.bp-palette__input', paletteEl);
    input.value = '';
    filterPalette('');
    setTimeout(() => input.focus(), 20);
  }
  function closePalette() { if (paletteEl) paletteEl.hidden = true; }

  function filterPalette(query) {
    const q = query.trim().toLowerCase();
    paletteFiltered = q ? paletteCmds.filter(c => c.label.toLowerCase().includes(q)) : paletteCmds;
    paletteFiltered = paletteFiltered.slice(0, 60);
    paletteIndex = 0;
    const list = $('.bp-palette__list', paletteEl);
    if (!paletteFiltered.length) {
      list.innerHTML = '<div class="bp-palette__empty">چیزی پیدا نشد</div>';
      return;
    }
    list.innerHTML = paletteFiltered.map((c, i) => `
      <button type="button" class="bp-palette__item${i === 0 ? ' is-active' : ''}" data-i="${i}">
        <span class="bp-palette__glyph">${c.glyph}</span>
        <span>${c.label}</span>
        ${c.meta ? `<span class="bp-palette__meta">${c.meta}</span>` : ''}
      </button>`).join('');
    $$('.bp-palette__item', list).forEach(b => b.addEventListener('click', () => runPalette(Number(b.dataset.i))));
  }

  function highlightPalette() {
    $$('.bp-palette__item', paletteEl).forEach((b, i) => b.classList.toggle('is-active', i === paletteIndex));
    $$('.bp-palette__item', paletteEl)[paletteIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function runPalette(i) {
    const cmd = paletteFiltered[i];
    closePalette();
    if (!cmd) return;
    try { cmd.run(); } catch (err) { toast('اجرای فرمان ناموفق بود: ' + err.message); }
  }

  function createPalette() {
    paletteEl = document.createElement('div');
    paletteEl.className = 'bp-overlay';
    paletteEl.id = 'bpPalette';
    paletteEl.hidden = true;
    paletteEl.innerHTML = `
      <div class="bp-palette" role="dialog" aria-label="جست‌وجوی فرمان">
        <input class="bp-palette__input" type="text" placeholder="یک عنصر، بخش یا فرمان را جست‌وجو کن..." autocomplete="off">
        <div class="bp-palette__list"></div>
        <div class="bp-palette__foot">
          <span><kbd>\u2191\u2193</kbd>جابه‌جایی</span>
          <span><kbd>Enter</kbd>اجرا</span>
          <span><kbd>Esc</kbd>بستن</span>
        </div>
      </div>`;
    document.body.appendChild(paletteEl);

    paletteEl.addEventListener('click', e => { if (e.target === paletteEl) closePalette(); });
    const input = $('.bp-palette__input', paletteEl);
    input.addEventListener('input', () => filterPalette(input.value));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); paletteIndex = Math.min(paletteFiltered.length - 1, paletteIndex + 1); highlightPalette(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); paletteIndex = Math.max(0, paletteIndex - 1); highlightPalette(); }
      else if (e.key === 'Enter') { e.preventDefault(); runPalette(paletteIndex); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    });
  }

  /* ======================================================================
     10. Shortcuts sheet
     ====================================================================== */
  const SHORTCUTS = [
    ['Ctrl + K', 'جست‌وجوی فرمان'],
    ['/', 'جست‌وجو در کتابخانه‌ی عناصر'],
    ['Ctrl + S', 'ذخیره'],
    ['Ctrl + Z', 'واگرد'],
    ['Ctrl + Shift + Z', 'انجام دوباره'],
    ['Ctrl + D', 'تکثیر عنصر'],
    ['Ctrl + C / Ctrl + V', 'کپی و پیست عنصر'],
    ['Ctrl + G / Ctrl + U', 'گروه‌کردن / خارج‌کردن'],
    ['Ctrl + Shift + P', 'پیش‌نمایش'],
    ['\u2191 / \u2193', 'جابه‌جایی عنصر انتخاب‌شده'],
    ['Delete', 'حذف عنصر'],
    ['Esc', 'لغو انتخاب و بستن پنجره‌ها'],
    ['کلیک راست روی عنصر کتابخانه', 'افزودن به علاقه‌مندی‌ها'],
    ['دابل‌کلیک روی دستگیره‌ی پنل', 'بازگشت به عرض پیش‌فرض']
  ];

  let sheetEl = null;
  function openShortcuts() {
    if (!sheetEl) {
      sheetEl = document.createElement('div');
      sheetEl.className = 'bp-overlay';
      sheetEl.hidden = true;
      sheetEl.innerHTML = `
        <div class="bp-sheet" role="dialog" aria-label="میان‌برهای صفحه‌کلید">
          <h3>میان‌برهای صفحه‌کلید</h3>
          <p>سریع‌ترین راه کار با Builder.</p>
          <div class="bp-shortcut-grid">
            ${SHORTCUTS.map(([k, d]) => `<div class="bp-shortcut"><span>${d}</span><kbd>${k}</kbd></div>`).join('')}
          </div>
          <button type="button" class="bp-sheet__close">بستن</button>
        </div>`;
      document.body.appendChild(sheetEl);
      sheetEl.addEventListener('click', e => { if (e.target === sheetEl) sheetEl.hidden = true; });
      $('.bp-sheet__close', sheetEl).addEventListener('click', () => { sheetEl.hidden = true; });
    }
    sheetEl.hidden = false;
  }

  /* ======================================================================
     11. Keyboard
     ====================================================================== */
  function initKeyboard() {
    // Capture phase so Ctrl+K reaches the palette instead of the V64 handler,
    // which only focused the element search box.
    document.addEventListener('keydown', e => {
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key.toLowerCase() === 'k') {
        e.preventDefault(); e.stopPropagation();
        paletteEl && !paletteEl.hidden ? closePalette() : openPalette();
        return;
      }
      /* V122 — Ctrl+Shift+Z this way به core واگذار شد (builder.js خودش redo می‌زند و
         stopPropagation می‌کند). دو هندلر موازی همان کلید را undo+redo می‌کردند و
         نتیجه عملاً هیچ بود. */
      if (isTyping()) return;

      /* V99.2 — power shortcuts: delete / duplicate / reorder selected block */
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const hasSel = (api.getSelection && api.getSelection().id) || api.selectedId;
        if (hasSel) { e.preventDefault(); api.deleteSelected && api.deleteSelected(); }
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'd') {
        const hasSel = (api.getSelection && api.getSelection().id) || api.selectedId;
        if (hasSel) { e.preventDefault(); api.duplicateSelected && api.duplicateSelected(); }
        return;
      }
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const hasSel = (api.getSelection && api.getSelection().id) || api.selectedId;
        if (hasSel) {
          e.preventDefault();
          api.moveSibling && api.moveSibling(hasSel, e.key === 'ArrowUp' ? -1 : 1);
          api.renderAll && api.renderAll();
        }
        return;
      }

      if (e.key === '/') { e.preventDefault(); showLeftTab('elements'); $('#elementSearch')?.focus(); return; }
      if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }
      if (e.key === 'Escape') {
        closePalette();
        if (sheetEl) sheetEl.hidden = true;
        $$('.builder-panel.is-mobile-open').forEach(p => p.classList.remove('is-mobile-open'));
      }
    }, true);

    $('#bpPaletteBtn')?.addEventListener('click', openPalette);
    $('#bpHelpBtn')?.addEventListener('click', openShortcuts);
  }

  /* ======================================================================
     12. Mobile chrome
     ====================================================================== */
  function initMobile() {
    $('#bpLeftToggle')?.addEventListener('click', () => {
      $('.builder-panel--left')?.classList.toggle('is-mobile-open');
    });
    // Tapping the canvas should dismiss an open drawer on touch layouts.
    $('.builder-stage')?.addEventListener('pointerdown', () => {
      if (window.matchMedia('(max-width: 920px)').matches) {
        $$('.builder-panel.is-mobile-open').forEach(p => p.classList.remove('is-mobile-open'));
      }
    }, { passive: true });
  }

  /* ======================================================================
     13. Tidy up legacy injected toolbars
     ====================================================================== */
  /* V99 — affiliate ref guard for the PUBLIC site (runs on any page that
     loads builder-pro.js alongside the product renderer): if the current URL
     carries ?ref=<code> (an affiliate landing), a MutationObserver re-attaches
     it to every internal link the page renders afterwards. This protects the
     attribution on cookie-less browsers and inside sub-page navigation even if
     a block renderer misses a link. If there is no ref in the URL, the guard
     is inert — nothing is added to any link. */
  function installPublicRefGuard() {
    if (document.querySelector('.public-landing, .public-article, .v66-public-page')) return;
    if (!/[?&]ref=[A-Za-z0-9._~-]+/.test(location.search)) return;
    const ref = (new URLSearchParams(location.search).get('ref') || '').replace(/[^A-Za-z0-9._~-]/g, '').slice(0, 40);
    if (!ref) return;
    const INTERNAL = /^[/#]/;
    const SKIP = /^(\/checkout|\/login|\/register|\/account|\/affiliate|\/access|\/admin|\/api|\/r\/)/;
    const attach = a => {
      if (!a || a.dataset.refBound === '1') return;
      a.dataset.refBound = '1';
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (!INTERNAL.test(href) || SKIP.test(href)) return;
      if (href.includes('ref=') || href.startsWith('#')) return;
      a.setAttribute('href', href + (href.includes('?') ? '&' : '?') + 'ref=' + ref);
    };
    const sweep = () => { document.querySelectorAll('a[href]').forEach(attach); };
    sweep();
    new MutationObserver(() => sweep()).observe(document.body, { childList: true, subtree: true });
  }

  function tidyLegacyTools() {
    // V64 and "Builder 2.0" each injected their own button cluster into the
    // topbar. Everything they offered now lives in the stage toolbar, the left
    // tabs or the command palette, so the duplicates just crowd the bar.
    const style = document.createElement('style');
    style.textContent = `
      .builder-app #builderV64Tools,
      .builder-app #builder2Tools #undo2,
      .builder-app #builder2Tools #addGroupBtn { display: none !important; }
      .builder-app #builder2Tools { margin: 0 2px !important; }
      .builder-app #builder2Tools .selection-chip {
        background: var(--bp-accent-soft) !important;
        border-color: var(--bp-accent-line) !important;
        color: var(--bp-accent) !important;
      }`;
    document.head.appendChild(style);
  }

  /* ======================================================================
     Boot
     ====================================================================== */
  function boot() {
    initTheme();
    initLeftTabs();
    initLibrary();
    initPresets();
    initStageTools();
    initTemplatesV94();
    initAiV94();
    initSubPagesV94();
    initResizers();
    initSaveState();
    initStyleClipboard();
    initKeyboard();
    initMobile();
    tidyLegacyTools();
    installPublicRefGuard();
    updateBreadcrumb();
    setTimeout(fitCanvas, 120);

    let raf = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fitCanvas);
    }, { passive: true });

    document.documentElement.dataset.ravaBuilderPro = 'V90';
    window.__RAVA_BUILDER_PRO__ = {
      openPalette, closePalette, openShortcuts, insertPreset, fitCanvas, setZoom,
      presets: PRESETS, applyTheme
    };
  }

  /* ======================================================================
     8. V94 — Templates gallery, AI assistant, sub-pages manager
     ====================================================================== */
  function normalizeBlocksForRuntime(blocks){
    // Server templates come pre-normalized; give every block a fresh id to avoid collisions.
    const walk = (arr) => (arr||[]).map(b => {
      const copy = { ...b, id: 'el-' + Math.random().toString(36).slice(2, 11) };
      if (Array.isArray(copy.blocks)) copy.blocks = walk(copy.blocks);
      if (Array.isArray(copy.items)) copy.items = copy.items.map(x => (x && typeof x === 'object' && !Array.isArray(x) && x.blocks) ? { ...x, id: x.id || ('el-' + Math.random().toString(36).slice(2,11)), blocks: walk(x.blocks) } : x);
      return copy;
    });
    return walk(blocks);
  }

  /* V118 — تب «تمپلیت» حذف شد (خواستهٔ صریح کاربر). APIهای سرور سرِ جایشان هستند،
     فقط رابط کاربری این تب دیگر ساخته نمی‌شود. */
  function initTemplatesV94(){}

  function initAiV94(){
    const btn = $('#bpAiBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const old = document.getElementById('bpAiModal'); old?.remove();
      const modal = document.createElement('div');
      modal.id='bpAiModal'; modal.style.cssText='position:fixed;inset:0;z-index:400;background:rgba(15,23,42,.42);display:grid;place-items:center;padding:18px';
      modal.innerHTML = `
        <div style="width:min(620px,100%);background:#fff;border-radius:20px;box-shadow:0 30px 90px rgba(15,23,42,.3);overflow:hidden;max-height:88vh;display:flex;flex-direction:column">
          <div style="padding:16px 20px;border-bottom:1px solid #eef1f5;display:flex;align-items:center;justify-content:space-between">
            <div><span class="eyebrow">AI ASSISTANT · V94</span><h3 style="margin:4px 0 0">ساخت و ویرایش صفحه با هوش مصنوعی</h3></div>
            <button type="button" id="bpAiClose" style="border:1px solid #d0d5dd;background:#f8fafc;border-radius:9px;padding:7px 10px;cursor:pointer">×</button>
          </div>
          <div style="padding:16px 20px;display:grid;gap:10px;overflow:auto">
            <div id="bpAiConn" style="border:1px solid #e4e7ec;background:#f8fafc;border-radius:14px;padding:12px;display:grid;gap:8px">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                <b style="font-size:12px;color:#344054">🔌 اتصال هوش مصنوعی</b>
                <span id="bpAiConnState" style="font-size:11px;color:#667085">در حال بررسی…</span>
              </div>
              <div id="bpAiConnOk" hidden style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:#067647">
                <span id="bpAiConnOkText">متصل ✓</span>
                <span style="display:flex;gap:6px"><button type="button" id="bpAiConnModels" style="background:none;border:1px solid #bfd3fb;color:#175CD3;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:11px">تغییر مدل</button><button type="button" id="bpAiConnChange" style="background:none;border:1px solid #bfd3fb;color:#175CD3;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:11px">مدیریت اتصال</button></span>
              </div>
              <div id="bpAiConnForm" hidden style="display:grid;gap:8px">
                <div id="bpAiProvPick" style="display:flex;gap:6px;flex-wrap:wrap"></div>
                <label style="display:grid;gap:4px;font-size:11px;color:#475467">کلید API<input id="bpAiKey" type="password" dir="ltr" placeholder="sk-... / AIza... / sk-or-..." style="font:inherit;padding:9px;border:1px solid #d0d5dd;border-radius:9px" autocomplete="new-password"></label>
                <div id="bpAiAdv" hidden style="display:grid;gap:8px">
                  <label style="display:grid;gap:4px;font-size:11px;color:#475467">Base URL<input id="bpAiBase" dir="ltr" placeholder="خودکار تشخیص داده می‌شود" style="font:inherit;padding:9px;border:1px solid #d0d5dd;border-radius:9px"></label>
                  <label style="display:grid;gap:4px;font-size:11px;color:#475467">مدل (اختیاری — خالی = هوشمند)<input id="bpAiModel" dir="ltr" placeholder="auto" style="font:inherit;padding:9px;border:1px solid #d0d5dd;border-radius:9px"></label>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                  <button type="button" id="bpAiConnTest" style="flex:1;height:38px;background:#175CD3;color:#fff;border:0;border-radius:10px;font-weight:800;cursor:pointer;font-size:12px">اتصال</button>
                  <button type="button" id="bpAiAdvToggle" style="background:none;border:none;color:#667085;font-size:11px;cursor:pointer;text-decoration:underline">تنظیمات پیشرفته</button>
                  <button type="button" id="bpAiConnCancel" style="height:32px;padding:0 12px;background:#fff;color:#344054;border:1px solid #d0d5dd;border-radius:9px;cursor:pointer;font-size:11px">بستن</button>
                </div>
                <div id="bpAiConnMsg" style="font-size:11px;min-height:14px;color:#667085"></div>
              </div>
              <div id="bpAiModelList" hidden style="display:grid;gap:6px;max-height:230px;overflow:auto"></div>
            </div>
            <label style="display:grid;gap:6px;font-size:12px;color:#475467">چه صفحه‌ای برات بسازم؟ (مثلاً: «یک لندینگ برای دوره فتوشاپ با ۳ بخش و دکمه خرید»)
              <textarea id="bpAiPrompt" rows="4" style="font:inherit;padding:11px;border:1px solid #d0d5dd;border-radius:12px" placeholder="مثلاً: یک سفر فروش برای کتاب صوتی…"></textarea>
            </label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" id="bpAiGenerate" class="bp-icon" style="flex:1;height:44px;background:#175CD3;color:#fff;border:0;border-radius:12px;font-weight:800;cursor:pointer">✨ بساز</button>
              <button type="button" id="bpAiEdit" class="bp-icon" style="flex:1;height:44px;background:#eff6ff;color:#175CD3;border:1px solid #bfd3fb;border-radius:12px;font-weight:800;cursor:pointer">✎ بهبود با AI</button>
            </div>
            <label style="display:flex;gap:8px;align-items:center;font-size:12px;color:#475467"><input type="radio" name="bpAiScope" value="section" id="bpAiScopeSection" style="width:15px;height:15px"> فقط بخش انتخاب‌شده را ویرایش کن</label>
            <div id="bpAiModelPick" hidden style="display:grid;gap:8px;border:1px solid #e4e7ec;background:#fbfcff;border-radius:14px;padding:12px">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                <b style="font-size:12px;color:#344054">🧠 مدل متصل</b>
                <span style="display:flex;gap:8px;align-items:center">
                  <button type="button" id="bpAiModelRefresh" style="background:none;border:1px solid #bfd3fb;color:#175CD3;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:11px">به‌روزرسانی لیست</button>
                  <span id="bpAiModelPickState" style="font-size:11px;color:#067647">خودکار</span>
                </span>
              </div>
              <div id="bpAiModelPickList" style="display:flex;gap:6px;flex-wrap:wrap;max-height:210px;overflow:auto"></div>
            </div>
            <label style="display:flex;gap:8px;align-items:center;font-size:12px;color:#475467"><input type="radio" name="bpAiScope" value="page" id="bpAiScopePage" style="width:15px;height:15px" checked> کل صفحه را ویرایش کن / نتیجه را جایگزین کن</label>
            <div id="bpAiStatus" style="font-size:12px;color:#667085;min-height:18px"></div>
            <div id="bpAiPreview" style="display:grid;gap:8px;font-size:12px"></div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelector('#bpAiClose').onclick = () => modal.remove();
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      const status = modal.querySelector('#bpAiStatus');
      const preview = modal.querySelector('#bpAiPreview');
      /* V97 — AI Gateway connect flow inside the popup */
      const connForm = modal.querySelector('#bpAiConnForm');
      const connOk = modal.querySelector('#bpAiConnOk');
      const connState = modal.querySelector('#bpAiConnState');
      const connMsg = modal.querySelector('#bpAiConnMsg');
      const provPick = modal.querySelector('#bpAiProvPick');
      const modelList = modal.querySelector('#bpAiModelList');
      let GATEWAY = null; let pickedProvider = 'gemini'; let aiHas = false; let pickedModel = '';
      const TAG_FA = { fast:'⚡ سریع', general:'● عمومی', reasoning:'🧠 استدلالی', coding:'💻 کدنویسی', vision:'👁 تصویر', json:'{} خروجی JSON', tools:'🛠 ابزار', 'long-context':'📚 متن بلند', free:'رایگان', paid:'پولی' };
      function renderProvPick(){
        if (!GATEWAY) return;
        provPick.innerHTML = GATEWAY.providers.map(p => {
          const active = p.id === pickedProvider;
          const badge = p.connected ? '<span style="color:#067647;font-weight:800">✓</span>' : (p.hasKey ? '<span style="color:#b54708">…</span>' : '');
          return `<button type="button" data-prov="${p.id}" style="flex:1;min-width:96px;height:44px;border-radius:11px;border:1px solid ${active ? '#175CD3' : '#d0d5dd'};background:${active ? '#eff6ff' : '#fff'};color:${active ? '#175CD3' : '#344054'};font-size:11.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;padding:0 6px"><span>${p.icon}</span><span>${p.displayName.split(' ')[0]}</span>${badge}</button>`;
        }).join('');
        provPick.querySelectorAll('[data-prov]').forEach(b => b.onclick = () => { pickedProvider = b.dataset.prov; modal.querySelector('#bpAiKey').value=''; renderProvPick(); });
      }
      function renderModelList(models, current){
        if (!models || !models.length) { modelList.hidden = true; return; }
        modelList.hidden = false;
        modelList.innerHTML = `<div style="font-size:11px;color:#475467;font-weight:700">مدل‌های در دسترس این کلید (${models.length}):</div>` + models.slice(0, 30).map(m => {
          const tags = (m.tags || []).slice(0, 4).map(t => `<span style="background:#eef4ff;color:#175CD3;border-radius:999px;padding:2px 8px;font-size:10px">${TAG_FA[t] || t}</span>`).join(' ');
          const free = (m.tags || []).includes('free') ? '<span style="background:#ecfdf3;color:#067647;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:800">FREE</span>' : '';
          const active = m.id === current;
          return `<button type="button" data-model="${String(m.id).replace(/"/g,'&quot;')}" style="text-align:right;border:1px solid ${active ? '#175CD3' : '#eef1f5'};background:${active ? '#eff6ff' : '#fff'};border-radius:11px;padding:9px 11px;cursor:pointer;display:grid;gap:4px"><b style="font-size:11.5px;color:#101828">${String(m.label || m.id).slice(0, 46)}</b><span style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">${tags} ${free}</span><span dir="ltr" style="font-size:9.5px;color:#98a2b3">${String(m.id).slice(0, 52)}</span></button>`;
        }).join('') + (models.length > 30 ? `<div style="font-size:10px;color:#98a2b3">… و ${models.length - 30} مدل دیگر</div>` : '');
        modelList.querySelectorAll('[data-model]').forEach(b => b.onclick = async () => {
          pickedModel = b.dataset.model;
          const r = await fetch('/api/ai/config', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ primary: pickedProvider, model: pickedModel }) });
          const o = await r.json();
          if (o.ok) { renderModelList(models, pickedModel); connState.textContent = 'متصل ✓ ' + pickedModel.split('/').pop(); }
        });
      }
      /* V99 — connected-model picker shown inside the prompt area. When a
         provider is already connected (page load or right after connect), the
         available models become selectable chips; the pinned one is highlighted.
         Generating sends the picked model as an exact request ("خودکار" keeps
         the gateway's smart routing). */
      const pickBox = modal.querySelector('#bpAiModelPick');
      const pickList = modal.querySelector('#bpAiModelPickList');
      const pickState = modal.querySelector('#bpAiModelPickState');
      const pickRefresh = modal.querySelector('#bpAiModelRefresh');
      const TASK = 'page_generation';
      let pinnedTaskModel = '';
      let cachedPickModels = null;
      function renderModelPick(models, pinned){
        if (!models || !models.length) { pickBox.hidden = true; return; }
        cachedPickModels = models;
        pickBox.hidden = false;
        const label = m => String(m.label || m.id).slice(0, 40);
        pickList.innerHTML = [{ id: '', label: 'خودکار (هوشمند)' }].concat(models.slice(0, 24)).map(m => {
          const active = (m.id || '') === (pinned || '');
          const tags = (m.tags || []).slice(0, 2).map(t => TAG_FA[t] || t).join(' · ');
          return `<button type="button" data-mpick="${String(m.id || '').replace(/"/g,'&quot;')}" title="${String(m.id || 'auto').replace(/"/g,'&quot;')}" style="min-height:36px;padding:6px 12px;border-radius:10px;border:1px solid ${active ? '#175CD3' : '#d0d5dd'};background:${active ? '#eff6ff' : '#fff'};color:${active ? '#175CD3' : '#344054'};font-size:11px;font-weight:700;cursor:pointer;display:grid;gap:1px;text-align:right"><span>${m.id ? label(m) : m.label}</span>${tags ? `<span style="font-size:9px;color:#98a2b3;font-weight:500">${tags}</span>` : ''}</button>`;
        }).join('');
        pickState.textContent = pinned ? 'انتخاب‌شده: ' + String(pinned).split('/').pop().slice(0, 22) : 'خودکار';
        pickState.style.color = pinned ? '#175CD3' : '#067647';
        pickList.querySelectorAll('[data-mpick]').forEach(b => b.onclick = () => { pinnedTaskModel = b.dataset.mpick; renderModelPick(cachedPickModels, pinnedTaskModel); });
      }
      async function loadPickModels(refresh){
        if (!pickedProvider) return;
        pickState.textContent = 'در حال دریافت…'; pickState.style.color = '#667085';
        try {
          const r = await fetch('/api/ai/models', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ provider: pickedProvider, refresh: !!refresh }) });
          const o = await r.json();
          if (o.ok && o.models && o.models.length) { renderModelPick(o.models, pinnedTaskModel); }
          else { pickBox.hidden = true; }
        } catch { pickBox.hidden = true; }
      }
      pickRefresh.onclick = () => loadPickModels(true);
      function revealModelPick(){
        if (!aiHas) { pickBox.hidden = true; return; }
        if (cachedPickModels && cachedPickModels.length) { renderModelPick(cachedPickModels, pinnedTaskModel); return; }
        const conn = GATEWAY && (GATEWAY.providers || []).find(p => p.connected);
        if (GATEWAY && Array.isArray(GATEWAY.taskModel)) pinnedTaskModel = '';
        if (GATEWAY && GATEWAY.taskModel && typeof GATEWAY.taskModel === 'object') pinnedTaskModel = String(GATEWAY.taskModel[TASK] || '');
        loadPickModels(false);
      }
      function showConn(open){
        connOk.hidden = !(aiHas && !open);
        connForm.hidden = !open;
        modelList.hidden = open ? modelList.hidden : true;
        connState.textContent = aiHas && !open ? 'متصل ✓' : 'وصل نیست';
        connState.style.color = aiHas && !open ? '#067647' : '#b54708';
        if (aiHas && !open) connState.textContent = 'متصل ✓' + (GATEWAY && GATEWAY.primary ? '' : '');
      }
      function openConn(){ modal.querySelector('#bpAiAdv').hidden = true; showConn(true); }
      modal.querySelector('#bpAiAdvToggle').onclick = () => { const a = modal.querySelector('#bpAiAdv'); a.hidden = !a.hidden; };
      modal.querySelector('#bpAiConnChange').onclick = () => { modal.querySelector('#bpAiKey').value=''; connMsg.textContent=''; showConn(true); };
      modal.querySelector('#bpAiConnCancel').onclick = () => showConn(false);
      modal.querySelector('#bpAiConnModels').onclick = async () => {
        connMsg.textContent = 'در حال دریافت مدل‌ها…'; connMsg.style.color = '#667085';
        const r = await fetch('/api/ai/models', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ provider: pickedProvider, refresh: true }) });
        const o = await r.json();
        if (o.ok && o.models && o.models.length) { connMsg.textContent=''; showConn(true); renderModelList(o.models, pickedModel); connForm.hidden = true; }
        else connMsg.textContent = (o.error && (o.error.friendly || o.error)) || 'مدلی پیدا نشد';
      };
      modal.querySelector('#bpAiConnTest').onclick = async () => {
        const b = modal.querySelector('#bpAiConnTest'); b.disabled = true;
        connMsg.textContent = 'در حال اتصال و کشف مدل‌ها…'; connMsg.style.color = '#667085';
        try {
          const r = await fetch('/api/ai/connect', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ provider: pickedProvider, apiKey: modal.querySelector('#bpAiKey').value.trim(), baseUrl: modal.querySelector('#bpAiBase').value.trim(), model: modal.querySelector('#bpAiModel').value.trim() }) });
          const o = await r.json();
          if (!o.ok) throw new Error(o.error || 'خطا');
          if (o.connected) {
            GATEWAY = o.ai; aiHas = true; renderProvPick();
            const p = (o.ai.providers || []).find(x => x.id === pickedProvider);
            pickedModel = p ? p.model : '';
            connMsg.innerHTML = `<span style="color:#067647;font-weight:700">اتصال موفق ✓</span> ${o.result.model ? 'مدل: <b dir="ltr">' + o.result.model + '</b>' : ''} ${o.result.latencyMs ? '— ' + o.result.latencyMs + 'ms' : ''} ${o.result.modelsCount ? '— ' + o.result.modelsCount + ' مدل کشف شد' : ''}`;
            setTimeout(() => { connMsg.textContent=''; showConn(false); revealModelPick(); }, 1400);
          } else {
            aiHas = false;
            const e = o.result && o.result.error ? o.result.error : o.error || {};
            connMsg.innerHTML = `<span style="color:#b42318;font-weight:700">${e.friendly || e.friendly === '' ? (e.friendly || 'اتصال ناموفق') : 'اتصال ناموفق'}</span>${e.detail ? '<div dir="ltr" style="margin-top:3px;font-size:10px;color:#98a2b3">' + String(e.detail).slice(0, 160) + '</div>' : ''}${e.fix ? '' : ''}`;
          }
        } catch (err) { connMsg.textContent = 'خطا: ' + err.message; connMsg.style.color = '#b42318'; }
        finally { b.disabled = false; }
      };
      fetch('/api/ai/status').then(r => r.json()).then(o => {
        if (o.ok && o.ai) {
          GATEWAY = o.ai;
          const conn = (o.ai.providers || []).find(p => p.connected);
          pickedProvider = conn ? conn.id : 'gemini';
          aiHas = !!(conn && o.ai.enabled !== false);
          if (conn) pickedModel = conn.model || '';
          renderProvPick();
        }
        showConn(!aiHas);
        if (aiHas) revealModelPick();
      }).catch(() => { showConn(true); renderProvPick(); });
      async function runAi(mode){
        if (!aiHas) { status.textContent = 'اول هوش مصنوعی را وصل کن ↓'; status.style.color = '#b54708'; openConn(); return; }
        const prompt = modal.querySelector('#bpAiPrompt').value.trim();
        if (!prompt) { status.textContent = 'اول بنویس چه می‌خواهی.'; return; }
        const scopeSection = modal.querySelector('#bpAiScopeSection')?.checked;
        const selected = api.getSelected ? api.getSelected() : null;
        if (scopeSection && mode==='edit' && !(selected && ['section','group'].includes(selected.type))) { status.textContent = 'اول یک بخش (Section) روی بوم انتخاب کن.'; status.style.color='#b54708'; return; }
        const btnGen = modal.querySelector(mode==='edit' ? '#bpAiEdit' : '#bpAiGenerate');
        btnGen.disabled = true; status.textContent = 'در حال فکر کردن… 🤖 (' + (GATEWAY && GATEWAY.primary ? GATEWAY.primary : '') + (pickedModel ? ' · ' + pickedModel.split('/').pop() : '') + ')'; status.style.color=''; preview.innerHTML = '';
        try {
          const body = { prompt, mode, task: mode==='edit' ? (scopeSection ? 'section_generation' : 'page_generation') : 'page_generation' };
          if (pickedModel) body.model = pickedModel;            // explicit provider default
          if (pinnedTaskModel) body.model = pinnedTaskModel;    // picked chip wins
          if (mode==='edit') body.currentBlocks = scopeSection && selected ? [{ ...selected, blocks: selected.blocks }] : api.getState().blocks;
          const res = await fetch('/api/ai/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
          const out = await res.json();
          if (!out.ok) {
            if (/تنظیم نشده/.test(out.error || '')) { aiHas = false; showConn(true); throw new Error('کلید API وصل نیست — از کادر بالا وصلش کن.'); }
            throw new Error(out.error || 'خطا');
          }
          const blocks = out.blocks || [];
          preview.innerHTML = `<b style="color:#067647">✓ ${blocks.length} بلوک از AI رسید:</b>` + blocks.slice(0,10).map(b => `<div style="padding:7px 10px;background:#f8fafc;border-radius:9px">${b.type}${b.text ? ' — ' + String(b.text).slice(0,60) : b.label ? ' — ' + String(b.label).slice(0,40) : ''}</div>`).join('') + (blocks.length > 10 ? `<div>… و ${blocks.length - 10} بلوک دیگر</div>` : '');
          const applyBtn = document.createElement('button');
          applyBtn.type='button'; applyBtn.textContent = scopeSection && mode==='edit' ? 'جایگزینی همین بخش' : 'اعمال روی صفحه';
          applyBtn.style.cssText = 'margin-top:6px;height:44px;background:#175CD3;color:#fff;border:0;border-radius:12px;font-weight:800;cursor:pointer';
          applyBtn.onclick = () => {
            const st = api.getState();
            const clean = normalizeBlocksForRuntime(blocks);
            if (scopeSection && mode==='edit' && selected) {
              const target = st.blocks.find(b => b.id === selected.id);
              if (target && ['section','group'].includes(target.type)) { target.blocks = clean; }
              else { st.blocks.push(...clean); }
            } else if (mode==='edit') {
              st.blocks = clean;
            } else {
              st.blocks.push(...clean);
            }
            api.snapshot(); api.renderAll(); api.save(); modal.remove();
            toast('خروجی AI اعمال شد — الان می‌توانی ویرایشش کنی');
          };
          preview.appendChild(applyBtn);
          status.textContent = 'آماده اعمال است.';
        } catch (err) {
          status.textContent = 'خطا: ' + err.message; status.style.color = '#b42318';
        } finally { btnGen.disabled = false; }
      }
      modal.querySelector('#bpAiGenerate').onclick = () => runAi('generate');
      modal.querySelector('#bpAiEdit').onclick = () => runAi('edit');
    });
  }

  /* V99 — Sub-page manager, rebuilt: a large floating button on the stage and
     a real editor for each sub-page (title, path, ordered content blocks:
     heading / rich text / list / button) with duplicate & delete, copyable URL
     and explicit save. The V94 topbar button now opens the same manager. */
  function initSubPagesV94(){
    if (window.BUILDER_KIND !== 'product') return;
    const stage = $('.builder-stage') || $('.builder-layout');
    if (stage && !stage.querySelector('.bp-sub-fab')) {
      const fab = document.createElement('button');
      fab.type = 'button'; fab.className = 'bp-sub-fab'; fab.id = 'bpSubFab';
      fab.title = 'مدیریت زیرصفحه‌های محصول';
      const st0 = api.getState();
      const n0 = Array.isArray(st0.subPages) ? st0.subPages.length : 0;
      fab.innerHTML = `⑂ <span class="bp-sub-fab__label">زیرصفحه‌ها</span><span class="bp-sub-fab__count">${n0}</span>`;
      stage.appendChild(fab);
      fab.addEventListener('click', openSubPagesManager);
      $('#bpSubPagesBtn')?.addEventListener('click', openSubPagesManager);
    }
  }

  function openSubPagesManager(){
    const st = api.getState();
    st.subPages = Array.isArray(st.subPages) ? st.subPages : [];
    document.getElementById('bpSubModal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'bpSubModal';
    modal.className = 'bp-sub-modal';
    const escAttr = s => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const uid = () => 'el-' + Math.random().toString(36).slice(2, 11);
    const TYPE_FA = { heading: 'تیتر', text: 'متن', list: 'لیست', button: 'دکمه' };
    const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    function blockEditorHtml(sp, i, type, b, bi){
      if (type === 'heading') return `<div class="bp-sub-block" data-bi="${bi}"><div class="bp-sub-block__head"><span class="bp-sub-block__type">تیتر</span><span><button type="button" class="bp-sub-icon-btn" data-blk-up="${bi}" title="بالا">↑</button><button type="button" class="bp-sub-icon-btn" data-blk-down="${bi}" title="پایین">↓</button><button type="button" class="bp-sub-icon-btn bp-sub-del" data-blk-del="${bi}" title="حذف">×</button></span></div><input type="text" data-blk-text="${bi}" value="${escAttr(b.text || '')}" placeholder="متن تیتر"><div class="bp-sub-2col"><input type="text" inputmode="decimal" data-blk-field="${bi}.size" value="${escAttr(b.size ?? 34)}" placeholder="اندازه ۳۴"><input type="text" inputmode="decimal" data-blk-field="${bi}.weight" value="${escAttr(b.weight ?? 850)}" placeholder="وزن ۸۵۰"></div></div>`;
      if (type === 'text') return `<div class="bp-sub-block" data-bi="${bi}"><div class="bp-sub-block__head"><span class="bp-sub-block__type">متن</span><span><button type="button" class="bp-sub-icon-btn" data-blk-up="${bi}" title="بالا">↑</button><button type="button" class="bp-sub-icon-btn" data-blk-down="${bi}" title="پایین">↓</button><button type="button" class="bp-sub-icon-btn bp-sub-del" data-blk-del="${bi}" title="حذف">×</button></span></div><textarea data-blk-text="${bi}" placeholder="متن پاراگراف">${escHtml(b.text || '')}</textarea><div class="bp-sub-2col"><input type="text" inputmode="decimal" data-blk-field="${bi}.size" value="${escAttr(b.size ?? 17)}" placeholder="اندازه ۱۷"><input type="text" inputmode="decimal" data-blk-field="${bi}.line" value="${escAttr(b.line ?? 1.9)}" placeholder="فاصله خطوط ۱.۹"></div></div>`;
      if (type === 'list') return `<div class="bp-sub-block" data-bi="${bi}"><div class="bp-sub-block__head"><span class="bp-sub-block__type">لیست</span><span><button type="button" class="bp-sub-icon-btn" data-blk-up="${bi}" title="بالا">↑</button><button type="button" class="bp-sub-icon-btn" data-blk-down="${bi}" title="پایین">↓</button><button type="button" class="bp-sub-icon-btn bp-sub-del" data-blk-del="${bi}" title="حذف">×</button></span></div><textarea data-blk-text="${bi}" placeholder="هر خط یک آیتم">${escHtml((b.items || []).join('\n'))}</textarea><div class="bp-sub-2col"><input type="text" data-blk-field="${bi}.icon" value="${escAttr(b.icon || '✓')}" placeholder="آیکون ✓"><input type="text" data-blk-color="${bi}" value="${escAttr(b.iconColor || b.color || '#175CD3')}" placeholder="رنگ #175CD3"></div></div>`;
      /* button */
      return `<div class="bp-sub-block" data-bi="${bi}"><div class="bp-sub-block__head"><span class="bp-sub-block__type">دکمه</span><span><button type="button" class="bp-sub-icon-btn" data-blk-up="${bi}" title="بالا">↑</button><button type="button" class="bp-sub-icon-btn" data-blk-down="${bi}" title="پایین">↓</button><button type="button" class="bp-sub-icon-btn bp-sub-del" data-blk-del="${bi}" title="حذف">×</button></span></div><input type="text" data-blk-label="${bi}" value="${escAttr(b.label || 'خرید محصول')}" placeholder="متن دکمه"><div class="bp-sub-2col"><input type="text" dir="ltr" data-blk-url="${bi}" value="${escAttr(b.url || '#buy')}" placeholder="#buy یا /product/..."><input type="text" data-blk-color="${bi}" value="${escAttr(b.bg || '#175CD3')}" placeholder="رنگ #175CD3"></div></div>`;
    }
    function render(){
      /* V106 — redesigned per design 16: hero "ساخت با بیلدر", pill action rows,
         footer = افزودن (ghost) + ذخیره (primary). Full editing lives in the builder. */
      modal.innerHTML = `
        <div class="bp-sub-sheet">
          <div class="bp-sub-head">
            <div class="bp-sub-head__txt">
              <span class="bp-sub-crumb">SUB-PAGES <i>›</i> افزودن</span>
              <h3>زیرصفحه‌های محصول</h3>
              <p>می‌توانید زیرصفحه‌های دلخواه برای این محصول ایجاد کنید. زیرصفحه‌ها به شما امکان می‌دهند محتوای بیشتری مثل جزئیات، ویدیوها، وبینارها یا بخش‌های اختصاصی را برای کاربران نمایش دهید.</p>
            </div>
            <button type="button" id="bpSubClose" class="bp-sub-close" title="بستن">×</button>
          </div>
          <div class="bp-sub-body">
            <button type="button" id="bpSubBuild" class="bp-sub-hero" title="ساخت زیرصفحه و باز شدن بیلدر">
              <span class="bp-sub-hero__icon">✎</span>
              <strong>ساخت زیرصفحه با بیلدر</strong>
              <small>با استفاده از بیلدر، زیرصفحه خود را بصورت دلخواه طراحی کنید.</small>
            </button>
            <div class="bp-sub-label">زیرصفحه‌های فعلی</div>
            ${st.subPages.length ? st.subPages.map((sp, i) => `
              <div class="bp-sub-rowcard ${sp.__open ? 'is-open' : ''}" data-sp="${i}">
                <div class="bp-sub-rowcard__top">
                  <strong class="bp-sub-rowcard__title">${escHtml(sp.title || 'زیرصفحه')}</strong>
                  <span class="bp-sub-rowcard__pills">
                    <a class="bp-pill" href="/admin/builder/product/${escHtml(window.BUILDER_INDEX ?? '')}?sub=${encodeURIComponent(sp.path||'')}" target="_blank" rel="noopener" title="ویرایش در بیلدر">✎ ویرایش در بیلدر</a>
                    <a class="bp-pill" href="/product/${escHtml(st.slug || '')}/${escHtml(sp.path || '')}" target="_blank" rel="noopener" title="پیش‌نمایش زیرصفحه">👁 پیش‌نمایش</a>
                    <button type="button" class="bp-pill" data-sp-dup="${i}" title="کپی زیرصفحه">⧉ کپی</button>
                    <button type="button" class="bp-pill bp-pill--danger" data-sp-del="${i}" title="حذف زیرصفحه">🗑 حذف</button>
                    <button type="button" class="bp-sub-rowcard__chev ${sp.__open ? 'is-open' : ''}" data-sp-toggle="${i}" title="تغییر نام و مسیر">⌄</button>
                  </span>
                </div>
                ${sp.__open ? `
                <div class="bp-sub-rowcard__editor">
                  <div class="bp-sub-grid">
                    <label class="bp-sub-field">عنوان زیرصفحه<input type="text" data-sp-title="${i}" value="${escAttr(sp.title || '')}" placeholder="مثلاً توضیحات قبل از خرید"></label>
                    <label class="bp-sub-field">مسیر (path)<input type="text" dir="ltr" data-sp-path="${i}" value="${escAttr(sp.path || '')}" placeholder="details" required><small dir="ltr">/product/${escHtml(st.slug || 'product')}/${escHtml(sp.path || '…')}</small></label>
                  </div>
                  <div class="bp-sub-url" data-sp-copy="${i}" title="کپی آدرس صفحه" dir="ltr">${escHtml(location.origin)}/product/${escHtml(st.slug || 'product')}/${escHtml(sp.path || '')}</div>
                  <div class="helper">محتوا و بلوک‌ها را در «بیلدر کامل» همین زیرصفحه طراحی کن — همهٔ عناصر کتابخانه آنجاست.</div>
                </div>` : ''}
              </div>`).join('') : '<div class="bp-sub-empty">هنوز زیرصفحه‌ای نساخته‌ای — از دکمهٔ بالای صفحه شروع کن.</div>'}
          </div>
          <div class="bp-sub-foot">
            <button type="button" id="bpSubAdd" class="bp-sub-add">افزودن</button>
            <span class="bp-sub-foot-actions"><span id="bpSubMsg" class="bp-sub-msg"></span><button type="button" id="bpSubSave" class="bp-sub-save">ذخیره</button></span>
          </div>
        </div>`;
      bind();
    }
    function readEditorState(){
      modal.querySelectorAll('[data-sp-title]').forEach(inp => { st.subPages[Number(inp.dataset.spTitle)].title = inp.value; });
      modal.querySelectorAll('[data-sp-path]').forEach(inp => { st.subPages[Number(inp.dataset.spPath)].path = String(inp.value).trim().replace(/^\/+/, '').replace(/[^a-zA-Z0-9\/_-]/g, ''); });
      modal.querySelectorAll('[data-blk-text]').forEach(t => { const sp = t.closest('[data-sp]'); const bi = Number(t.dataset.blkText); const blk = st.subPages[Number(sp.dataset.sp)].blocks[bi]; const val = t.value; if (blk.type === 'list') blk.items = val.split('\n').map(x => x.trim()).filter(Boolean); else blk.text = val; });
      modal.querySelectorAll('[data-blk-label]').forEach(t => { const sp = t.closest('[data-sp]'); st.subPages[Number(sp.dataset.sp)].blocks[Number(t.dataset.blkLabel)].label = t.value; });
      modal.querySelectorAll('[data-blk-url]').forEach(t => { const sp = t.closest('[data-sp]'); st.subPages[Number(sp.dataset.sp)].blocks[Number(t.dataset.blkUrl)].url = t.value.trim(); });
      modal.querySelectorAll('[data-blk-color]').forEach(t => { const sp = t.closest('[data-sp]'); const blk = st.subPages[Number(sp.dataset.sp)].blocks[Number(t.dataset.blkColor)]; if (blk.type === 'list') blk.iconColor = t.value.trim(); else blk.bg = t.value.trim(); });
      modal.querySelectorAll('[data-blk-field]').forEach(t => { const sp = t.closest('[data-sp]'); const [biS, key] = String(t.dataset.blkField).split('.'); const blk = st.subPages[Number(sp.dataset.sp)].blocks[Number(biS)]; const num = Number(t.value); if (Number.isFinite(num)) blk[key] = num; });
    }
    function bind(){
      modal.querySelector('#bpSubClose').onclick = () => { modal.remove(); };
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      modal.querySelector('#bpSubBuild').onclick = async () => {
        readEditorState();
        const path = 'details' + (st.subPages.length ? '-' + (st.subPages.length + 1) : '');
        st.subPages.push({ title: 'زیرصفحه', path, blocks: [] });
        try { await api.save(); } catch (e) { /* ذخیرهٔ محلی هم کافی است */ }
        window.open('/admin/builder/product/' + (window.BUILDER_INDEX ?? '') + '?sub=' + encodeURIComponent(path), '_blank');
        render();
      };
      modal.querySelector('#bpSubAdd').onclick = () => {
        readEditorState();
        const path = 'details' + (st.subPages.length ? '-' + (st.subPages.length + 1) : '');
        st.subPages.push({ title: 'زیرصفحه', path, blocks: [] });
        st.subPages.forEach(s => { s.__open = false; });
        st.subPages[st.subPages.length - 1].__open = true;
        render();
      };
      modal.querySelectorAll('[data-sp-toggle]').forEach(b => b.onclick = () => {
        readEditorState();
        const i = Number(b.dataset.spToggle);
        st.subPages.forEach((s, j) => { s.__open = j === i ? !s.__open : false; });
        render();
      });
      modal.querySelectorAll('[data-sp-copy]').forEach(el => el.onclick = async () => {
        try { await navigator.clipboard.writeText(el.textContent.trim()); el.classList.add('is-copied'); el.textContent = 'کپی شد ✓'; setTimeout(render, 900); } catch { toast('آدرس: ' + el.textContent.trim()); }
      });
      modal.querySelectorAll('[data-sp-addblk]').forEach(b => b.onclick = () => {
        readEditorState();
        const [iS, type] = String(b.dataset.spAddblk).split(':');
        const sp = st.subPages[Number(iS)];
        const mk = { heading: () => ({ id: uid(), type: 'heading', text: 'تیتر جدید', tag: 'h3', size: 26, weight: 850, align: 'center' }), text: () => ({ id: uid(), type: 'text', text: 'متن جدید…', size: 16, line: 1.9, align: 'right', color: '#475467' }), list: () => ({ id: uid(), type: 'list', icon: '✓', iconColor: '#175CD3', items: ['آیتم اول', 'آیتم دوم'] }), button: () => ({ id: uid(), type: 'button', label: 'خرید محصول', url: '#buy', bg: '#175CD3', fg: '#FFFFFF', radius: 12, padX: 22, padY: 12, size: 15, weight: 800, align: 'center' }) };
        sp.blocks.push(mk[type]());
        render();
      });
      modal.querySelectorAll('[data-blk-up]').forEach(b => b.onclick = () => { readEditorState(); const spEl = b.closest('[data-sp]'); const sp = st.subPages[Number(spEl.dataset.sp)]; const i = Number(b.dataset.blkUp); if (i > 0) { const [x] = sp.blocks.splice(i, 1); sp.blocks.splice(i - 1, 0, x); render(); } });
      modal.querySelectorAll('[data-blk-down]').forEach(b => b.onclick = () => { readEditorState(); const spEl = b.closest('[data-sp]'); const sp = st.subPages[Number(spEl.dataset.sp)]; const i = Number(b.dataset.blkDown); if (i < sp.blocks.length - 1) { const [x] = sp.blocks.splice(i, 1); sp.blocks.splice(i + 1, 0, x); render(); } });
      modal.querySelectorAll('[data-blk-del]').forEach(b => b.onclick = () => { readEditorState(); const spEl = b.closest('[data-sp]'); const sp = st.subPages[Number(spEl.dataset.sp)]; sp.blocks.splice(Number(b.dataset.blkDel), 1); render(); });
      modal.querySelectorAll('[data-sp-dup]').forEach(b => b.onclick = () => {
        readEditorState();
        const i = Number(b.dataset.spDup); const src = st.subPages[i];
        const copy = JSON.parse(JSON.stringify(src));
        copy.title = (src.title || 'زیرصفحه') + ' (کپی)';
        copy.path = (src.path || 'details') + '-copy';
        const reid = arr => (arr || []).map(x => ({ ...x, id: uid() }));
        copy.blocks = reid(src.blocks);
        st.subPages.splice(i + 1, 0, copy);
        render();
      });
      modal.querySelectorAll('[data-sp-del]').forEach(b => b.onclick = () => {
        const i = Number(b.dataset.spDel);
        if (!confirm('این زیرصفحه و محتوایش حذف شود؟')) return;
        st.subPages.splice(i, 1);
        render();
      });
      modal.querySelector('#bpSubSave').onclick = async () => {
        readEditorState();
        st.subPages.forEach(s => { delete s.__open; });
        const paths = st.subPages.map(s => String(s.path || '').trim().toLowerCase()).filter(Boolean);
        const dup = paths.find((p, i) => paths.indexOf(p) !== i);
        const msg = modal.querySelector('#bpSubMsg');
        if (dup) { msg.textContent = 'مسیر تکراری: ' + dup; msg.className = 'bp-sub-msg is-err'; return; }
        const btn = modal.querySelector('#bpSubSave'); btn.dataset.busy = '1';
        try {
          await api.save();
          const fab = document.getElementById('bpSubFab');
          if (fab) { const c = fab.querySelector('.bp-sub-fab__count'); if (c) c.textContent = st.subPages.length; }
          msg.textContent = 'ذخیره شد ✓'; msg.className = 'bp-sub-msg is-ok';
          setTimeout(() => modal.remove(), 700);
        } catch (e) { msg.textContent = 'خطا در ذخیره: ' + (e && e.message || e); msg.className = 'bp-sub-msg is-err'; }
        finally { delete btn.dataset.busy; }
      };
    }
    render();
    document.body.appendChild(modal);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
