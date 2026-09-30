/* ============================================================
   WIDGET RENDERER — the ONE renderer for builder blocks.
   Used by:
   - server.js renderBlocks (the published landing page)
   - builder.js editor canvas (renderNodePreview delegation)
   - builder.js preview mode (was renderPublicBlock)
   so what you see in the Builder is byte-for-byte the same
   markup engine that publishes the real page.

   Environments inject their own helpers via createWidgetRenderer(helpers, opts):
   - server: image optimization, dynamic products/posts, marquee engines, raw HTML
   - builder: sanitization, static data previews, device-aware filtering
   ============================================================ */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WidgetRenderer = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  /* ---------- tiny shared utils ---------- */
  const E = (v = '') => String(v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const nn = (x, f = 0) => { const v = Number(x); return Number.isFinite(v) ? v : f; };
  const clampPct = (x, f = 100) => Math.max(0, Math.min(100, nn(x, f)));

  const ALIGN_MAP = { left: 'left', center: 'center', right: 'right', start: 'start', end: 'end', justify: 'justify' };
  const JUSTIFY_MAP = { left: 'flex-start', start: 'flex-start', center: 'center', right: 'flex-end', end: 'flex-end' };
  const SHADOW = { none: 'none', sm: '0 4px 12px rgba(16,24,40,.08)', md: '0 14px 36px rgba(16,24,40,.12)', lg: '0 24px 60px rgba(16,24,40,.16)', xl: '0 30px 90px rgba(16,24,40,.20)' };

  /* V147 — full bleed measures the page query container (`ravapage`). On the
     live site that is <body> (no padding) so the extra term is 0. The editor
     canvas is a padded query container, so it publishes its gutter through
     --rv-cq-extra and the preview escapes to the real screen edges too. */
  const RAVA_BLEED_CSS = 'width:100%;max-width:none;width:calc(100cqw + var(--rv-cq-extra,0px));max-width:calc(100cqw + var(--rv-cq-extra,0px));margin-left:calc(50% - 50cqw - var(--rv-cq-extra,0px) / 2);margin-right:calc(50% - 50cqw - var(--rv-cq-extra,0px) / 2);border-radius:0;';
  /* V147 — one width model for every element (Carrd-style):
       pct  → a percentage of the parent's content box (5–99)
       max  → 100% of the parent's content box
       edge → escapes the parent's padding and touches the parent's edges
       bleed→ spans the whole page/screen width
     Legacy data (edgeToEdge / fullBleed booleans, no widthMode) keeps its old
     meaning: either flag = full bleed. */
  const WIDTH_MODES = { pct: 1, max: 1, edge: 1, bleed: 1 };
  function widthModeOf(b) {
    if (!b) return 'max';
    const m = b.widthMode;
    const pct = clampPct(b.desktopWidth ?? b.maxWidth, 100);
    if (WIDTH_MODES[m]) return (m === 'pct' && pct >= 100) ? 'max' : (m === 'max' && pct < 100 ? 'pct' : m);
    if (b.fullBleed || b.edgeToEdge) return 'bleed';
    return pct < 100 ? 'pct' : 'max';
  }
  /* Box position (where the element sits when it is narrower than its parent).
     boxAlign wins; otherwise the legacy `align` keeps driving it. */
  function boxAlignOf(b, def) {
    const v = b && (b.boxAlign || b.align);
    return v === 'left' || v === 'center' || v === 'right' ? v : def;
  }
  const EDGE_CSS = 'width:auto;max-width:none;margin-left:calc(-1 * var(--rv-pl,0px));margin-right:calc(-1 * var(--rv-pr,0px));';
  /* legacy per-type width keys → the shared maxWidth (section/columns kept their
     own `width`, single images an inner `width`). Pure read-side mapping. */
  function legacyWidth(b) {
    if (!b || typeof b !== 'object') return b;
    if ((b.type === 'section' || b.type === 'columns' || (b.type === 'image' && (b.imageMode || 'single') === 'single')) && nn(b.width, 100) < 100 && clampPct(b.maxWidth, 100) >= 100 && !b.widthMode) {
      return Object.assign({}, b, { maxWidth: clampPct(b.width, 100), width: 100 });
    }
    return b;
  }

  /* ---------- V134 — clean stroke SVG icon set (replaces raw emoji glyphs) ----------
     stroke=currentColor so every icon inherits the surrounding text color. */
  const SHELL_ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.47 1.18h7.9a1.5 1.5 0 0 0 1.46-1.14L20 8H6"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".9" fill="currentColor" stroke="none"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 4-3 15.5-6-4.5-3 3-1-5L21 4Z"/><path d="m21 4-12 11"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="m10.5 9.5 5 2.5-5 2.5v-5Z"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8 10.5V17M8 7.6v.1M12 17v-4a2.4 2.4 0 0 1 4.8 0v4"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4l16 16M20 4 4 20"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.4-1.1A8.5 8.5 0 1 0 12 3.5Z"/><path d="M9 9.5c.5 2.5 3 5 5.5 5.5l1-1.5-2-1-1 .5c-.8-.5-1.5-1.2-2-2l.5-1-1-2-1 1.5Z"/></svg>',
    email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/></svg>'
  };
  /* Resolve an item icon: emoji/char if it's a short glyph, named SVG if it matches
     a known network (EN or FA labels), else the raw glyph as-is. */
  function shellIcon(name, fallback) {
    const s = String(name || '').trim();
    if (!s) return fallback || '';
    const k = s.toLowerCase();
    const map = { instagram: 'instagram', 'اینستاگرام': 'instagram', insta: 'instagram', telegram: 'telegram', 'تلگرام': 'telegram', youtube: 'youtube', 'یوتیوب': 'youtube', linkedin: 'linkedin', 'لینکدین': 'linkedin', x: 'x', twitter: 'x', 'توییتر': 'x', whatsapp: 'whatsapp', 'واتساپ': 'whatsapp', email: 'email', mail: 'email', 'ایمیل': 'email', phone: 'phone', tel: 'phone', 'تلفن': 'phone' };
    if (map[k] && SHELL_ICONS[map[k]]) return SHELL_ICONS[map[k]];
    /* V134.1 — گلیف‌های خام پیش‌فرض نسخه‌های قبلی (ذخیره‌شده در داده) هم به SVG تمیز مپ می‌شوند */
    const glyphMap = { '◎': 'instagram', '✈': 'telegram', '➤': 'telegram', '▶': 'youtube', '✉': 'email', '☎': 'phone', '✆': 'phone', '𝕏': 'x' };
    if (glyphMap[s] && SHELL_ICONS[glyphMap[s]]) return SHELL_ICONS[glyphMap[s]];
    return E(s);
  };

  /* ---------- background (ported verbatim from server bgStyle) ---------- */
  /* V129 — landing pattern library: the ONE source both the editor canvas and the
     published page render from. A landing stores only backgroundPatternId + its
     params (color/size/opacity); this module turns them into CSS layers.
     Each pattern carries its own default opacity + blend so it looks right out
     of the box (a grid needs far less opacity than a soft grain). */
  const svgTile = (w, h, inner) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>${inner}</svg>`)}`;
  const PATTERNS = {
    /* — tiled line/pattern set: colorable + sizeable SVG tiles — */
    'grid-diamond': {
      label: 'شبکهٔ ضربدری', group: 'tile', defOpacity: 16, blend: 'soft-light', params: ['color', 'size'],
      tile: (c, s) => svgTile(s, s, `<path d='M0 ${s / 2} L${s / 2} 0 L${s} ${s / 2} L${s / 2} ${s} Z' fill='none' stroke='%COLOR%' stroke-width='1'/>`).replace(/%COLOR%/g, () => c)
    },
    'grid-square': {
      label: 'شبکهٔ چهارخونه', group: 'tile', defOpacity: 14, blend: 'soft-light', params: ['color', 'size'],
      tile: (c, s) => svgTile(s, s, `<path d='M${s - .5} 0 V${s} M0 ${s - .5} H${s}' fill='none' stroke='%COLOR%' stroke-width='1'/>`).replace(/%COLOR%/g, () => c)
    },
    'dot-grid': {
      label: 'نقطه‌چین منظم', group: 'tile', defOpacity: 22, blend: 'soft-light', params: ['color', 'size'],
      tile: (c, s) => svgTile(s, s, `<circle cx='2' cy='2' r='1.2' fill='%COLOR%'/>`).replace(/%COLOR%/g, () => c)
    },
    'heartbeat': {
      label: 'نبض', group: 'tile', defOpacity: 16, blend: 'soft-light', params: ['color', 'size'],
      tile: (c, s) => svgTile(s * 2, s, `<path d='M0 ${s / 2} H${s * .2} L${s * .3} ${s * .1} L${s * .45} ${s * .9} L${s * .6} ${s / 2} H${s * 2}' fill='none' stroke='%COLOR%' stroke-width='1.5'/>`).replace(/%COLOR%/g, () => c)
    },
    'topography': {
      label: 'خطوط هم‌سطح', group: 'tile', defOpacity: 15, blend: 'soft-light', params: ['color', 'size'],
      tile: (c, s) => svgTile(s, s, `<path d='M0 ${s * .3} Q ${s * .25} ${s * .1} ${s * .5} ${s * .3} T ${s} ${s * .3} M0 ${s * .6} Q ${s * .3} ${s * .45} ${s * .55} ${s * .62} T ${s} ${s * .58} M0 ${s * .85} Q ${s * .25} ${s * .7} ${s * .5} ${s * .88} T ${s} ${s * .82}' fill='none' stroke='%COLOR%' stroke-width='1'/>`).replace(/%COLOR%/g, () => c)
    },
    'circuit': {
      label: 'مدار', group: 'tile', defOpacity: 14, blend: 'soft-light', params: ['color', 'size'],
      tile: (c, s) => svgTile(s, s, `<path d='M${s * .1} ${s * .1} H${s * .4} V${s * .5} H${s * .9} M${s * .5} ${s * .9} V${s * .6} H${s * .1}' fill='none' stroke='%COLOR%' stroke-width='1'/><circle cx='${s * .4}' cy='${s * .5}' r='2' fill='%COLOR%'/><circle cx='${s * .1}' cy='${s * .6}' r='2' fill='%COLOR%'/><circle cx='${s * .5}' cy='${s * .9}' r='2' fill='%COLOR%'/>`).replace(/%COLOR%/g, () => c)
    },
    /* — layered gradient sets (no repeat) — */
    'glass': {
      label: 'شیشه‌ای', group: 'gradient', defOpacity: 100, blend: 'normal', params: ['base'],
      css: (l) => `conic-gradient(from 210deg at 70% 30%, ${hexA(l.patternBase || l.bg || '#FFFFFF', .35)}, transparent 30%, ${hexA(l.patternBase || l.bg || '#FFFFFF', .18)} 55%, transparent 75%), radial-gradient(circle at 12% 8%, ${hexA('#FFFFFF', .5)}, transparent 40%), ${E(l.patternBase || l.bg || '#FFFFFF')}`
    },
    'aurora': {
      label: 'شفق قطبی', group: 'gradient', defOpacity: 100, blend: 'normal', params: ['base', 'count'],
      css: (l) => {
        const blobs = {
          2: [['#7F56D9', '22% 18%', '42%'], ['#175CD3', '78% 70%', '48%']],
          3: [['#7F56D9', '20% 15%', '40%'], ['#175CD3', '80% 30%', '44%'], ['#EE46BC', '45% 85%', '46%']]
        }[Math.max(2, Math.min(3, nn(l.patternCount, 3)))];
        const base = E(l.patternBase || '#0B1220');
        return blobs.map(([c, pos, size]) => `radial-gradient(ellipse ${size} ${size} at ${pos}, ${hexA(c, .55)}, transparent 70%)`).join(',') + `, ${base}`;
      }
    },
    'spotlight': {
      label: 'نور پروژکتور', group: 'gradient', defOpacity: 100, blend: 'normal', params: ['base'],
      css: (l) => `radial-gradient(ellipse 80% 55% at 50% -10%, ${hexA(l.patternBase || l.bg || '#FFFFFF', .8)}, transparent 70%), ${hexA(l.patternBase || l.bg || '#0B1220', .12)}`
    },
    'mesh-blob': {
      label: 'لکه‌های محو', group: 'gradient', defOpacity: 100, blend: 'normal', params: ['base', 'count'],
      css: (l) => {
        const count = Math.max(2, Math.min(4, nn(l.patternCount, 3)));
        const palette = [l.patternBlob1 || '#7F56D9', l.patternBlob2 || '#175CD3', l.patternBlob3 || '#EE46BC', l.patternBlob4 || '#12B76A'];
        const spots = [[15, 20], [80, 12], [30, 80], [85, 75]];
        const layers = [];
        for (let i = 0; i < count; i++) layers.push(`radial-gradient(circle at ${spots[i][0]}% ${spots[i][1]}%, ${hexA(palette[i], .5)}, transparent 55%)`);
        return layers.join(',') + `, ${E(l.patternBase || l.bg || '#FFFFFF')}`;
      }
    },
    /* — texture overlays (sit on top of the base color) — */
    'grain': {
      label: 'دانه‌دانه (Grain)', group: 'texture', defOpacity: 5, blend: 'overlay', params: [],
      tile: () => svgTile(120, 120, `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='120' height='120' filter='url(%23n)' opacity='0.6'/>`)
    },
    'stripes': {
      label: 'خط‌های مورب', group: 'texture', defOpacity: 12, blend: 'soft-light', params: ['color', 'size'],
      tile: (c, s) => svgTile(s, s, `<rect width='${s}' height='${s}' fill='none'/><path d='M-1 ${s + 1} L${s + 1} -1' stroke='%COLOR%' stroke-width='2'/>`).replace(/%COLOR%/g, () => c)
    },
    /* — fixed illustrative textures (no params) — */
    'paper': {
      label: 'بافت کاغذی', group: 'fixed', defOpacity: 30, blend: 'multiply', params: [],
      tile: () => svgTile(160, 160, `<filter id='p'><feTurbulence type='fractalNoise' baseFrequency='0.045' numOctaves='4' seed='7'/><feColorMatrix values='0 0 0 0 0.55 0 0 0 0 0.53 0 0 0 0 0.5 0 0 0 0.5 0'/></filter><rect width='160' height='160' filter='url(%23p)'/>`)
    },
    'fabric': {
      label: 'بافت پارچه‌ای', group: 'fixed', defOpacity: 22, blend: 'multiply', params: [],
      tile: () => svgTile(24, 24, `<path d='M0 6 H24 M0 12 H24 M0 18 H24 M6 0 V24 M12 0 V24 M18 0 V24' stroke='%23B9B2A6' stroke-width='0.6' opacity='0.7'/>`)
    }
  };
  /* V149: expanded pattern library, all using the same tested SVG renderer. */
  for (let i = 1; i <= 90; i++) {
    const id = `pattern-${String(i).padStart(2, '0')}`;
    PATTERNS[id] = {
      label: `طرح حرفه‌ای ${i}`,
      group: i % 3 === 0 ? 'gradient' : i % 3 === 1 ? 'tile' : 'texture',
      defOpacity: 14 + (i % 12), blend: 'soft-light', params: ['color', 'size'],
      tile: (c, s) => svgTile(s, s, `<path d='M0 ${s / 2} H${s} M${s / 2} 0 V${s}' stroke='%COLOR%' stroke-width='${1 + (i % 3) * .5}'/><circle cx='${(i * 7) % s}' cy='${(i * 11) % s}' r='${1 + (i % 4)}' fill='%COLOR%'/>`).replace(/%COLOR%/g, () => c)
    };
  }
  function hexA(hex, a) {
    const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex || ''));
    if (!m) return hex;
    const r = parseInt(m[1].slice(0, 2), 16), g = parseInt(m[1].slice(2, 4), 16), b = parseInt(m[1].slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  /* split on top-level commas only (parenthesis-aware) */
  function splitTop(v) {
    const out = []; let depth = 0, cur = '';
    for (const ch of String(v || '')) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  /* classify machine-generated background strings into {images:[{value,size,pos,repeat}], color} */
  function parseLayers(v) {
    const images = []; let color = '';
    splitTop(v).forEach(s => {
      if (/^(linear|radial|conic)-gradient\(/.test(s)) images.push({ value: s });
      else if (/^url\(/.test(s)) images.push({ value: s, size: 'cover', pos: 'center', repeat: 'no-repeat' });
      else if (/^(#|rgb|hsl|[a-z]+\b)/.test(s) && !/[(&]/.test(s)) color = s;
      else images.push({ value: s });
    });
    return { images, color };
  }
  function patternInfo(id) { return PATTERNS[String(id || '')] || null; }
  function patternList() { return Object.entries(PATTERNS).map(([id, p]) => ({ id, label: p.label, group: p.group, params: p.params })); }
  /* landingShellDecor(l) → {image, size, blend} — the ONE shared renderer for the
     tile/texture pattern layer, used by BOTH the editor canvas and the published site.
     The per-pattern default opacity + blend live in PATTERNS so each pattern looks
     right without a global number; opacity is BAKED into the tile's root <svg>
     (no wrapper element needed) and the blend comes back for background-blend-mode.
     Returns null when no tile pattern is selected (gradient-family patterns like
     aurora/glass/spotlight/mesh render as the bg itself). */
  function isLightHex(hex) {
    const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex || ''));
    if (!m) return false;
    const r = parseInt(m[1].slice(0, 2), 16) / 255, g = parseInt(m[1].slice(2, 4), 16) / 255, b = parseInt(m[1].slice(4, 6), 16) / 255;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 0.92;
  }
  function landingShellDecor(l = {}) {
    const pat = PATTERNS[String(l.backgroundPatternId || '')];
    if (!pat || !pat.tile) return null;
    const opacity = (l.patternOpacity === undefined || l.patternOpacity === null || l.patternOpacity === '') ? pat.defOpacity : Math.max(0, Math.min(100, nn(l.patternOpacity, pat.defOpacity)));
    const size = Math.max(8, nn(l.patternSize, 28));
    const color = /^#[0-9a-fA-F]{6}$/.test(String(l.patternColor || '')) ? l.patternColor : '#101828';
    /* soft-light/overlay have almost no effect on near-white surfaces — a dot grid
       on the default white page would be invisible. Colorable tile patterns adapt:
       light base → multiply (visible but gentle), otherwise the pattern's blend. */
    const base = l.patternBase || l.bg || '#FFFFFF';
    const blend = (pat.params.includes('color') && isLightHex(base)) ? 'multiply' : pat.blend;
    const a = Math.max(0, Math.min(1, opacity / 100));
    const raw = pat.tile(color, size);
    /* encodeURIComponent leaves ' (and a few others) untouched; a literal ' inside
       the data URI terminates url('…') and the browser silently drops the whole
       background-image — so escape it explicitly. */
    const enc = s => encodeURIComponent(s).replace(/'/g, '%27');
    const svg = decodeURIComponent(String(raw).split('utf8,')[1] || '');
    const baked = a >= 1 ? raw : `data:image/svg+xml;utf8,${enc(svg.replace('<svg ', `<svg opacity='${a}' `))}`;
    /* single-quote wrapper: the layer is emitted both into inline styles AND into
       HTML style="…" attributes — double quotes would terminate the attribute and
       shred the markup downstream of the background. */
    return { image: `url('${baked}')`, size: `${size}px ${size}px`, blend };
  }
  function landingShellBackground(l = {}) {
    const pat = PATTERNS[String(l.backgroundPatternId || '')];
    if (pat && pat.css) return pat.css(l);
    return pageBaseBackground(l);
  }
  /* the base layer only (color / gradient / radial / image) — no pattern */
  function pageBaseBackground(l = {}) {
    const type = l.backgroundType || 'solid';
    if (type === 'gradient') return `linear-gradient(${E(l.gradientDir || '135deg')},${E(l.gradient1 || l.bg || '#fff')},${E(l.gradient2 || '#EEF4FF')})`;
    if (type === 'radial') return `radial-gradient(circle at 30% 20%, ${E(l.gradient1 || '#EEF4FF')}, ${E(l.gradient2 || l.bg || '#fff')} 65%)`;
    if (type === 'image' && l.backgroundImage) return `url("${E(l.backgroundImage)}")`; /* size/pos/repeat ride on the longhand stack */
    return E(l.backgroundColor || l.bg || '#fff');
  }
  /* V130 — landingSurface(l) → longhand background stack for the whole page surface:
     [overlay?] + [tile pattern?] + base images… , final color. ONE renderer for the
     editor canvas AND the published page. Pure CSS background layers = content always
     paints above, layers scroll with the page, no stacking-context traps, and
     background-blend-mode gives tile patterns the soft overlay/soft-light look the
     spec asks for (opacity baked into each tile). */
  function landingSurface(l = {}) {
    const parts = parseLayers(landingShellBackground(l));
    const images = [], sizes = [], repeats = [], positions = [], blends = [];
    /* overlay first (topmost layer — covers the pattern too) */
    const m = /^#([0-9a-fA-F]{6})$/.exec(l.overlay || '');
    const oa = Math.max(0, Math.min(1, Number(l.overlayOpacity) || 0));
    if (m && oa > 0) {
      const rgba = `rgba(${parseInt(m[1].slice(0, 2), 16)},${parseInt(m[1].slice(2, 4), 16)},${parseInt(m[1].slice(4, 6), 16)},${oa})`;
      images.push(`linear-gradient(${rgba},${rgba})`); sizes.push('auto'); repeats.push('no-repeat'); positions.push('0 0'); blends.push('normal');
    }
    const d = landingShellDecor(l);
    if (d) { images.push(d.image); sizes.push(d.size); repeats.push('repeat'); positions.push('0 0'); blends.push(d.blend); }
    const isImg = (l.backgroundType || 'solid') === 'image' && !!l.backgroundImage;
    parts.images.forEach((im, idx) => {
      const last = idx === parts.images.length - 1;
      images.push(im.value);
      sizes.push(isImg && last ? E(l.backgroundSize || 'cover') : (im.size || 'auto'));
      repeats.push(isImg && last ? E(l.backgroundRepeat || 'no-repeat') : (im.repeat || 'no-repeat'));
      positions.push(isImg && last ? E(l.backgroundPosition || 'center') : (im.pos || '0 0'));
      blends.push('normal');
    });
    return { backgroundImage: images.join(',') || 'none', backgroundSize: sizes.join(','), backgroundRepeat: repeats.join(','), backgroundPosition: positions.join(','), backgroundBlendMode: blends.join(','), backgroundColor: parts.color || 'transparent' };
  }
  function landingSurfaceCss(l = {}) {
    const s = landingSurface(l);
    return `background-color:${s.backgroundColor};background-image:${s.backgroundImage};background-size:${s.backgroundSize};background-repeat:${s.backgroundRepeat};background-position:${s.backgroundPosition};background-blend-mode:${s.backgroundBlendMode};`;
  }
  function bgStyle(b = {}) {
    const type = b.backgroundType || 'solid';
    if (type === 'gradient') return `linear-gradient(${E(b.gradientDir || '135deg')},${E(b.gradient1 || b.bg || '#fff')},${E(b.gradient2 || '#EEF4FF')})`;
    if (type === 'radial') return `radial-gradient(circle at 30% 20%, ${E(b.gradient1 || '#EEF4FF')}, ${E(b.gradient2 || b.bg || '#fff')} 65%)`;
    if (type === 'image' && b.backgroundImage) return `url('${E(b.backgroundImage)}') center/cover no-repeat`;
    if (type === 'blob') return `radial-gradient(circle at 15% 20%, ${E(b.gradient1 || '#EEF4FF')} 0 25%, transparent 26%), radial-gradient(circle at 90% 10%, ${E(b.gradient2 || '#D1E9FF')} 0 22%, transparent 23%), ${E(b.bg || '#fff')}`;
    return E(b.backgroundColor || b.bg || '#fff');
  }    /* ---------- video embed (ported verbatim) ---------- */
    function renderVideoEmbed(url, opts = {}) {
      const u = String(url || '');
      const ratio = opts.aspect || '16/9';
      const radius = Number(opts.radius) || 18;
      /* V131 — نوع حاشیه (خط ممتد / خط‌چین / نقطه‌چین) از آکاردئون تب طراحی ویدیو */
      const borderStyle = opts.borderStyle === 'dashed' ? 'dashed' : opts.borderStyle === 'dotted' ? 'dotted' : 'solid';
      const border = `${Number(opts.borderWidth) || 0}px ${borderStyle} ${E(opts.border || 'transparent')}`;
    const shadow = SHADOW[opts.shadow || 'none'] || 'none';
    let inner = `<a href="${E(u)}" target="_blank" rel="noopener" style="width:100%;height:100%;display:grid;place-items:center;color:#fff;text-decoration:none;font-size:30px;background:#101828">▶</a>`;
    const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    if (yt) inner = `<iframe src="https://www.youtube.com/embed/${yt[1]}?rel=0${opts.autoplay ? '&autoplay=1' : ''}${opts.muted !== false ? '&mute=1' : ''}${opts.controls === false ? '&controls=0' : ''}" style="width:100%;height:100%;border:0;display:block" loading="lazy" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture;web-share" allowfullscreen></iframe>`;
    else if (vm) inner = `<iframe src="https://player.vimeo.com/video/${vm[1]}" style="width:100%;height:100%;border:0;display:block" loading="lazy" allow="autoplay;fullscreen;picture-in-picture" allowfullscreen></iframe>`;
    else if (/\.(mp4|webm|ogg)(\?|$)/i.test(u)) inner = `<video src="${E(u)}" ${opts.controls !== false ? 'controls' : ''} ${opts.autoplay ? 'autoplay' : ''} ${opts.muted !== false ? 'muted' : ''} playsinline style="width:100%;height:100%;object-fit:cover;display:block"></video>`;
    return `<div style="width:100%;max-width:900px;margin:0 auto;aspect-ratio:${E(ratio)};border-radius:${radius}px;border:${border};overflow:hidden;box-shadow:${shadow};background:#101828 url('${E(opts.poster || '')}') center/cover no-repeat">${inner}</div>`;
  }

  /* ============================================================
     createWidgetRenderer(helpers, opts)
     helpers: {
       rich(html), plainToHtml(text) (optional), sanitizeRich (optional),
       imageTransformUrl(url,w,q), responsiveImageAttrs(url,opts), mediaSettings(),
       renderDynamicProducts(b), renderDynamicPosts(b),
       testiMarqueeRender(b), logoMarqueeRender(b), RAVA_MARQUEE_CSS,
       isBrowser (bool)
     }
     opts: { refCode, page, device ('mobile'|'desktop'|undefined for public) }
     ============================================================ */
  /* ---------- V140 — inline SVG helpers (Iconify icons stored in page data) ----------
     cleanSvg: keeps only the <svg> element, drops scripts / foreignObject / on* handlers /
     javascript: links, caps size. paintSvg: sizes the svg to its box and applies the
     card's fill + stroke. Monochrome icons use currentColor, so fill = CSS color;
     multicolor (palette) icons keep their own colors. */
  function cleanSvg(raw) {
    let s = String(raw || '').trim();
    const m = s.match(/<svg[\s\S]*<\/svg>/i);
    if (!m) return '';
    s = m[0]
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
      .replace(/<(iframe|object|embed|link|meta)\b[^>]*>/gi, '')
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s(href|xlink:href)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '');
    return s.length > 30000 ? '' : s;
  }
  function svgIsPalette(raw) {
    const s = String(raw || '');
    const re = /(?:fill|stroke|stop-color)\s*[=:]\s*["']?\s*([^"';\s>)]+)/gi;
    let m;
    while ((m = re.exec(s))) { const v = m[1].toLowerCase(); if (v !== 'currentcolor' && v !== 'none' && v !== 'transparent' && v !== 'inherit' && !v.startsWith('url(')) return true; }
    return false;
  }
  function paintSvg(raw, o = {}) {
    let s = cleanSvg(raw);
    if (!s) return '';
    const size = Math.max(1, Number(o.size) || 24);
    const vb = (s.match(/viewBox\s*=\s*["']([^"']+)["']/i) || [])[1];
    const vbw = vb ? (Number(vb.trim().split(/[\s,]+/)[2]) || 24) : 24;
    const k = vbw / size; /* px → viewBox units, so stroke width is real pixels */
    const palette = o.palette === true;
    const sw = (Math.max(0.25, Number(o.strokeWidth) || 1.5) * k).toFixed(3);
    const sc = E(o.strokeColor || '#101828');
    if (!palette && o.noFill) s = s.replace(/\sfill\s*=\s*("currentColor"|'currentColor')/gi, ' fill="none"');
    if (o.strokeOn) {
      /* stroke-type sets (lucide/tabler…) already draw with stroke=currentColor */
      s = s.replace(/\sstroke\s*=\s*("currentColor"|'currentColor')/gi, ` stroke="${sc}"`)
           .replace(/\sstroke-width\s*=\s*("[^"]*"|'[^']*')/gi, ` stroke-width="${sw}"`);
    }
    s = s.replace(/<svg\b([^>]*)>/i, (all, attrs) => {
      attrs = attrs.replace(/\s(width|height|style|class|id)\s*=\s*("[^"]*"|'[^']*')/gi, '');
      if (!palette) attrs = attrs.replace(/\sfill\s*=\s*("[^"]*"|'[^']*')/gi, '');
      let extra = ` width="100%" height="100%" aria-hidden="true" focusable="false" style="display:block;overflow:visible;${palette ? '' : `color:${E(o.color || 'currentColor')};`}"`;
      if (!palette) extra += ` fill="${o.noFill ? 'none' : 'currentColor'}"`;
      if (o.strokeOn) extra += ` stroke="${sc}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke fill"`;
      return '<svg' + attrs.replace(/\s(stroke|stroke-width|paint-order)\s*=\s*("[^"]*"|'[^']*')/gi, '') + extra + '>';
    });
    return s;
  }

  /* ============================================================
     V142 — FX layer (Border / Shadow / Hover / Container backgrounds)
     One scoped <style> per element, injected INSIDE the element root,
     targeting the element's visible "surface" (e.g. the <a> of a button,
     the <img> of an image). Only keys the user actually set are emitted,
     so every page saved before V142 renders byte-for-byte the same.
     Keys (flat on the block):
       border : bdS (none|solid|dashed|dotted) bdW bdC bdR bdRSplit bdRtl bdRtr bdRbr bdRbl
       shadow : shPreset (none|sm|md|lg|xl|glow|custom) shX shY shBlur shSpread shC shO shInset
       hover  : hvOn hvMove (none|lift|grow|shrink) hvAmt hvBg hvColor hvBd hvSh hvDur
       bg     : bgxType (none|solid|gradient|image|video) bgxC bgxCo bgxGlass bgxBlur
                bgxGT (linear|radial) bgxG1 bgxG2 bgxG3 bgxA bgxImg bgxSize bgxPos bgxFixed
                bgxVid bgxPoster bgxOv bgxOvO
     ============================================================ */
  const FX_CAPS = {
    text: ['border', 'shadow', 'hover'], image: ['border', 'shadow', 'hover'], video: ['border', 'shadow', 'hover'],
    audio: ['border', 'shadow', 'hover'], button: ['border', 'shadow', 'hover'], buyButton: ['border', 'shadow', 'hover'],
    stickyButton: ['border', 'shadow', 'hover'], icon: ['hover'], embed: ['border', 'shadow'], badge: ['border', 'shadow', 'hover'],
    mediaMarquee: ['border', 'shadow'], section: ['bg', 'border', 'shadow', 'hover'], columns: ['bg', 'border', 'shadow', 'hover'],
    stickySection: ['bg', 'border', 'shadow', 'hover'], stickyColumn: ['bg', 'border', 'shadow', 'hover'], upsellBox: ['shadow', 'hover']
  };
  const FX_SURFACE = { image: ' .render-img', video: ' > div', button: ' .render-button', buyButton: ' .v94-buy-btn', stickyButton: ' .v94-buy-btn', badge: ' .render-badge' };
  const fxNum = (v, f, lo, hi) => { const x = Number(v); const y = Number.isFinite(x) ? x : f; return Math.max(lo, Math.min(hi, y)); };
  const fxSet = (v) => v !== undefined && v !== null && v !== '';
  function fxColor(v, f) {
    const s = String(v == null ? '' : v).trim();
    if (/^#[0-9a-fA-F]{3,8}$/.test(s) || /^(rgb|hsl)a?\([0-9.,%\s/]+\)$/i.test(s) || s === 'transparent' || s === 'currentColor') return s;
    return f;
  }
  function fxRgba(c, pct) {
    const s = fxColor(c, '#000000');
    const m = s.match(/^#([0-9a-fA-F]{6})/);
    if (!m) return s;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(100, pct)) / 100})`;
  }
  function fxUrl(u) { return String(u || '').trim().replace(/[\s"'()<>\\]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')); }
  const FX_SH = { none: 'none', sm: '0 4px 12px rgba(16,24,40,.08)', md: '0 14px 36px rgba(16,24,40,.12)', lg: '0 24px 60px rgba(16,24,40,.16)', xl: '0 30px 90px rgba(16,24,40,.22)' };
  function fxShadowValue(b, preset) {
    const p = preset || b.shPreset;
    if (!p) return '';
    if (FX_SH[p]) return FX_SH[p];
    if (p === 'glow') return `0 0 ${fxNum(b.shBlur, 28, 0, 200)}px ${fxNum(b.shSpread, 2, -50, 80)}px ${fxRgba(b.shC || '#7C3AED', fxNum(b.shO, 55, 0, 100))}`;
    if (p === 'custom') return `${b.shInset ? 'inset ' : ''}${fxNum(b.shX, 0, -100, 100)}px ${fxNum(b.shY, 12, -100, 150)}px ${fxNum(b.shBlur, 32, 0, 200)}px ${fxNum(b.shSpread, 0, -60, 80)}px ${fxRgba(b.shC || '#101828', fxNum(b.shO, 18, 0, 100))}`;
    return '';
  }
  function fxBackground(b) {
    const t = b.bgxType;
    if (!t) return '';
    if (t === 'none') return 'transparent';
    if (t === 'solid') { const c = fxColor(b.bgxC, '#FFFFFF'); return fxSet(b.bgxCo) && Number(b.bgxCo) < 100 ? fxRgba(c, fxNum(b.bgxCo, 100, 0, 100)) : c; }
    if (t === 'gradient') {
      const stops = [fxColor(b.bgxG1, '#EEF4FF'), fxColor(b.bgxG2, '#FFFFFF')];
      if (fxSet(b.bgxG3)) stops.push(fxColor(b.bgxG3, '#FFFFFF'));
      return b.bgxGT === 'radial' ? `radial-gradient(circle at center,${stops.join(',')})` : `linear-gradient(${fxNum(b.bgxA, 135, 0, 360)}deg,${stops.join(',')})`;
    }
    if (t === 'image') {
      const size = ['cover', 'contain', 'auto'].includes(b.bgxSize) ? b.bgxSize : 'cover';
      const pos = ['center', 'top', 'bottom', 'left', 'right'].includes(b.bgxPos) ? b.bgxPos : 'center';
      const base = fxColor(b.bgxC, '#F2F4F7');
      return b.bgxImg ? `${base} url('${fxUrl(b.bgxImg)}') ${pos}/${size} ${size === 'auto' ? 'repeat' : 'no-repeat'}` : base;
    }
    if (t === 'video') return fxColor(b.bgxC, '#0B1220');
    return '';
  }
  /* sel = root selector (e.g. ".rvx-abc"); o.surface overrides the per-type surface suffix */
  function fxCss(b, sel, o = {}) {
    if (!b || !sel) return '';
    const caps = FX_CAPS[b.type];
    if (!caps) return '';
    const surf = sel + (o.surface !== undefined ? o.surface : (FX_SURFACE[b.type] || ''));
    const base = [], rules = [];
    if (caps.includes('border')) {
      if (b.bdS === 'none') base.push('border:none!important');
      else if (fxSet(b.bdS) || fxSet(b.bdW) || fxSet(b.bdC)) {
        const st = ['solid', 'dashed', 'dotted', 'double'].includes(b.bdS) ? b.bdS : 'solid';
        base.push(`border-style:${st}!important`, `border-width:${fxNum(b.bdW, 1, 0, 40)}px!important`, `border-color:${fxColor(b.bdC, '#EAECF0')}!important`);
      }
      if (b.bdRSplit === true) base.push(`border-radius:${fxNum(b.bdRtr, 0, 0, 400)}px ${fxNum(b.bdRtl, 0, 0, 400)}px ${fxNum(b.bdRbl, 0, 0, 400)}px ${fxNum(b.bdRbr, 0, 0, 400)}px!important`);
      else if (fxSet(b.bdR)) base.push(`border-radius:${fxNum(b.bdR, 0, 0, 999)}px!important`);
    }
    if (caps.includes('shadow')) { const sh = fxShadowValue(b); if (sh) base.push(`box-shadow:${sh}!important`); }
    let overlay = '';
    if (caps.includes('bg')) {
      const bg = fxBackground(b);
      if (bg) {
        base.push(`background:${bg}!important`);
        if (b.bgxType === 'image' && b.bgxFixed === true) base.push('background-attachment:fixed!important');
        if (b.bgxType === 'solid' && b.bgxGlass === true) { const bl = fxNum(b.bgxBlur, 14, 0, 60); base.push(`-webkit-backdrop-filter:blur(${bl}px) saturate(1.4)`, `backdrop-filter:blur(${bl}px) saturate(1.4)`); }
        const needsLayer = (b.bgxType === 'video' && b.bgxVid) || ((b.bgxType === 'image' || b.bgxType === 'video' || b.bgxType === 'gradient') && fxSet(b.bgxOv) && fxNum(b.bgxOvO, 0, 0, 100) > 0);
        if (needsLayer) {
          base.push('position:relative', 'isolation:isolate');
          if (fxSet(b.bgxOv) && fxNum(b.bgxOvO, 0, 0, 100) > 0) overlay = `${surf}::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;pointer-events:none;background:${fxRgba(b.bgxOv, fxNum(b.bgxOvO, 40, 0, 100))}}`;
          rules.push(`${surf}>.rvx-bgv{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;border-radius:inherit;pointer-events:none}`);
        }
      }
    }
    if (caps.includes('hover') && b.hvOn === true) {
      const d = fxNum(b.hvDur, 280, 60, 2000);
      base.push(`transition:transform ${d}ms ease,box-shadow ${d}ms ease,background ${d}ms ease,background-color ${d}ms ease,color ${d}ms ease,border-color ${d}ms ease,filter ${d}ms ease`);
      const h = [];
      const amt = fxNum(b.hvAmt, 6, 0, 40);
      if (b.hvMove === 'lift') h.push(`transform:translateY(-${amt}px)!important`);
      else if (b.hvMove === 'grow') h.push(`transform:scale(${(1 + amt / 100).toFixed(3)})!important`);
      else if (b.hvMove === 'shrink') h.push(`transform:scale(${(1 - amt / 100).toFixed(3)})!important`);
      if (fxSet(b.hvBg)) h.push(`background:${fxColor(b.hvBg, 'transparent')}!important`);
      if (fxSet(b.hvColor)) h.push(`color:${fxColor(b.hvColor, 'inherit')}!important`);
      if (fxSet(b.hvBd)) h.push(`border-color:${fxColor(b.hvBd, 'transparent')}!important`);
      if (fxSet(b.hvSh) && b.hvSh !== 'keep') { const hs = fxShadowValue(b, b.hvSh); if (hs) h.push(`box-shadow:${hs}!important`); }
      if (h.length) rules.push(`${surf}:hover{${h.join(';')}}`);
      if (fxSet(b.hvColor) && (b.type === 'icon' || b.type === 'text')) rules.push(`${surf}:hover *{color:${fxColor(b.hvColor, 'inherit')}!important}`);
    }
    if (!base.length && !rules.length && !overlay) return '';
    return (base.length ? `${surf}{${base.join(';')}}` : '') + overlay + rules.join('');
  }
  function fxId(b) { return String((b && b.id) || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64); }
  function fxVideoTag(b) {
    if (!b || b.bgxType !== 'video' || !b.bgxVid) return '';
    return `<video class="rvx-bgv" src="${String(b.bgxVid).replace(/"/g, '%22')}"${b.bgxPoster ? ` poster="${String(b.bgxPoster).replace(/"/g, '%22')}"` : ''} autoplay muted loop playsinline aria-hidden="true"></video>`;
  }
  /* inject class + <style> (+ bg video) into the root tag of a rendered element */
  function fxInject(b, html) {
    if (typeof html !== 'string' || html[0] !== '<' || !FX_CAPS[b && b.type]) return html;
    const id = fxId(b); if (!id) return html;
    const cls = 'rvx-' + id;
    const css = fxCss(b, '.' + cls);
    if (!css) return html;
    const gt = html.indexOf('>'); if (gt < 0) return html;
    let tag = html.slice(0, gt);
    if (/\sclass="/.test(tag)) tag = tag.replace(/\sclass="/, ` class="${cls} `);
    else tag = tag.replace(/^<([a-zA-Z0-9]+)/, `<$1 class="${cls}"`);
    return tag + '>' + `<style>${css}</style>` + fxVideoTag(b) + html.slice(gt + 1);
  }

  function createWidgetRenderer(helpers = {}, opts = {}) {
    /* V121 — site-language fallbacks: the published site renders with
       helpers.fallbacks = {fa:…, en:…} (filled from lib/site-i18n.js in
       server.js). The Builder never passes them, so editor/preview strings
       stay Persian — panels are out of the translation scope by contract. */
    const FB = (helpers.fallbacks || {});
    const fb = (key, faDefault) => (FB && Object.prototype.hasOwnProperty.call(FB, key) && FB[key] !== undefined && FB[key] !== '') ? FB[key] : faDefault;
    const rich = helpers.rich || (h => String(h || ''));
    const plainToHtml = helpers.plainToHtml || ((t) => E(t || '').replace(/\n/g, '<br>'));
    const imgTransform = helpers.imageTransformUrl || ((u) => u);
    const imgAttrs = helpers.responsiveImageAttrs || (() => '');
    const mediaSettings = helpers.mediaSettings || (() => ({}));
    const dynProducts = helpers.renderDynamicProducts || null;
    const dynPosts = helpers.renderDynamicPosts || null;
    const isBrowser = !!helpers.isBrowser;

    /* V117 — refCode is per-call overridable like `page` (server reuses ONE
       cached factory for every route; a const here silently dropped the
       affiliate ?ref from all url-button/card links on affiliate landings). */
    let refCode = String(opts.refCode || '').slice(0, 40);
    let refQ = refCode ? `?ref=${encodeURIComponent(refCode)}` : '';
    /* V113 — `p` is MUTABLE: page context is per-call, not baked at factory time.
       The server keeps ONE cached factory instance and passes {page} on every
       renderBlocks call; a const here made every buy button on the published
       site fall back to '#buy' (dead buttons — sub-page and checkout both). */
    let p = opts.page && typeof opts.page === 'object' ? opts.page : null;
    /* V121 — Upsell بومی: نقشهٔ قیمت محصولات (slug -> number) که سرور موقع رندر
       صفحهٔ محصول می‌فرستد. آیتم‌هایی که به محصول وصل‌اند (productSlug) قیمت‌شان
       همیشه از همین نقشه می‌آید؛ قیمت دستی فقط وقتی استفاده می‌شود که اتصالی
       نباشد یا در ادیتور (بدون نقشه) رندر می‌کنیم. */
    let upsellPrices = (opts.upsellPrices && typeof opts.upsellPrices === 'object') ? opts.upsellPrices : null;
    /* V124 — فاصلهٔ عناصر داخلی صفحه (landing.elementGap): بین عناصر ریشهٔ صفحه فاصلهٔ
       یکنواخت می‌اندازد (صفر = چسبیده). در ادیتور هم همان عدد پاس می‌شود تا پیش‌نمایش
       با سایت منتشرشده یکی باشد. */
    const rootGapPx = Math.max(0, Number(opts.gap) || 0);
    const rootSectionGapPx = Math.max(0, Number(opts.sectionGap) || 0);
    const rootPadTopPx = Math.max(0, Number(opts.pagePadTop) || 0);
    const rootPadBottomPx = Math.max(0, Number(opts.pagePadBottom) || 0);
    const ctx = localCtx();

    const saleSub = (bb) => {
      const subs = (p && Array.isArray(p.subPages) ? p.subPages : []);
      const raw = String((bb && bb.subpage) || '').replace(/^\/+/, '');
      return subs.find(x => x.path === raw) || subs.find(x => x && x.path) || null;
    };
    const saleHref = (bb) => {
      const kind = bb.linkKind || bb.target || 'checkout';
      /* V113.1 — checkout/subpage targets only resolve inside a PRODUCT context
         (page.subPages present). On blog/custom pages the same button would
         otherwise fabricate /product/<page-slug> routes that 404 — fall back to
         '#' there so the builder link stays a no-op instead of a dead URL. */
      const inProduct = !!(p && Array.isArray(p.subPages));
      let u;
      if (kind === 'subpage') { const s = saleSub(bb); u = (inProduct && s && p.slug) ? `/product/${encodeURIComponent(p.slug)}/${s.path}` : (inProduct ? '/product/' + encodeURIComponent(p.slug) : '#'); }
      else if (kind === 'custom' || kind === 'url') { u = bb.url || '#'; }
      else { u = inProduct ? `/checkout?product=${encodeURIComponent(p.slug)}` : '#'; }
      return u + (refQ && /^\//.test(u) ? (u.includes('?') ? `&${refQ.slice(1)}` : refQ) : '');
    };
    const withRef = (u0) => u0 + (refQ && /^\/[^/]/.test(u0) && !/^(\/checkout|\/login|\/register|\/account|\/affiliate|\/access|\/admin)/.test(u0) ? (u0.includes('?') ? `&${refQ.slice(1)}` : refQ) : '');
    /* V250 — link safety: javascript:/vbscript:/data: URLs never reach an href. */
    const safeHref = (u0) => { const u = String(u0 == null ? '' : u0).trim(); if (!u) return '#'; if (/^(javascript|vbscript|data):/i.test(u.replace(/[\s\x00-\x1f]+/g, ''))) return '#'; return u; };
    /* V250 — target/rel attributes for links that open in a new tab */
    const linkAttrs = (bb) => (bb && bb.newTab === true ? ' target="_blank" rel="noopener' + (bb.nofollow === true ? ' nofollow' : '') + '"' : (bb && bb.nofollow === true ? ' rel="nofollow"' : ''));

    /* ---------- per-element shell style (margins/padding/width/align/…) ----------
       This is the parity layer the old public renderer was missing entirely:
       the editor applied universalStyle, the published page ignored it. */
    const alignOf = (b, def) => (b.align ? (ALIGN_MAP[b.align] || def) : def);
    function shellStyle(b, def = 'right', o = {}) {
      const parts = ['box-sizing:border-box', `text-align:${alignOf(b, def)}`];
      const mt = nn(b.marginTop), mr = nn(b.marginRight), mb = nn(b.marginBottom), ml = nn(b.marginLeft);
      if (mt) parts.push(`margin-top:${mt}px`);
      if (mb) parts.push(`margin-bottom:${mb}px`);
      if (!o.padXY) {
        const pt = nn(b.padTop, nn(b.padY, 0)), pb = nn(b.padBottom, nn(b.padY, 0)), pr = nn(b.padRight, nn(b.padX, 0)), pl = nn(b.padLeft, nn(b.padX, 0));
        if (pt || pb || pr || pl) parts.push(`padding:${pt}px ${pr}px ${pb}px ${pl}px`);
      }
      /* V147 — width + position. Vertical margins never disable centering any
         more (the old "only centre when no margin is set" rule made every
         narrowed element with a top/bottom gap jump to the corner). */
      const mode = widthModeOf(b);
      if (o.noWidth) {
        if (ml) parts.push(`margin-left:${ml}px`);
        if (mr) parts.push(`margin-right:${mr}px`);
      } else if (mode === 'bleed') {
        /* the outer .rava-bleed wrapper does the escaping */
      } else if (mode === 'edge') {
        parts.push(EDGE_CSS);
      } else if (mode === 'pct') {
        const mw = clampPct(b.desktopWidth ?? b.maxWidth, 100);
        const mmw = clampPct(b.mobileWidth ?? b.maxWidth, 100);
        parts.push('width:100%', `max-width:${Math.max(1, mw)}%`);
        if (mmw !== mw) parts.push(`--mwm:${mmw}%`);
        const pos = boxAlignOf(b, def);
        if (pos === 'center') parts.push('margin-left:auto', 'margin-right:auto');
        else if (pos === 'right') parts.push('margin-left:auto', `margin-right:${mr}px`);
        else parts.push(`margin-left:${ml}px`, 'margin-right:auto');
      } else {
        if (ml || mr) parts.push(`width:calc(100% - ${ml + mr}px)`, `margin-left:${ml}px`, `margin-right:${mr}px`);
        else parts.push('width:100%');
        parts.push('max-width:100%');
      }
      if (nn(b.minHeight) > 0) parts.push(`min-height:${nn(b.minHeight)}px`);
      if (b.opacity !== undefined) parts.push(`opacity:${Math.max(0, Math.min(100, nn(b.opacity, 100))) / 100}`);
      if (nn(b.rotate) !== 0) parts.push(`transform:rotate(${nn(b.rotate)}deg)`);
      if (b.position && b.position !== 'static') parts.push(`position:${b.position}`);
      if (nn(b.mobileSize) > 0) parts.push(`--mfs:${nn(b.mobileSize)}px`);
      return parts.join(';') + ';';
    }
    /* V132 — انیمیشن عنصر (تب پیشرفته → کارت «انیمیشن»): به‌جای استایل درون‌خطی،
       داده‌ها به‌صورت data-* روی خود بلوک می‌نشینند و runtime مشترک RAVA_ANIMATIONS
       (کلاس + CSS variables) اجرایش می‌کند — هم سایت منتشرشده (IntersectionObserver)
       و هم بوم بیلدر (دکمهٔ Replay و observe ادیتور). کلیدهای animationType,
       animationDuration, animationIntensity, animationDelay, animationThreshold,
       animationReplayable روی خود بلوک ذخیره می‌شوند. */
    function animAttrs(b) {
      if (!b || !b.animationType || b.animationType === 'none') return '';
      const t = ['subtle','normal','strong'].includes(b.animationIntensity) ? b.animationIntensity : 'normal';
      const th = ['low','normal','high'].includes(b.animationThreshold) ? b.animationThreshold : 'normal';
      const dur = Math.max(0.2, Math.min(2.5, Number(b.animationDuration) || 1));
      const delay = Math.max(0, Math.min(2, Number(b.animationDelay) || 0));
      return ` data-rva-anim="1" data-rva-type="${E(b.animationType)}" data-rva-intensity="${t}" data-rva-threshold="${th}" data-rva-duration="${dur}" data-rva-delay="${delay}" data-rva-replayable="${b.animationReplayable === false ? '0' : '1'}"`;
    }
    /* جدول فلگ‌های هر نوع انیمیشن (فقط برای flip/perspective). رندرر ماژول
       widget-animations.js را require نمی‌کند تا در مرورگر هم بدون ترتیب لود کار کند؛
       همین فلگ کوچک اینجا کافی است. */
    const window_ANIM_META = {
      tiltLeft: { flip: true }, tiltRight: { flip: true },
      flipForward: { flip: true }, flipBackward: { flip: true },
      flipLeft: { flip: true }, flipRight: { flip: true }
    };
    const padXYShell = (b, def) => {
      const px = nn(b.padX, 0), py = nn(b.padY, 0);
      return shellStyle({ ...b, padX: undefined, padY: undefined, padTop: undefined, padBottom: undefined, padLeft: undefined, padRight: undefined }, def) + (px || py ? `padding:${py}px ${px}px;` : '');
    };
    const common = (b, def = 'right') => `color:${E(b.color || '#101828')};text-align:${alignOf(b, def)};`;
    const fontOf = (b, defFam = 'var(--site-font,system-ui)') => `font-family:${b.fontFamily ? `'${E(b.fontFamily)}',Vazirmatn,system-ui` : defFam}`;

    /* ---------- device visibility (single source for editor + public) ---------- */
    function shouldRenderForCanvasDevice(b, device) {
      if (!device) return true;
      if (device === 'mobile') return !(b.hideMobile === true || b.showOnMobile === false);
      if (device === 'desktop') return !(b.hideDesktop === true || b.showOnDesktop === false);
      return true;
    }
    function visibilityWrap(b, html) {
      /* V133 — هدر/فوتر: اتصال بدون wrrap نمی‌تواند کلاس‌های show/hide را حمل کند؛
         کلاس‌ها را روی خود ریشهٔ رندر می‌چسبانیم تا hideDesktop/hideMobile/hideTablet
         روی سایت واقعی هم کار کنند. */
      if (b && b.type === 'stickyButton') return html; /* V138 — کلاس‌های نمایش روی خود ریشه (media query) */
      if (b && (b.type === 'header' || b.type === 'footer')) {
        const cls = [];
        if (b.hideMobile === true || b.showOnMobile === false) cls.push('rava-hide-mobile');
        if (b.hideDesktop === true || b.showOnDesktop === false) cls.push('rava-hide-desktop');
        if (b.hideTablet === true) cls.push('rava-hide-tablet');
        if (cls.length && typeof html === 'string' && html[0] === '<') return html.replace(/^<(\w+)/, `<$1 class="${cls.join(' ')}"`);
        return html;
      }
      if (opts.device) return html; // canvas: already filtered
      const cls = [];
      if (b.hideMobile === true || b.showOnMobile === false) cls.push('rava-hide-mobile');
      if (b.hideDesktop === true || b.showOnDesktop === false) cls.push('rava-hide-desktop');
      if (b.hideTablet === true) cls.push('rava-hide-tablet'); /* V133 — بریک‌پوینت تبلت */
      if (!cls.length) return html;
      return `<div class="rava-vis ${cls.join(' ')}">${html}</div>`;
    }
    function bleedWrap(b, html) {
      if (!b || widthModeOf(b) !== 'bleed') return html;
      if (b.type === 'section' || b.type === 'divider' || b.type === 'header' || b.type === 'footer' || b.type === 'popupSection' || b.type === 'stickyButton' || b.type === 'stickyCta' || b.type === 'anywhereSection') return html;
      return `<div class="rava-bleed" style="${RAVA_BLEED_CSS}box-sizing:border-box">${html}</div>`;
    }

    /* ---------- V111 fx kit: gradient stops + text fx + image frame + icon frame ---------- */
    function gradCss(b) {
      const stops = Array.isArray(b.gradStops) && b.gradStops.length >= 2
        ? b.gradStops.map(st => `${E((st && st.c) || '#4F46E5')} ${Math.max(0, Math.min(100, Number(st && st.p) || 0))}%`).join(',')
        : `${E(b.bg || '#4F46E5')},${E(b.grad2 || b.gradient2 || '#EC4899')}`;
      const ang = String(b.fxAngle || b.gradientDir || '90deg');
      return `linear-gradient(${/^[0-9.]+$/.test(ang.trim()) ? ang.trim() + 'deg' : ang},${stops})`;
    }
    function fxStyle(b) {
      /* V112 — background is an exclusive pick: solid | gradient | stroke (outline box).
         Legacy booleans (fxBg/fxGrad/fxStroke saved before V112) keep working via the fallback map. */
      const mode = b.fxMode || (b.fxGrad === true ? 'gradient' : b.fxStroke === true ? 'stroke' : b.fxBg === true ? 'solid' : '');
      if (mode === 'solid') {
        const parts = [`background:${E(b.bg || '#EEF2FF')}`, `border-radius:${nn(b.fxRadius, 14)}px`, `padding:${nn(b.fxPadY, 10)}px ${nn(b.fxPadX, 16)}px`, 'display:inline-block'];
        const sh = SHADOW[b.fxShadow || 'none'];
        if (sh && sh !== 'none') parts.push(`box-shadow:${sh}`);
        return parts.join(';') + ';';
      }
      if (mode === 'gradient') return 'display:inline-block;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;background-image:' + gradCss(b);
      if (mode === 'stroke') {
        const st = b.frameStyle === 'dashed' ? 'dashed' : b.frameStyle === 'dotted' ? 'dotted' : 'solid';
        return `display:inline-block;border:${Math.max(1, nn(b.strokeWidth, 2))}px ${st} ${E(b.strokeColor || '#101828')};border-radius:${nn(b.fxRadius, 14)}px;padding:${nn(b.fxPadY, 10)}px ${nn(b.fxPadX, 16)}px;`;
      }
      return '';
    }
    function fxImageCss(b) {
      if (b.fxFrame !== true) return '';
      const st = b.frameStyle === 'dashed' ? 'dashed' : b.frameStyle === 'dotted' ? 'dotted' : 'solid';
      return `outline:${nn(b.frameWidth, 2)}px ${st} ${E(b.frameColor || '#EF4444')};outline-offset:${nn(b.framePad, 8)}px;`;
    }
    function iconFrameCss(f, size) {
      const gsrc = (f.frame && typeof f.frame === 'object') ? Object.assign({}, f, f.frame) : f; /* V111 — frame.* gradient state */
      const shape = f.shape || 'rounded';
      const r = shape === 'circle' ? '999px' : shape === 'pill' ? Math.round(size * .62) + 'px' : '16px';
      const parts = [`border-radius:${r}`, 'display:inline-grid', 'place-items:center', `width:${size}px`, `height:${size}px`, 'overflow:hidden'];
      const mode = f.frameMode || f.mode || 'plain';
      if (mode === 'gradient') parts.push(`background:${gradCss(gsrc)}`, 'border:none');
      else if (mode === 'stroke') parts.push('background:transparent', `border:${Math.max(1, nn(f.strokeWidth, 2))}px ${f.frameStyle === 'dashed' ? 'dashed' : f.frameStyle === 'dotted' ? 'dotted' : 'solid'} ${E(f.strokeColor || '#101828')}`);
      else if (mode === 'none') parts.push('background:transparent', 'border:none');
      else parts.push(`background:${E(f.bg || '#EEF4FF')}`, 'border:none');
      return parts.join(';') + ';';
    }
    /* ---------- social: rich per-item styling (parity with editor) ---------- */
    function renderSocial(b) {
      const perRow = Math.max(1, Math.min(6, nn(b.perRow, 3)));
      const items = b.items || ['Instagram', 'YouTube', 'Telegram'];
      return `<div style="${shellStyle(b, 'center')}display:grid;grid-template-columns:repeat(${perRow},minmax(0,1fr));gap:${nn(b.gap, 10)}px;align-items:stretch;">${items.map(x => {
        const it = typeof x === 'string' ? { name: x, url: '#', icon: x, iconUrl: '', shape: 'circle', bg: '#fff', color: '#101828', border: '#EAECF0', borderWidth: 1 } : x;
        const radius = it.shape === 'circle' ? '999px' : it.shape === 'square' ? '14px' : '0';
        const bg = it.shape === 'none' ? 'transparent' : (it.bg || '#fff');
        const bd = it.shape === 'none' ? 'none' : `${nn(it.borderWidth, 1)}px solid ${it.border || '#EAECF0'}`;
        const icon = it.iconUrl ? `<img src="${E(it.iconUrl)}" alt="" style="width:${nn(it.iconSize, b.iconSize || 22)}px;height:${nn(it.iconSize, b.iconSize || 22)}px;object-fit:contain">` : `<span style="font-size:${nn(it.iconSize, b.iconSize || 22)}px;line-height:1">${E(it.icon || it.name || '•')}</span>`;
        return `<a href="${E(it.url || '#')}" target="_blank" rel="noopener" style="display:grid;place-items:center;gap:4px;padding:10px 6px;background:${E(bg)};color:${E(it.color || '#101828')};border:${bd};border-radius:${radius};text-decoration:none;font-size:12px;font-weight:700">${icon}${it.showLabel ? `<span>${E(it.name || '')}</span>` : ''}</a>`;
      }).join('')}</div>`;
    }

    /* ---------- V112 image size: aspect-ratio box (never breaks), legacy px kept for old pages ---------- */
    function sizeCss(b) {
      const s = b.modeSize;
      if (s === 'auto') return ''; /* natural image height */
      if (s === 'sm') return 'aspect-ratio:16/7;';
      if (s === 'lg') return 'aspect-ratio:4/3;';
      if (s === 'full') return 'aspect-ratio:3/4;';
      if (s === 'md') return 'aspect-ratio:16/10;';
      return b.modeHeight ? `height:${nn(b.modeHeight, 240)}px;` : 'aspect-ratio:16/10;';
    }
    /* ---------- V111 image: full mode support (single/carousel/gallery + height/align/crop/frame) ---------- */
    function renderImage(b) {
      const cap = rich(b.caption || plainToHtml(b.captionText || ''));
      const capStyle = `font-size:${nn(b.captionSize, 14)}px;color:${E(b.captionColor || '#475467')};text-align:${alignOf(b, 'center')};margin:${b.captionPosition === 'top' ? '0 0 10px' : '10px 0 0'};`;
      const hasCap = !!(b.caption || b.captionText);
      const capTop = hasCap && b.captionPosition === 'top' ? `<div style="${capStyle}">${cap}</div>` : '';
      const capBottom = hasCap && b.captionPosition !== 'top' && b.captionPosition !== 'overlay' ? `<div style="${capStyle}">${cap}</div>` : '';
      /* V250 — overlay caption sits INSIDE the image box (absolute), so it follows the
         image width/alignment; the dark default caption colour used to be unreadable on
         the dark gradient, so dark colours fall back to white here. */
      const ovCol = (() => { const c = String(b.captionColor || '').trim(); const m = c.match(/^#([0-9a-fA-F]{6})/); if (!c || c === '#475467') return '#FFFFFF'; if (m) { const v = parseInt(m[1], 16); const l = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)); if (l < 140) return '#FFFFFF'; } return E(c); })();
      const capOverlayIn = hasCap && b.captionPosition === 'overlay' ? `<div class="rv-img-cap" style="position:absolute;left:0;right:0;bottom:0;z-index:2;padding:28px 14px 12px;color:${ovCol};font-size:${nn(b.captionSize, 14)}px;text-align:${alignOf(b, 'center')};background:linear-gradient(transparent,rgba(0,0,0,.65));border-radius:0 0 ${nn(b.radius, 18)}px ${nn(b.radius, 18)}px;pointer-events:none">${cap}</div>` : '';
      const capOverlay = '';
      /* V250 — click-through link + optional hover zoom around the picture */
      const imgHref = b.link ? E(safeHref(withRef(String(b.link)))) : '';
      const linkWrap = (h) => imgHref ? `<a class="rv-img-link" href="${imgHref}"${linkAttrs(b)} style="display:block;color:inherit;text-decoration:none">${h}</a>` : h;
      const zoomCls = b.hoverZoom === true ? ' rv-img-zoom' : '';
      const RATIOS = { '1/1': '1/1', '4/3': '4/3', '3/2': '3/2', '16/9': '16/9', '21/9': '21/9', '3/4': '3/4', '2/3': '2/3', '9/16': '9/16' };
      const ratio = RATIOS[b.ratio] || '';
      const fit = E(b.objectFit || 'cover');
      const pos = `${nn(b.cropX, 50)}% ${nn(b.cropY, 50)}%`;
      const imgTag = (u, alt, fitOverride, natural) => `<img class="render-img" src="${E(imgTransform(u || ''))}" alt="${E(alt || '')}" ${imgAttrs(u || '', { loading: b.preload ? 'eager' : (b.loading || undefined), fetchpriority: b.preload ? 'high' : undefined, sizes: '100vw' })} style="display:block;width:100%;height:${natural ? 'auto' : '100%'};object-fit:${E(fitOverride || fit)};object-position:${pos};border-radius:${nn(b.radius, 18)}px;border:${nn(b.borderWidth)}px solid ${E(b.border || 'transparent')};box-shadow:${SHADOW[b.shadow || 'none']}${b.fxFrame === true ? ';' + fxImageCss(b) : ''}">`;
      const mode = b.imageMode || 'single';
      let body;
      if (mode === 'gallery') {
        const imgs = (b.images || []).filter(x => x && x.src);
        body = imgs.length
          ? `<div class="rv-gallery" style="display:grid;grid-template-columns:repeat(${Math.max(1, Math.min(4, nn(b.galleryCols, 2)))},minmax(0,1fr));gap:${Math.max(0, Math.min(80, nn(b.galleryGap, 10)))}px">${imgs.map(x => `<div style="${sizeCss(b)}overflow:hidden;border-radius:${nn(b.radius, 18)}px">${imgTag(x.src, x.alt, x.fit, b.modeSize === 'auto')}</div>`).join('')}</div>`
          : `<div style="${sizeCss(b) || 'aspect-ratio:16/10;'}display:grid;place-items:center;background:#F2F4F7;color:#98A2B3;border-radius:${nn(b.radius, 18)}px">تصویر را وارد کن</div>`;
        /* V111.1 — align applies to gallery too */
        body = `<div style="display:flex;justify-content:${JUSTIFY_MAP[b.align || 'center']};width:100%"><div style="width:100%">${body}</div></div>`;
      } else if (mode === 'carousel') {
        const slides = (b.images || []).filter(x => x && x.src);
        const h = sizeCss(b) || 'aspect-ratio:16/10;';
        body = slides.length > 1
          ? `<div class="render-carousel" data-autoplay="${b.modeAuto ? '1' : '0'}" data-interval="${nn(b.modeInterval, 4)}" data-slides='${E(JSON.stringify(slides))}' style="position:relative;${h}border-radius:${nn(b.radius, 18)}px;overflow:hidden;background:#F2F4F7;box-shadow:${SHADOW[b.shadow || 'none']}"><div class="render-carousel__track">${isBrowser ? imgTag(slides[0].src, slides[0].alt) : ''}</div><button class="car-prev" type="button">‹</button><button class="car-next" type="button">›</button><div class="car-dots"></div></div>`
          : `<div style="${h}overflow:hidden;border-radius:${nn(b.radius, 18)}px">${imgTag((slides[0] || {}).src || b.src, (slides[0] || {}).alt || b.alt, (slides[0] || {}).fit, b.modeSize === 'auto')}</div>`;
        /* V111.1 — align applies to carousel too (same wrapper as single mode) */
        body = `<div style="display:flex;justify-content:${JUSTIFY_MAP[b.align || 'center']};width:100%"><div style="width:100%">${body}</div></div>`;
      } else {
        const w = clampPct(b.width, 100);
        const al = alignOf(b, 'center');
        const pic = ratio
          ? `<div class="rv-img-box${zoomCls}" style="position:relative;aspect-ratio:${ratio};overflow:hidden;border-radius:${nn(b.radius, 18)}px">${imgTag(b.src, b.alt, b.objectFit, false)}${capOverlayIn}</div>`
          : `<div class="rv-img-box${zoomCls}" style="position:relative;${b.hoverZoom === true ? `overflow:hidden;border-radius:${nn(b.radius, 18)}px;` : ''}">${imgTag(b.src, b.alt, b.objectFit, true)}${capOverlayIn}</div>`;
        body = `<div style="display:flex;justify-content:${JUSTIFY_MAP[b.align || 'center']};width:100%"><div style="width:${w}%;${w < 100 ? 'flex:0 0 auto;' : ''}margin-inline:${al === 'center' ? 'auto' : al === 'right' ? '0 auto' : 'auto 0'}">${linkWrap(pic)}</div></div>`;
      }
      if (mode !== 'single') { if (capOverlayIn) body = `<div style="position:relative">${body}${capOverlayIn}</div>`; body = linkWrap(body); }
      return `<div style="${shellStyle(b, 'center')}">${capTop}${body}${capOverlay}${capBottom}</div>`;
    }
    /* ---------- V140 — Icon (unified): one element, 1..N icon cards.
       Each card = one source (Iconify SVG | emoji/text | image URL) + optional link
       + fill color (or no fill) + stroke. 1 card renders the classic single icon,
       2+ cards render the always-horizontal strip. Legacy data keeps working:
       - Icon without `icons` → built from b.icon / b.iconUrl / b.url
       - old strip items (icon, iconUrl, tint, color, url) → same fields, same meaning
       Iconify SVGs are stored IN the page data at pick time, so the live page never
       calls Iconify and ships only the icons it actually uses. */
    function iconItemsOf(b) {
      const arr = Array.isArray(b.icons) && b.icons.length ? b.icons : [{ icon: b.icon, iconUrl: b.iconUrl, iconSvg: b.iconSvg, url: b.url, target: b.target }];
      return arr.filter(x => x && typeof x === 'object' && (x.iconSvg || x.iconUrl || x.icon));
    }
    function iconGlyph(b, x, sz, col) {
      const sOn = x.strokeOn === true;
      const sCol = E(x.strokeColor || '#101828');
      const sW = Math.max(0.25, Math.min(12, nn(x.strokeWidth, 1.5)));
      if (x.iconSvg) {
        const svg = paintSvg(x.iconSvg, { size: sz, color: col, noFill: x.noFill === true, strokeOn: sOn, strokeColor: x.strokeColor || '#101828', strokeWidth: sW, palette: x.iconPalette === true });
        if (svg) return `<span style="display:block;width:${sz}px;height:${sz}px;line-height:0">${svg}</span>`;
      }
      if (x.iconUrl) {
        const outline = sOn ? `filter:drop-shadow(${sW}px 0 0 ${sCol}) drop-shadow(-${sW}px 0 0 ${sCol}) drop-shadow(0 ${sW}px 0 ${sCol}) drop-shadow(0 -${sW}px 0 ${sCol});` : '';
        if (x.tint === true) return `<span aria-hidden="true" style="display:block;width:${sz}px;height:${sz}px;background-color:${E(col)};-webkit-mask:url('${E(x.iconUrl)}') center/contain no-repeat;mask:url('${E(x.iconUrl)}') center/contain no-repeat;${outline}"></span>`;
        return `<img src="${E(x.iconUrl)}" alt="" loading="lazy" decoding="async" style="width:${sz}px;height:${sz}px;object-fit:contain;display:block;${outline}">`;
      }
      const fill = x.noFill === true ? 'color:transparent;-webkit-text-fill-color:transparent;' : '';
      const stroke = sOn ? `-webkit-text-stroke:${sW}px ${sCol};paint-order:stroke fill;` : '';
      return `<span style="font-size:${sz}px;line-height:1;${fill}${stroke}">${E(x.icon || '✦')}</span>`;
    }
    function renderIcon(b) {
      const items = iconItemsOf(b);
      if (!items.length) items.push({ icon: '✦' });
      const multi = items.length > 1;
      const sz = nn(b.size, 24);
      const boxDef = nn(b.box, multi ? 48 : 54);
      const op = `opacity:${Math.max(0, Math.min(100, nn(b.opacity, 100))) / 100};transform:rotate(${nn(b.rotate, 0)}deg);`;
      const cells = items.map(x => {
        const f = Object.assign({}, b, x);
        const col = x.color || b.color || '#175CD3';
        const glyph = iconGlyph(b, x, sz, col);
        let el;
        if (b.frameMode === 'none') el = `<span style="display:inline-grid;place-items:center;color:${E(col)};${op}">${glyph}</span>`;
        else {
          const bx = nn(x.box, boxDef);
          el = `<span style="${iconFrameCss(f, bx)}padding:${Math.max(0, Math.round((bx - sz) / 2))}px;box-sizing:content-box;color:${E(col)};${op}">${glyph}</span>`;
        }
        const tgt = x.newTab === true ? '_blank' : (x.target || '_self');
        const href = String(x.url || '').trim();
        return href && href !== '#' ? `<a href="${E(withRef(href))}" target="${E(tgt)}"${tgt === '_blank' ? ' rel="noopener"' : ''} style="display:inline-flex;text-decoration:none;color:inherit">${el}</a>` : el;
      });
      /* legacy: element-level link (old single icon / old strip) when no card has its own */
      const legacyUrl = Array.isArray(b.icons) && b.icons.length && b.url && b.url !== '#' && !items.some(x => x.url) ? String(b.url) : '';
      const wrapLegacy = (inner) => legacyUrl ? `<a href="${E(withRef(legacyUrl))}" target="${E(b.target || '_self')}" style="text-decoration:none;color:inherit">${inner}</a>` : inner;
      if (!multi) return `<div style="${shellStyle(b, 'center')}display:flex;justify-content:${JUSTIFY_MAP[b.align || 'center']}">${wrapLegacy(cells[0])}</div>`;
      const strip = `<span style="display:flex;flex-wrap:nowrap;align-items:center;gap:${nn(b.gap, 12)}px">${cells.join('')}</span>`;
      return `<div class="rava-iconrow" style="${shellStyle(b, 'center')}display:flex;flex-wrap:nowrap;overflow-x:auto;justify-content:${JUSTIFY_MAP[b.align || 'center']};align-items:center">${wrapLegacy(strip)}</div>`;
    }
    /* ---------- V114 — Scroll Point (editor-only anchor).
       Builder/editor/preview → a small pill so the author can see + select it.
       Published page → an invisible zero-height anchor div; the runtime scroll
       handler (injected by shell()) lands every #sp-<id> link on this exact
       position, so content below the point scrolls into view. */
    function renderScrollPoint(b, context) {
      /* V116 — single markup source, three contexts:
         'edit'      -> thin ghost bar so the point is selectable on the canvas
         'preview'   -> blue capsule (user requirement: visible ONLY in preview)
         undefined   -> published page: invisible zero-height anchor */
      const anchorId = 'sp-' + E(String(b.id || ''));
      if (context !== 'edit' && context !== 'preview') { const sm = nn(b.height, 0); return `<div id="${anchorId}" data-rava-scroll-point="1" aria-hidden="true" style="position:relative;height:0;width:100%;overflow:visible;box-sizing:border-box;${sm ? `scroll-margin-top:${sm}px;` : ''}"></div>`; }
      const label = E(((b.anchorLabel || b.name) || '').trim() || fb('scrollPointLabel', 'نقطه اسکرول'));
      if (context === 'edit') return `<div class="rava-scrollpoint sp-edit-bar" data-rava-scroll-point-edit="1" style="display:flex;align-items:center;min-height:16px"><span style="flex:1;border-top:2px dashed #B2CCFF;opacity:.55"></span></div>`;
      return `<div class="rava-scrollpoint" style="${shellStyle(b, 'center')}position:relative;display:flex;align-items:center;gap:10px;justify-content:${JUSTIFY_MAP[b.align || 'center']};min-height:30px"><span style="width:30%;max-width:120px;border-top:2px dashed #B2CCFF"></span><span style="display:inline-flex;align-items:center;gap:6px;background:#175CD3;color:#fff;font-size:11px;font-weight:800;padding:4px 12px;border-radius:999px;white-space:nowrap;direction:rtl">⌖ ${label}</span><span style="width:30%;max-width:120px;border-top:2px dashed #B2CCFF"></span></div>`;
    }
    /* ---------- carousel (static first slide in browser contexts) ---------- */
    function renderCarousel(b) {
      const slides = Array.isArray(b.slides) ? b.slides : [];
      const staticSlide = isBrowser && slides.length ? `<img src="${E(slides[0].src || slides[0].url || '')}" alt="${E(slides[0].alt || '')}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : '';
      return `<div class="render-carousel" data-autoplay="${b.autoplay ? '1' : '0'}" data-interval="${nn(b.interval, 4)}" data-slides='${E(JSON.stringify(slides))}' style="${shellStyle(b, 'center')}position:relative;aspect-ratio:${E(b.aspect || '16/9')};border-radius:${nn(b.radius, 18)}px;overflow:hidden;background:#F2F4F7;box-shadow:${SHADOW[b.shadow || 'none']}"><div class="render-carousel__track">${staticSlide}</div>${b.showArrows !== false ? `<button class="car-prev" type="button">‹</button><button class="car-next" type="button">›</button>` : ''}${b.showDots !== false ? `<div class="car-dots"></div>` : ''}</div>`;
    }

    /* ---------- V133 — site shell: هدر و فوتر ----------
       یک رندرر برای هر سه محیط: سایت منتشرشده، بوم ویرایش و پیش‌نمایش بیلدر.
       هدر/فوتر از نظر «جای‌گذاری» ویژه‌اند (اول/آخر صفحه) ولی مارک‌آپشان از همین
       switch می‌آید؛ بیلدر بلوک‌ها را قبل از رندر به بالا/پایین می‌برد و سرور هم
       قبل از renderBlocks همین کار را می‌کند. در ادیتور، بلوک خاموش به‌جای خروجی
       خالی یک کارت راهنما می‌دهد تا nodeEl خطا ندهد. */
    function shellPatternBg(base, o = {}) {
      const pid = String((o && o.patternId) || '');
      if (!pid) return '';
      const surf = landingSurface({ backgroundType: 'blob', bg: base, backgroundPatternId: pid, patternColor: o.patternColor, patternSize: o.patternSize, patternOpacity: o.patternOpacity, patternBase: base });
      return [surf.backgroundImage, surf.backgroundColor].filter(x => x && x !== 'transparent' && x !== 'none').join(',');
    }
    function renderShellHeader(h) {
      const d = h && typeof h === 'object' ? h : {};
      const ctx = localCtx();
      if (d.enabled === false) {
        if (ctx === 'edit') return '<div style="padding:14px;text-align:center;border:1px dashed #FECACA;border-radius:12px;color:#B42318;background:#FFF7F7;font-size:12px;font-weight:800;box-sizing:border-box">هدر خاموش است — از تب محتوا روشنش کن (بدون حذف)</div>';
        return '';
      }
      const hh = Math.max(44, nn(d.headerHeight, 64));
      const glassMode = d.bgMode === 'glass';
      let bgCss = d.bgMode === 'transparent' ? 'transparent' : glassMode ? hexA(d.bg || '#FFFFFF', Math.max(0.05, Math.min(1, nn(d.bgOpacity, 72) / 100))) : E(d.bg || '#FFFFFF');
      const patBg = shellPatternBg(d.bg || '#FFFFFF', { patternId: d.backgroundPatternId, patternColor: d.patternColor, patternSize: d.patternSize, patternOpacity: d.patternOpacity });
      if (patBg) bgCss = patBg;
      const stickyMode = ['normal', 'top', 'fixed', 'smart'].includes(d.stickyMode) ? d.stickyMode : 'normal';
      const posCss = (!ctx && stickyMode === 'fixed') ? `position:fixed;top:0;left:0;right:0;` : (stickyMode === 'normal' ? 'position:relative;' : `position:sticky;top:0;`);
      const logoH0 = Math.max(20, Math.round(hh * 0.42));
      /* فاصله‌گذاری: هم pad چهارطرفهٔ کارت «فاصله و اندازه» در تب استایل و هم padX/padY قدیمی پشتیبانی می‌شوند */
      const pt = nn(d.padTop, nn(d.padY, 12)), pb = nn(d.padBottom, nn(d.padY, 12)), pl = nn(d.padLeft, nn(d.padX, 18)), pr = nn(d.padRight, nn(d.padX, 18));
      /* V134 — width اینجا ست نمی‌شود؛ قانون CSS (.rava-hdr width:100cqw) full-bleed واقعی می‌دهد.
         width:100% اینلاین، قاعدهٔ 100cqw را override می‌کرد و هدر در ستون ۳۴۶px گیر می‌کرد. */
      const sh = `${posCss}z-index:${nn(d.zIndex, 50)};--hz:${nn(d.zIndex, 50)};--hh:${hh}px;--hg:${nn(d.gap, 26)}px;--lks:${nn(d.linkSize, 14)}px;--lhw:${nn(d.linkWeight, 600)};--lhi:${logoH0}px;box-sizing:border-box;color:${E(d.fg || '#101828')};padding:${pt}px ${pr}px ${pb}px ${pl}px;${glassMode ? `-webkit-backdrop-filter:blur(${nn(d.blur, 10)}px);backdrop-filter:blur(${nn(d.blur, 10)}px);` : ''}`;
      const dataAttrs = ` data-rava-header="1" data-sticky="${E(stickyMode)}" data-mm="${E(d.mobileMenu || 'drawer')}" data-shrink="${d.scrollShrink ? '1' : '0'}" data-glass-scroll="${d.glassOnScroll ? '1' : '0'}" data-base-bg="${E(bgCss)}" data-ht="${hh}" data-blur="${nn(d.blur, 10)}" data-translucent="${glassMode || d.bgMode === 'transparent' ? '1' : '0'}"`;
      const logoUrl = String(d.logoUrl || '');
      const logoText = String(d.logoText || 'RAVA');
      const useImg = logoUrl && (d.logoType === 'image' || d.logoType !== 'text');
      const logoH = logoH0;
      const logoInner = useImg
        ? `<img src="${E(imgTransform(logoUrl))}" ${imgAttrs(logoUrl, { sizes: '120px' })} alt="${E(logoText)}" style="display:block;height:${logoH}px;width:auto;max-width:180px;object-fit:contain">`
        : `<span style="font-size:${nn(d.logoSize, 22)}px;font-weight:900;letter-spacing:-.01em;color:currentColor;white-space:nowrap">${E(logoText)}</span>`;
      const navs = (Array.isArray(d.nav) ? d.nav : []).filter(x => x && String(x.label || '').trim());
      const linkHref = (x) => (x && (x.linkKind || x.target)) ? saleHref(x) : withRef(String((x && x.url) || '#'));
      /* V134 — آیتم سفارشی هدر: عکس + لینک + alt + اندازه (ریپیتر) */
      const customItems = (Array.isArray(d.items) ? d.items : []).filter(x => x && String(x.src || '').trim());
      const customItemHtml = customItems.map(x => `<a class="rava-hdr-custom" href="${E(withRef(String(x.url || '#')))}"${x.newTab ? ' target="_blank" rel="noopener"' : ''}><img src="${E(imgTransform(x.src))}" alt="${E(x.alt || '')}" style="height:${nn(x.size, 28)}px;width:auto;max-width:120px;object-fit:contain;display:block"></a>`).join('');
      const navItem = (x) => {
        const sub = Array.isArray(x.submenu) ? x.submenu.filter(s => s && String(s.label || '').trim()) : [];
        const tgt = (o) => (o && o.newTab) ? ' target="_blank" rel="noopener"' : '';
        return `<div class="rava-hdr-item${sub.length ? ' has-sub' : ''}"><a class="rava-hdr-link" href="${E(linkHref(x))}"${tgt(x)}>${E(x.label)}${x.icon ? ` <span class="rava-hdr-ico-in" aria-hidden="true">${E(x.icon)}</span>` : ''}${sub.length ? ' <span class="rava-hdr-caret" aria-hidden="true">▾</span>' : ''}</a>${sub.length ? `<div class="rava-hdr-sub">${sub.map(s => `<a href="${E(withRef(String(s.url || '#')))}"${tgt(s)}>${E(s.label)}${s.icon ? ` <span aria-hidden="true">${E(s.icon)}</span>` : ''}</a>`).join('')}</div>` : ''}</div>`;
      };
      const navSlot = `<nav class="rava-hdr__nav" style="--lk:${E(d.linkColor || '#101828')};--lk-hover:${E(d.linkHoverColor || d.linkColor || '#175CD3')};--lk-active:${E(d.linkActiveColor || d.linkHoverColor || '#175CD3')}">${navs.map(navItem).join('')}</nav>`;
      const logoSlot = `<a class="rava-hdr__logo" href="/" aria-label="${E(logoText)}">${logoInner}</a>`;
      /* V134 — سبد/جستجو/زبان از هدر حذف شدند (درخواست مالک). فقط آیتم سفارشی + CTA. */
      const icons = customItemHtml ? [] : [];
      void icons;
      const cta = d.ctaEnabled !== false && String(d.ctaLabel || '').trim() ? `<a class="rava-hdr-cta" href="${E(withRef(String(d.ctaUrl || '#')))}" style="background:${E(d.ctaBg || '#175CD3')};color:${E(d.ctaFg || '#FFFFFF')};border-radius:${nn(d.ctaRadius, 12)}px">${E(d.ctaLabel)}</a>` : '';
      /* V143 — دکمهٔ دوم (مثلاً ورود) برای هدر سراسری */
      const cta2 = d.cta2Enabled && String(d.cta2Label || '').trim() ? `<a class="rava-hdr-cta rava-hdr-cta--2" href="${E(withRef(String(d.cta2Url || '#')))}" style="background:${E(d.cta2Bg || 'transparent')};color:${E(d.cta2Fg || d.fg || '#101828')};border:1px solid ${E(d.cta2Border || 'currentColor')};border-radius:${nn(d.ctaRadius, 12)}px">${E(d.cta2Label)}</a>` : '';
      const sideSlot = `<div class="rava-hdr__side">${customItemHtml}${cta2}${cta}${d.mobileMenu !== 'accordion' ? `<button type="button" class="rava-hdr__burger" data-hdr-burger aria-label="منو" aria-expanded="false"><span></span><span></span><span></span></button>` : ''}</div>`;
      const cls = { 'logo-start': 'rava-hdr--start', 'logo-center': 'rava-hdr--center', 'logo-end': 'rava-hdr--end', 'logo-end-nav-end': 'rava-hdr--endnav', 'nav-only': 'rava-hdr--navonly' }[d.layout] || 'rava-hdr--start';
      const searchPanel = '';
      const accBody = d.mobileMenu === 'accordion' ? `<div class="rava-hdr__acc" data-hdr-acc>${navs.map(x => { const sub = Array.isArray(x.submenu) ? x.submenu.filter(s => s && String(s.label || '').trim()) : []; return `<div class="rava-hdr-acc__item${sub.length ? ' has-sub' : ''}">${sub.length ? `<button type="button" class="rava-hdr-acc__toggle" data-hdr-acc-toggle aria-expanded="false"><span>${E(x.label)}</span><span aria-hidden="true">⌄</span></button><div class="rava-hdr-acc__sub" hidden>${sub.map(s => `<a href="${E(withRef(String(s.url || '#')))}">${E(s.label)}</a>`).join('')}</div>` : `<a class="rava-hdr-acc__link" href="${E(linkHref(x))}">${E(x.label)}</a>`}</div>`; }).join('')}</div>` : '';
      const drawerBody = d.mobileMenu !== 'accordion' ? `<div class="rava-hdr__drawer" data-hdr-drawer data-mm="${E(d.mobileMenu || 'drawer')}" aria-hidden="true"><div class="rava-hdr-drawer__head"><span class="rava-hdr-drawer__brand">${E(logoText)}</span><button type="button" class="rava-hdr-drawer__close" data-hdr-close aria-label="بستن">×</button></div><nav class="rava-hdr-drawer__nav">${navs.map(x => `<a href="${E(linkHref(x))}"${x.newTab ? ' target="_blank" rel="noopener"' : ''}>${E(x.label)}</a>${(Array.isArray(x.submenu) ? x.submenu.filter(s => s && String(s.label || '').trim()) : []).map(s => `<a class="rava-hdr-drawer__sub" href="${E(withRef(String(s.url || '#')))}" style="padding-inline-start:22px;opacity:.8;font-size:.92em">${E(s.label)}</a>`).join('')}`).join('')}</nav>${cta2 ? `<a class="rava-hdr-drawer__cta" href="${E(withRef(String(d.cta2Url || '#')))}" style="background:transparent;color:inherit;border:1px solid currentColor">${E(d.cta2Label)}</a>` : ''}${cta ? `<a class="rava-hdr-drawer__cta" href="${E(withRef(String(d.ctaUrl || '#')))}" style="background:${E(d.ctaBg || '#175CD3')};color:${E(d.ctaFg || '#FFFFFF')}">${E(d.ctaLabel)}</a>` : ''}</div><div class="rava-hdr__scrim" data-hdr-scrim hidden></div>` : '';
      return `<header class="rava-hdr ${cls}${glassMode ? ' rava-hdr--glass' : ''}${ctx ? ' rava-hdr--editctx' : ''}"${dataAttrs} style="${sh}background:${bgCss};${d.borderColor ? `border-bottom:1px solid ${E(d.borderColor)};` : ''}${d.shadow && SHADOW[d.shadow] ? `box-shadow:${SHADOW[d.shadow]};` : ''}${d.maxWidth ? `--hmax:${nn(d.maxWidth, 1200)}px;` : ''}"><div class="rava-hdr__inner"${d.maxWidth ? ` style="max-width:${nn(d.maxWidth, 1200)}px;margin-inline:auto;width:100%"` : ''}><div class="rava-hdr__slot rava-hdr__logo-slot">${logoSlot}</div><div class="rava-hdr__slot rava-hdr__nav-slot">${navSlot}</div><div class="rava-hdr__slot rava-hdr__side-slot">${sideSlot}</div></div>${searchPanel}${accBody}${drawerBody}</header>`;
    }
    function renderShellFooter(f) {
      const d = f && typeof f === 'object' ? f : {};
      if (d.enabled === false) {
        if (localCtx() === 'edit') return '<div style="padding:14px;text-align:center;border:1px dashed #FECACA;border-radius:12px;color:#B42318;background:#FFF7F7;font-size:12px;font-weight:800;box-sizing:border-box">فوتر خاموش است — از تب محتوا روشنش کن (بدون حذف)</div>';
        return '';
      }
      const fg = E(d.fg || '#E2E8F0'), link = E(d.linkColor || '#CBD5E1'), linkH = E(d.linkHoverColor || '#FFFFFF'), muted = E(d.mutedColor || '#94A3B8');
      let bgCss = d.bgType === 'gradient' ? `linear-gradient(${E(d.bgGradientDir || '180deg')},${E(d.bg || '#101828')},${E(d.bgGradient2 || d.bg2 || '#1E293B')})` : (d.bgType === 'image' && d.bgImage ? `linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.25)),url('${E(d.bgImage)}') center/cover no-repeat` : E(d.bg || '#101828'));
      const patBg = shellPatternBg(d.bg || '#101828', { patternId: d.bgPatternId, patternColor: d.patternColor, patternSize: d.patternSize, patternOpacity: d.patternOpacity });
      if (patBg) bgCss = patBg;
      const hmode = ['compact', 'tall', 'auto'].includes(d.footerHeight) ? d.footerHeight : 'auto';
      const hf = (hmode === 'compact' ? 0.6 : hmode === 'tall' ? 1.6 : 1);
      const pTop = Math.round(nn(d.padTop, nn(d.padY, nn(d.innerPadY, 32))) * hf);
      const pBot = Math.round(nn(d.padBottom, nn(d.padY, nn(d.innerPadY, 32))) * hf);
      const padL = nn(d.padLeft, nn(d.padX, 24)), padR = nn(d.padRight, nn(d.padX, 24));
      const brandUrl = String(d.logoUrl || '');
      const brand = brandUrl ? `<img src="${E(imgTransform(brandUrl))}" ${imgAttrs(brandUrl, { sizes: '160px' })} alt="${E(d.brandName || '')}" style="display:block;max-height:44px;max-width:160px;object-fit:contain">` : `<span style="font-size:22px;font-weight:900;color:${fg}">${E(d.brandName || 'RAVA')}</span>`;
      const groups = (Array.isArray(d.groups) ? d.groups : []).filter(g => g && (String(g.title || '').trim() || (Array.isArray(g.links) && g.links.some(x => x && String(x.label || '').trim()))));
      const socials = (Array.isArray(d.socials) ? d.socials : []).filter(x => x && (String(x.label || '').trim() || String(x.icon || '').trim() || String(x.iconUrl || '').trim()));
      const bottomLinks = (Array.isArray(d.bottomLinks) ? d.bottomLinks : []).filter(x => x && String(x.label || '').trim());
      const accMobile = d.footerAccordionMobile !== false;
      const cols = Math.max(1, Math.min(5, nn(d.columns, 3)));
      const gridCols = d.colsLayout === 'grid' ? cols : Math.max(1, Math.min(5, groups.length || cols));
      const groupHtml = groups.map(g => {
        const links = (Array.isArray(g.links) ? g.links : []).filter(x => x && String(x.label || '').trim());
        const title = String(g.title || '').trim();
        return `<div class="rava-ftr__group${accMobile && title ? ' rava-ftr__group--acc' : ''}">${title ? (accMobile ? `<button type="button" class="rava-ftr__gtitle rava-ftr__gtitle--btn" data-ftr-acc-toggle aria-expanded="false"><span>${rich(title)}</span><span class="rava-ftr__caret" aria-hidden="true">⌄</span></button>` : `<div class="rava-ftr__gtitle">${rich(title)}</div>`) : ''}${links.length ? `<div class="rava-ftr__glinks"${accMobile && title ? ' hidden' : ''}>${links.map(x => `<a href="${E(withRef(String(x.url || '#')))}"${x.newTab ? ' target="_blank" rel="noopener"' : ''}${x.icon ? ` data-ico="${E(x.icon)}"` : ''}>${E(x.label)}</a>`).join('')}</div>` : ''}</div>`;
      }).join('');
      const socialHtml = (d.socialEnabled !== false && socials.length) ? `<div class="rava-ftr__social">${socials.map(x => `<a href="${E(withRef(String(x.url || '#')))}" target="_blank" rel="noopener" aria-label="${E(x.label || '')}" title="${E(x.label || '')}">${x.iconUrl ? `<img src="${E(x.iconUrl)}" alt="" style="width:18px;height:18px;object-fit:contain;display:block">` : `<span aria-hidden="true" style="font-size:17px;line-height:1;display:inline-flex">${shellIcon(x.icon, '●')}</span>`}</a>`).join('')}</div>` : '';
      const newsletter = d.newsletterEnabled ? `<div class="rava-ftr__news"><div class="rava-ftr__news-label" style="color:${fg}">${E(d.newsletterLabel || 'عضویت در خبرنامه')}</div><form class="rava-ftr__news-form" data-rava-newsletter><input type="email" name="email" required placeholder="${E(d.newsletterPlaceholder || 'ایمیل شما')}" aria-label="ایمیل"><button type="submit">${E(d.newsletterButton || 'عضویت')}</button></form></div>` : '';
      const yearStr = String(new Date().getFullYear());
      const copyrightHtml = d.copyright ? `<div class="rava-ftr__copy" style="color:${muted}" data-year-token="1">${rich(String(d.copyright)).replace(/\{year\}/g, yearStr)}</div>` : '';
      const bottomHtml = (d.copyright || bottomLinks.length) ? `<div class="rava-ftr__bottom"${d.divider !== false ? ` style="border-top:1px solid ${E(d.dividerColor || 'rgba(148,163,184,.25)')};margin-top:26px;padding-top:18px"` : ''}>${copyrightHtml}${bottomLinks.length ? `<nav class="rava-ftr__bottom-links" style="--lk:${link};--lk-hover:${linkH}">${bottomLinks.map(x => `<a href="${E(withRef(String(x.url || '#')))}"${x.newTab ? ' target="_blank" rel="noopener"' : ''}${x.icon ? ` data-ico="${E(x.icon)}"` : ''}>${E(x.label)}</a>`).join('')}</nav>` : ''}</div>` : '';
      return `<footer class="rava-ftr${accMobile ? ' rava-ftr--acc' : ''}" data-rava-footer="1" style="position:relative;box-sizing:border-box;background:${bgCss};color:${fg};padding:${Math.max(12, pTop)}px ${padR}px ${Math.max(12, pBot)}px ${padL}px;font-size:14px"><div class="rava-ftr__inner"><div class="rava-ftr__top"><div class="rava-ftr__brand">${brand}${d.brandDesc ? `<div class="rava-ftr__desc" style="color:${muted};max-width:360px;line-height:1.9;margin-top:10px">${rich(String(d.brandDesc))}</div>` : ''}</div>${newsletter}</div>${groups.length ? `<div class="rava-ftr__grid" style="grid-template-columns:repeat(${gridCols},minmax(0,1fr));--lk:${link};--lk-hover:${linkH}">${groupHtml}</div>` : ''}${socialHtml}${bottomHtml}${d.backTop ? `<div style="text-align:center;margin-top:18px"><button type="button" class="rava-ftr__top-btn" onclick="window.scrollTo({top:0,behavior:'smooth'})" style="background:transparent;border:1px solid ${muted};color:${fg};border-radius:999px;padding:8px 18px;font:inherit;font-size:13px;cursor:pointer">${E(d.backTopLabel || '↑ بازگشت به بالا')}</button></div>` : ''}</div></footer>`;
    }

    /* ---------- section markup (shared by Section + Pop Up) ---------- */
    function renderSectionMarkup(b0) {
          /* V147 — the section is the canonical container. Everything the
             inspector's single «اندازه و فاصله» card sets is applied here, in
             ONE place, for both the published page and the builder canvas:
             width mode + position, top/bottom margins, min height with content
             position, padding (4 sides) and the gap between children. The inner
             layer publishes its padding as --rv-pl/--rv-pr so «Edge to edge»
             children can escape it exactly. */
          const b = legacyWidth(b0);
          const mode = widthModeOf(b);
          const bleed = mode === 'bleed';
          const mt = nn(b.marginTop), mb = nn(b.marginBottom);
          let box = '';
          if (bleed) box = RAVA_BLEED_CSS;
          else if (mode === 'edge') box = EDGE_CSS;
          else if (mode === 'pct') {
            const pos = boxAlignOf(b.boxAlign ? b : Object.assign({}, b, { align: undefined }), 'center');
            box = `width:100%;max-width:${Math.max(1, clampPct(b.maxWidth, 100))}%;` + (pos === 'center' ? 'margin-left:auto;margin-right:auto;' : pos === 'right' ? 'margin-left:auto;margin-right:0;' : 'margin-left:0;margin-right:auto;');
          } else box = 'width:100%;max-width:100%;';
          const hm = b.sectionHeight || 'auto';
          const minH = hm === 'fixed' ? Math.max(0, nn(b.height, nn(b.minHeight, 0))) : Math.max(0, nn(b.minHeight, 0));
          const useMin = hm !== 'auto' && minH > 0 || (hm === 'auto' && nn(b.minHeight, 0) > 0);
          const vpos = b.contentPos === 'center' ? 'center' : b.contentPos === 'bottom' ? 'flex-end' : 'flex-start';
          const heightCss = useMin ? `min-height:${minH || nn(b.minHeight, 0)}px;display:flex;flex-direction:column;justify-content:${vpos};` : '';
          const outer = `position:relative;background:${bgStyle(b)};${box}${mt ? `margin-top:${mt}px;` : ''}${mb ? `margin-bottom:${mb}px;` : ''}${heightCss}border-radius:${bleed ? 0 : nn(b.radius)}px;box-shadow:${SHADOW[b.shadow || 'none'] || 'none'};text-align:${alignOf(b, 'right')};box-sizing:border-box;`;
          const innerMax = Math.max(320, nn(b.innerMaxWidth, 1200));
          const pt = nn(b.padTop ?? b.padY), pr = nn(b.padRight ?? b.padX), pbm = nn(b.padBottom ?? b.padY), pl = nn(b.padLeft ?? b.padX);
          const innerPad = `padding:${pt}px ${pr}px ${pbm}px ${pl}px;--rv-pl:${pl}px;--rv-pr:${pr}px;`;
          const innerGap = Math.max(0, nn(b.innerGap, 0));
          const innerFlow = innerGap > 0 ? `display:flex;flex-direction:column;gap:${innerGap}px;` : '';
          return `<section class="render-section ${bleed ? 'render-section--fullbleed' : ''}" style="${outer}"><div class="render-section__inner" data-rava-inner="1" style="width:100%;max-width:${innerMax}px;margin:0 auto;${innerPad}${innerFlow}box-sizing:border-box">${renderBlocks(b.blocks || [])}</div></section>`;
    }
    /* ============================================================
       V137 — Marquee (عناصر اصلی): نوار تصاویرِ متحرک و بی‌انتها.
       لوگوی مشتری‌ها، اسکرین‌شات نظرات، نشان‌ها… هر تصویر JPG/PNG/WebP/SVG
       یا هر URL. حرکت با CSS خالص (بدون JS) است؛ پس بوم بیلدر، پیش‌نمایش و
       سایت منتشرشده دقیقاً یک‌جور حرکت می‌کنند.
       - دو نیمهٔ یکسان پشت هم + translateX(-50%) = حلقهٔ بی‌درز
       - فاصلهٔ آیتم‌ها با padding هر آیتم ساخته می‌شود (نه flex gap) تا دو نیمه
         دقیقاً هم‌عرض باشند و در نقطهٔ برگشت هیچ پرشی دیده نشود.
       - سرعت (۱ تا ۱۰۰) به px/s تبدیل می‌شود؛ مدت انیمیشن از عرض تخمینی
         یک نیمه به دست می‌آید تا با کم/زیاد شدن تصاویر، سرعت حس‌شده ثابت بماند.
       ============================================================ */
    const IMQ_CSS = '<style>@keyframes ravaImq{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}.rava-imq__track{animation:ravaImq var(--imq-dur,30s) linear infinite}.rava-imq[data-dir="ltr"] .rava-imq__track{animation-direction:reverse}.rava-imq[data-pause="1"]:hover .rava-imq__track{animation-play-state:paused}.rava-imq[data-gray="1"] .rava-imq__img{filter:grayscale(1);transition:filter .3s,opacity .3s}.rava-imq[data-gray="1"] .rava-imq__item:hover .rava-imq__img{filter:none;opacity:1!important}@media (prefers-reduced-motion:reduce){.rava-imq__track{animation-duration:calc(var(--imq-dur,30s)*3)}}@media (max-width:640px){.rava-imq__img{height:var(--imq-hm)!important}}</style>';
    function renderMediaMarquee(b) {
      const inEditor = !!localCtx();
      const all = Array.isArray(b.items) ? b.items.filter(x => x && typeof x === 'object') : [];
      const real = all.filter(x => String(x.src || '').trim());
      /* روی سایت واقعی فقط تصاویرِ دارای آدرس؛ در بیلدر جای خالی‌ها هم دیده می‌شوند */
      const items = inEditor ? all : real;
      const h = Math.max(16, Math.min(240, nn(b.logoHeight, 48)));
      const hm = Math.max(12, Math.min(240, nn(b.mobileLogoHeight, Math.round(h * 0.75))));
      const gap = Math.max(0, Math.min(240, nn(b.gap, 56)));
      const speed = Math.max(1, Math.min(100, nn(b.speed, 40)));
      const op = Math.max(10, Math.min(100, nn(b.itemOpacity, 100))) / 100;
      const rad = Math.max(0, Math.min(120, nn(b.itemRadius, 0)));
      const titleHtml = String(b.title || '').trim()
        ? `<div class="rava-imq__title" style="text-align:${alignOf(b, 'center')};font-size:${nn(b.titleSize, 14)}px;font-weight:${nn(b.titleWeight, 700)};color:${E(b.titleColor || '#667085')};letter-spacing:${nn(b.titleLetter, 0)}px;margin:0 0 ${nn(b.titleGap, 18)}px;${fontOf(b)}">${rich(b.title)}</div>`
        : '';
      if (!items.length) {
        if (!inEditor) return '';
        return `<div style="${shellStyle(b, 'center')}">${titleHtml}<div style="padding:22px;border:1px dashed #CBD5E1;border-radius:14px;color:#667085;font-size:13px;text-align:center;background:#F8FAFC">Marquee — از تب «محتوا» تصویر اضافه کن</div></div>`;
      }
      const one = (x, hidden) => {
        const src = String(x.src || '').trim();
        const img = src
          ? `<img class="rava-imq__img" src="${E(imgTransform(src))}" alt="${hidden ? '' : E(x.alt || '')}" loading="lazy" decoding="async" draggable="false" style="display:block;height:${h}px;width:auto;max-width:none;object-fit:contain;border-radius:${rad}px;opacity:${op}">`
          : `<span class="rava-imq__img" style="display:grid;place-items:center;height:${h}px;width:${Math.round(h * 2.4)}px;border-radius:${Math.max(rad, 10)}px;background:#EEF2F6;color:#98A2B3;font-size:${Math.max(10, Math.round(h * 0.26))}px;font-weight:800;letter-spacing:.08em;opacity:${op}">LOGO</span>`;
        const inner = x.link && !inEditor
          ? `<a href="${E(withRef(String(x.link)))}"${x.newTab === false ? '' : ' target="_blank" rel="noopener"'} style="display:block;line-height:0"${hidden ? ' tabindex="-1"' : ''}>${img}</a>`
          : img;
        return `<div class="rava-imq__item" style="flex:none;padding:0 ${gap / 2}px;line-height:0">${inner}</div>`;
      };
      /* هر نیمه حداقل ~۱۰ آیتم دارد تا روی صفحهٔ عریض هم نوار خالی نماند */
      const reps = Math.max(1, Math.ceil(10 / items.length));
      const setOf = (hidden) => { let out = ''; for (let r = 0; r < reps; r++) out += items.map(x => one(x, hidden || r > 0)).join(''); return out; };
      const halfPx = reps * items.length * (h * 2.4 + gap);
      const pxPerSec = speed * 3;
      const dur = Math.max(4, Math.round((halfPx / pxPerSec) * 10) / 10);
      const fadeW = Math.max(0, Math.min(30, nn(b.fadeWidth, 8)));
      const mask = b.fadeEdges === false || fadeW === 0 ? '' : `-webkit-mask-image:linear-gradient(90deg,transparent,#000 ${fadeW}%,#000 ${100 - fadeW}%,transparent);mask-image:linear-gradient(90deg,transparent,#000 ${fadeW}%,#000 ${100 - fadeW}%,transparent);`;
      const bg = b.bg && b.bg !== 'transparent' && !/^#[0-9a-fA-F]{6}00$/.test(b.bg) ? `background:${E(b.bg)};` : '';
      const marqueeBackgroundCSS = b.marqueeBackground && String(b.marqueeBackground).trim() ? `background-image:url(${E(imgTransform(String(b.marqueeBackground)))});background-size:cover;background-position:center;` : '';
      const pv = nn(b.bandPadY, 0);
      const dir = b.direction === 'ltr' ? 'ltr' : 'rtl';
      return `<div class="rava-imq-wrap" style="${shellStyle(b, 'center')}">${titleHtml}<div class="rava-imq" data-dir="${dir}" data-pause="${b.pauseOnHover === false ? '0' : '1'}" data-gray="${b.grayscale === true ? '1' : '0'}" style="position:relative;overflow:hidden;direction:ltr;${marqueeBackgroundCSS}${bg}border-radius:${nn(b.radius, 0)}px;padding:${pv}px 0;--imq-dur:${dur}s;--imq-hm:${hm}px;${mask}">${IMQ_CSS}<div class="rava-imq__track" style="display:flex;align-items:center;width:max-content;will-change:transform">${setOf(false)}<div style="display:contents" aria-hidden="true">${setOf(true)}</div></div></div></div>`;
    }

    /* ============================================================
       V137 — Pop Up (عناصر دیگر): یک «Section» کامل که روی سایت منتشرشده
       به‌صورت پنجرهٔ شناور ظاهر می‌شود. هر عنصری (فرم، متن، دکمه، تصویر…)
       داخلش می‌نشیند؛ همان رندررِ سکشن استفاده می‌شود.
       - بیلدر (بوم ویرایش و «نمایش»): پایین‌ترین بخش صفحه، به‌شکل سکشن
         قابل‌ویرایش با برچسب «POP UP».
       - سایت واقعی: overlay ثابت + runtime کوچک که بعد از popupDelay ثانیه
         (۱ تا ۱۲۰) از لحظهٔ ورود بازدیدکننده بازش می‌کند. بستن با ×، Esc،
         کلیک روی پس‌زمینهٔ تیره یا کلیک روی لینک داخلی (#…).
       - دفعات نمایش: هر بار / یک‌بار در هر نشست / فقط یک‌بار برای هر بازدیدکننده.
       ============================================================ */
    const POPUP_CSS = '<style>.rava-popup{position:fixed;inset:0;z-index:2147482000;display:none;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}.rava-popup[data-pos="bottom"]{align-items:flex-end}.rava-popup__backdrop{position:absolute;inset:0;opacity:0;transition:opacity .28s ease}.rava-popup__dialog{position:relative;width:100%;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);overflow:auto;opacity:0;transform:translateY(18px) scale(.97);transition:opacity .28s ease,transform .32s cubic-bezier(.2,.8,.2,1);-webkit-overflow-scrolling:touch}.rava-popup.is-open .rava-popup__backdrop{opacity:1}.rava-popup.is-open .rava-popup__dialog{opacity:1;transform:none}.rava-popup__dialog>.render-section{margin:0!important}.rava-popup__close{position:absolute;top:10px;left:10px;z-index:5;width:34px;height:34px;border-radius:999px;border:0;cursor:pointer;display:grid;place-items:center;font-size:22px;line-height:1;box-shadow:0 4px 14px rgba(16,24,40,.18)}html.rava-popup-lock,html.rava-popup-lock body{overflow:hidden!important}@media (prefers-reduced-motion:reduce){.rava-popup__dialog,.rava-popup__backdrop{transition:none}}</style>';
    /* runtime مستقل (ES5) — یک‌بار در صفحه اجرا می‌شود و همهٔ پاپ‌آپ‌ها را مدیریت می‌کند */
    function ravaPopupRuntime() {
      if (window.__ravaPopupRT) return; window.__ravaPopupRT = 1;
      function k(el) { return 'rava.popup.' + (el.getAttribute('data-rava-popup') || '') + '.' + location.pathname; }
      function seen(el) { var f = el.getAttribute('data-freq'); try { if (f === 'session') return sessionStorage.getItem(k(el)) === '1'; if (f === 'once') return localStorage.getItem(k(el)) === '1'; } catch (e) {} return false; }
      function mark(el) { var f = el.getAttribute('data-freq'); try { if (f === 'session') sessionStorage.setItem(k(el), '1'); if (f === 'once') localStorage.setItem(k(el), '1'); } catch (e) {} }
      function close(el) { if (!el.classList.contains('is-open')) return; el.classList.remove('is-open'); el.setAttribute('aria-hidden', 'true'); setTimeout(function () { el.style.display = 'none'; }, 320); if (!document.querySelector('.rava-popup.is-open')) document.documentElement.classList.remove('rava-popup-lock'); }
      function open(el) { el.style.display = 'flex'; el.removeAttribute('aria-hidden'); void el.offsetWidth; el.classList.add('is-open'); mark(el); if (el.getAttribute('data-lock') !== '0') document.documentElement.classList.add('rava-popup-lock'); var d = el.querySelector('.rava-popup__dialog'); if (d) try { d.focus({ preventScroll: true }); } catch (e) {} }
      function init() {
        var list = document.querySelectorAll('[data-rava-popup]');
        for (var i = 0; i < list.length; i++) (function (el) {
          if (el.getAttribute('data-pop-init')) return; el.setAttribute('data-pop-init', '1');
          var host = el.parentElement;
          /* از هر والد transform/container بیرون می‌آید تا position:fixed واقعاً نسبت به پنجره باشد */
          if (el.parentElement !== document.body) document.body.appendChild(el);
          el.addEventListener('click', function (e) {
            var t = e.target && e.target.closest ? e.target.closest('[data-popup-close],a[href^="#"]') : null;
            if (!t) return;
            if (t.getAttribute('data-popup-close') === 'backdrop' && el.getAttribute('data-backdrop-close') === '0') return;
            if (t.hasAttribute('data-popup-close')) e.preventDefault();
            close(el);
          });
          if (seen(el)) return;
          var delay = Math.max(1, Math.min(120, parseFloat(el.getAttribute('data-delay')) || 5));
          setTimeout(function () {
            /* اگر در این بریک‌پوینت مخفی شده (تب پیشرفته → نمایش در موبایل/دسکتاپ)، باز نشود */
            if (host && host.classList && host.classList.contains('rava-vis') && window.getComputedStyle(host).display === 'none') return;
            open(el);
          }, delay * 1000);
        })(list[i]);
      }
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' || e.key === 'Esc') { var o = document.querySelectorAll('.rava-popup.is-open'); if (o.length) close(o[o.length - 1]); } });
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    }
    const POPUP_RUNTIME = '<script>(' + ravaPopupRuntime.toString() + ')();<\/script>';
    function renderPopupSection(b) {
      const delay = Math.max(1, Math.min(120, Math.round(nn(b.popupDelay, 5))));
      const width = Math.max(260, Math.min(1400, nn(b.popupWidth, 560)));
      const radius = nn(b.radius, 20);
      /* داخل پنجره، سکشن هرگز تمام‌عرض (full-bleed) نمی‌شود */
      const secB = Object.assign({}, b, { fullBleed: false, edgeToEdge: false });
      const inner = renderSectionMarkup(secB);
      const ctxNow = localCtx();
      if (ctxNow) {
        /* بیلدر — پیش‌نمایش درجا، پایین‌ترین بخش صفحه */
        return `<div class="rava-popup-preview" style="box-sizing:border-box;margin:24px 0 0;padding:14px;border:2px dashed #FDB022;border-radius:20px;background:#FFFAEB"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px;font-size:12px;font-weight:800;color:#B54708;font-family:system-ui"><span>⧉ POP UP</span><span>${delay} ثانیه بعد از ورود بازدیدکننده نمایش داده می‌شود</span></div><div style="max-width:${width}px;margin:0 auto;border-radius:${radius}px;overflow:hidden;box-shadow:0 24px 60px rgba(16,24,40,.22)">${inner}</div></div>`;
      }
      const freq = ['always', 'session', 'once'].includes(b.popupFrequency) ? b.popupFrequency : 'always';
      const pos = b.popupPosition === 'bottom' ? 'bottom' : 'center';
      const bdA = Math.max(0, Math.min(100, nn(b.backdropOpacity, 60))) / 100;
      const bd = hexA(b.backdropColor || '#0B1220', bdA);
      const closeBtn = b.showClose === false ? '' : `<button type="button" class="rava-popup__close" data-popup-close="x" aria-label="بستن" style="background:${E(b.closeBg || '#FFFFFF')};color:${E(b.closeColor || '#101828')}">×</button>`;
      const pid = E(String(b.id || 'popup').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64));
      return `<div class="rava-popup" data-rava-popup="${pid}" data-delay="${delay}" data-freq="${freq}" data-pos="${pos}" data-backdrop-close="${b.closeOnBackdrop === false ? '0' : '1'}" data-lock="${b.lockScroll === false ? '0' : '1'}" aria-hidden="true" style="display:none">${POPUP_CSS}<div class="rava-popup__backdrop" data-popup-close="backdrop" style="background:${bd}"></div><div class="rava-popup__dialog" role="dialog" aria-modal="true" tabindex="-1" style="max-width:${width}px;border-radius:${radius}px;box-shadow:${SHADOW[b.shadow || 'xl'] || SHADOW.xl};outline:none">${closeBtn}${inner}</div>${POPUP_RUNTIME}</div>`;
    }

    /* ---------- THE one block switch (ported from server renderOneBlock,
       each root now also carries the shared shellStyle) ---------- */
    function renderOneBlock(b0) {
      const b = legacyWidth(b0);
      const S = shellStyle(b, 'right');
      const commonS = `${S}${common(b)}`;
      switch (b.type) {
        /* V133 — هدر و فوتر سایت: بالا/پایین صفحه؛ بیلدر و سرور بلوک را قبل از رندر جابه‌جا می‌کنند.
           V134 — shellStyle اینجا اعمال نمی‌شود (width:100%/max-width آن full-bleed را می‌شکند). */
        case 'header': return renderShellHeader(b);
        case 'footer': return renderShellFooter(b);
        case 'section': return renderSectionMarkup(b);
        case 'anywhereSection': {
          const w=Math.max(40,nn(b.width,320)), h=Math.max(0,nn(b.height,180)), x=nn(b.offsetX,0), y=nn(b.offsetY,0);
          return `<section class="render-anywhere-section" style="position:relative;box-sizing:border-box;width:${w}px;min-height:${h}px;transform:translate(${x}px,${y}px);margin:${Math.max(0,y)}px 0 ${Math.max(0,-y)}px;background:${E(b.bg||'#FFFFFF')};border:${nn(b.borderWidth,1)}px solid ${E(b.border||'#D0D5DD')};border-radius:${nn(b.radius,14)}px;box-shadow:${SHADOW[b.shadow||'sm']||'none'};padding:${nn(b.padY,16)}px ${nn(b.padX,16)}px">${renderBlocks(b.blocks||[])}</section>`;
        }
        case 'heading': { const tag = ['h1', 'h2', 'h3', 'h4'].includes(b.tag) ? b.tag : 'h2'; /* V115 — marginBottom اکنون برنده است: 0 واقعاً صفر است، نه 14px هاردکد */ const mb = nn(b.marginBottom, nn(b.padBottom, 14)); return `<${tag} style="${commonS}font-size:${nn(b.size, 40)}px;font-weight:${nn(b.weight, 800)};line-height:${nn(b.line, 1.15)};letter-spacing:${nn(b.letter)}px;font-style:${b.italic ? 'italic' : 'normal'};text-decoration:${E(b.decoration || 'none')};text-transform:${E(b.transform || 'none')};${fontOf(b, 'var(--site-font-heading,var(--site-font,system-ui))')};margin-top:${nn(b.marginTop)}px;margin-bottom:${mb}px">${rich(b.html || plainToHtml(b.text || ''))}</${tag}>`; }
        case 'text': {
          const tTag = ['h1', 'h2', 'h3', 'h4'].includes(b.headingLevel) ? b.headingLevel : null;
          /* V115 — marginBottom اکنون برنده است: 0 واقعاً صفر است، نه 18px هاردکد؛
             همین باعث می‌شد «نمی‌توانم فاصله بین متن‌ها را کم کنم». */
          const mb = nn(b.marginBottom, nn(b.padBottom, 18));
          const mt = nn(b.marginTop, 0);
          const mr2 = nn(b.marginRight), ml2 = nn(b.marginLeft);
          const tInner = `${commonS}font-size:${nn(b.size, 18)}px;font-weight:${nn(b.weight, 400)};line-height:${nn(b.line, 1.9)};letter-spacing:${nn(b.letter)}px;font-style:${b.italic ? 'italic' : 'normal'};text-decoration:${E(b.decoration || 'none')};text-transform:${E(b.transform || 'none')};${b.direction === 'rtl' || b.direction === 'ltr' ? `direction:${b.direction};` : ''}${b.decorationColor ? `text-decoration-color:${E(b.decorationColor)};` : ''}${b.decorationStyle && b.decorationStyle !== 'solid' ? `text-decoration-style:${E(b.decorationStyle)};` : ''}${b.decorationThickness ? `text-decoration-thickness:${nn(b.decorationThickness)}px;` : ''}margin-top:${mt}px;margin-bottom:${mb}px;${fontOf(b, 'var(--site-font,system-ui)')}${fxStyle(b) ? ';' + fxStyle(b) : ''}`;
          let tBody = rich(b.html || plainToHtml(b.text || ''));
          /* V250 — empty text stays visible/selectable on the builder canvas (site renders nothing extra) */
          if (!String(tBody).replace(/<br\s*\/?>|&nbsp;|<\/?(p|div|span)[^>]*>/gi, '').trim() && localCtx() === 'edit') tBody = '<span class="rv-text-empty">متن خالی — برای نوشتن، از تب «محتوا» تایپ کن</span>';
          /* V250 — headings may not contain <p>/<div>: paragraphs become block spans (valid HTML, same look) */
          if (tTag) tBody = String(tBody).replace(/<(p|div)(\s[^>]*)?>/gi, (m, t, a) => `<span class="rv-p"${a || ''}>`).replace(/<\/(p|div)>/gi, '</span>');
          return tTag ? `<${tTag} class="rv-text rv-text--h" style="${tInner};text-align:${alignOf(b, 'right')}">${tBody}</${tTag}>` : `<div class="rv-text" style="${tInner}">${tBody}</div>`;
        }
        case 'button': {
          /* V250 — variants are honest: gradient only paints «solid», outline always has a
             visible stroke, ghost has none, and white-on-transparent text (the old default
             for outline/ghost) falls back to the brand colour so the label never vanishes. */
          const vr = b.variant === 'outline' || b.variant === 'ghost' ? b.variant : 'solid';
          const brand = E(b.bg || '#175CD3');
          const background = vr !== 'solid' ? 'transparent' : (b.gradient ? `linear-gradient(${E(b.gradientDir || '135deg')},${brand},${E(b.gradient2 || '#7F56D9')})` : brand);
          const fgRaw = String(b.fg || '').trim();
          const fgWhite = !fgRaw || /^#(fff|ffffff|ffffffff)$/i.test(fgRaw) || /^white$/i.test(fgRaw);
          const fgCol = vr !== 'solid' && fgWhite ? brand : E(fgRaw || '#fff');
          const bw = vr === 'ghost' ? 0 : (vr === 'outline' ? Math.max(1, nn(b.borderWidth, 2) || 2) : nn(b.borderWidth));
          const border = `${bw}px ${E(b.borderStyle || 'solid')} ${E(b.border || b.bg || '#175CD3')}`;
          /* V113 — honor linkKind/target (checkout / subpage / custom URL) like every
             other CTA; a plain url still wins when target carries no route. */
          const noLink = b.linkKind === 'none';
          const href = noLink ? '' : ((b.linkKind || b.target) ? E(safeHref(saleHref(b))) : E(safeHref(withRef(String(b.url || '#')))));
          const bLinkAttrs = (b.linkKind === 'custom' || (!b.linkKind && !b.target)) ? linkAttrs(b) : '';
          /* V131 — برچسب دکمه از ویرایشگر متن (rich) می‌آید؛ متن سادهٔ label هم مثل قبل کار می‌کند. */
          const btnLabelRaw = b.labelHtml ? rich(b.labelHtml) : E(b.label || fb('buttonWidget', 'دکمه'));
          /* V250 — optional icon (emoji/text) before or after the label */
          const bIco = String(b.btnIcon || '').trim();
          const icoHtml = bIco ? `<span class="rv-btn-ico" aria-hidden="true">${E(bIco)}</span>` : '';
          const btnLabel = icoHtml ? (b.btnIconPos === 'end' ? `<span class="rv-btn-lbl">${btnLabelRaw}</span>${icoHtml}` : `${icoHtml}<span class="rv-btn-lbl">${btnLabelRaw}</span>`) : btnLabelRaw;
          const bCls = 'render-button' + (b.fullWidth === true ? ' rv-btn--full' : '') + (b.mobileFull === true ? ' rv-btn--mfull' : '') + (noLink ? ' rv-btn--nolink' : '');
          return `<div style="${S}display:flex;justify-content:${JUSTIFY_MAP[b.align || 'center']}"><a class="${bCls}"${noLink ? ' role="button" aria-disabled="true"' : ` href="${href}"`}${bLinkAttrs} style="background:${background};color:${fgCol};border:${border};border-radius:${nn(b.radius, 12)}px;padding:${nn(b.padY, 12)}px ${nn(b.padX, 20)}px;font-size:${nn(b.size, 15)}px;font-weight:${nn(b.weight, 800)};${nn(b.letter) ? `letter-spacing:${nn(b.letter)}px;` : ''}box-shadow:${SHADOW[b.shadow || 'none']};text-transform:${b.uppercase ? 'uppercase' : 'none'}${b.fullWidth === true ? ';width:100%' : ''}">${btnLabel}</a></div>`;
        }
        case 'image': return renderImage(b);
        case 'audio': {
          /* V122 — سه پریست + پلیر سفارشی. <audio> واقعی (مخفی) زیر پلیر است؛
             runtime مشترک RAVA_AUDIO_RUNTIME آن را به پلیر وصل می‌کند — هم روی
             بوم بیلدر و هم صفحهٔ منتشرشده، بدون تفاوت رفتار. */
          const variant = ['default', 'podcast', 'seminar'].includes(b.audioVariant) ? b.audioVariant : 'default';
          const pv = {
            default: { bg: '#F7F7FB', border: '#EAECF0', acc: '#7C3AED', acc2: '#4F46E5', fg: '#101828', muted: '#8A8FA3', wave: '#C9C2F2' },
            podcast: { bg: '#FFF6EC', border: '#F5E0C8', acc: '#EA580C', acc2: '#F59E0B', fg: '#271A10', muted: '#96836F', wave: '#F3B98A' },
            seminar: { bg: '#0B1220', border: '#24304A', acc: '#8B5CF6', acc2: '#D946EF', fg: '#F8FAFC', muted: '#8FA0BC', wave: '#574B90' }
          }[variant];
          const acc = b.audioAccent || pv.acc;
          const fgC = b.titleColor || pv.fg;
          const mutC = variant === 'seminar' ? pv.muted : '#667085';
          const aUrl = String(b.url || '').trim();
          /* پدینگ از خودِ S (shellStyle) می‌آید — پدینگ جداگانه دوباره نمی‌گذاریم */
          const shell = `${S}background:${E(b.bg || pv.bg)};border:1px solid ${E(b.borderColor || pv.border)};border-radius:${nn(b.radius, variant === 'default' ? 999 : 24)}px;box-sizing:border-box;`;
          if (!aUrl) return `<div style="${shell}border-style:dashed;text-align:center;color:#98A2B3;font-size:13px">♫ ${fb('audioNotSet', 'فایل صوتی تنظیم نشده')}</div>`;
          const audioEl = `<audio src="${E(aUrl)}" preload="metadata" ${b.autoplay ? 'autoplay' : ''} ${b.loop ? 'loop' : ''} style="display:none"></audio>`;
          const bars = (cnt) => Array.from({ length: cnt }, (_, i) => `<span class="rau-bar" style="height:${22 + Math.round(56 * Math.abs(Math.sin(i * 1.35) * Math.cos(i * 0.55)))}%"></span>`).join('');
          const playBtn = (px) => `<button type="button" class="rau-play" aria-label="پخش/توقف" style="width:${px}px;height:${px}px;background:linear-gradient(135deg,${E(acc)},${E(b.audioAccent2 || pv.acc2)});box-shadow:0 10px 24px ${E(acc)}44"><span class="rau-ic rau-ic-play">▶</span><span class="rau-ic rau-ic-pause">❚❚</span></button>`;
          const trackHtml = `<div class="rau-track" dir="ltr"><div class="rau-fill" style="background:${E(acc)}"></div></div>`;
          const curSpan = `<span class="rau-cur rau-time">0:00</span>`;
          const durSpan = `<span class="rau-dur rau-time">--:--</span>`;
          const tSize = nn(b.titleSize, 15);
          let inner;
          if (variant === 'podcast') {
            inner = `
              <div style="display:flex;align-items:center;gap:14px">
                <span class="rau-cover" aria-hidden="true" style="background:linear-gradient(135deg,${E(acc)},${E(b.audioAccent2 || pv.acc2)})">🎙</span>
                <span style="flex:1;min-width:0"><b style="display:block;font-size:${tSize}px;font-weight:800;color:${E(fgC)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${E(b.title || fb('audioUntitled', 'پخش صوتی'))}</b><small style="display:block;margin-top:3px;font-size:11.5px;color:${E(mutC)}">${fb('audioPodcastSub', 'با ویوفُرم کامل')}</small></span>
                <span class="rau-dur rau-time rau-time--chip" style="color:${E(mutC)}">--:--</span>
              </div>
              <div class="rau-wave" aria-hidden="true" style="color:${E(b.audioAccent || pv.wave)}">${bars(44)}</div>
              <div style="display:flex;align-items:center;justify-content:center;gap:16px">
                <button type="button" class="rau-skip" data-rau-skip="-15" title="۱۵ ثانیه عقب" style="color:${E(mutC)}">↺15</button>
                ${playBtn(54)}
                <button type="button" class="rau-skip" data-rau-skip="15" title="۱۵ ثانیه جلو" style="color:${E(mutC)}">15↻</button>
              </div>
              <div class="rau-timerow" dir="ltr" style="color:${E(mutC)}">${curSpan}${trackHtml}${durSpan}</div>`;
          } else if (variant === 'seminar') {
            inner = `
              <div style="display:flex;align-items:center;gap:14px">
                <span class="rau-cover rau-cover--lg" aria-hidden="true" style="background:linear-gradient(135deg,${E(acc)},${E(b.audioAccent2 || pv.acc2)})">♫</span>
                <span style="flex:1;min-width:0"><b style="display:block;font-size:${tSize}px;font-weight:800;color:${E(fgC)};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${E(b.title || fb('audioUntitled', 'پخش صوتی'))}</b><small style="display:block;margin-top:3px;font-size:11.5px;color:${E(pv.muted)}">${fb('audioSeminarSub', 'کارت ویژه و جذاب')}</small></span>
                <span class="rau-dur rau-time rau-time--chip" style="color:${E(pv.muted)};background:rgba(255,255,255,.08)">--:--</span>
              </div>
              <div style="display:flex;align-items:center;justify-content:center;gap:22px;padding:6px 0 2px">
                <button type="button" class="rau-skip" data-rau-skip="-10" title="۱۰ ثانیه عقب" style="color:${E(pv.muted)}">⏮</button>
                ${playBtn(58)}
                <button type="button" class="rau-skip" data-rau-skip="10" title="۱۰ ثانیه جلو" style="color:${E(pv.muted)}">⏭</button>
              </div>
              <div class="rau-timerow" dir="ltr" style="color:${E(pv.muted)}">${curSpan}${trackHtml}${durSpan}</div>`;
          } else {
            inner = `
              ${playBtn(44)}
              ${curSpan}
              ${trackHtml}
              ${durSpan}`;
          }
          const layout = variant === 'default' ? 'display:flex;align-items:center;gap:12px;' : 'display:grid;gap:14px;';
          const controls = b.controls === false ? ' style="pointer-events:none;opacity:.75"' : '';
          return `<div class="rava-audio rau--${variant}"${controls} style="${shell}${layout}">${audioEl}${inner}</div>`;
        }
        case 'video': return `<div style="${S}text-align:${alignOf(b, 'center')};">${renderVideoEmbed(b.url, { aspect: b.aspect, radius: b.radius, poster: b.poster, border: b.border, borderWidth: b.borderWidth, borderStyle: b.borderStyle, shadow: b.shadow, controls: b.controls, autoplay: b.autoplay, muted: b.muted })}</div>`;
        case 'rating': return `<div style="${S}color:${E(b.color || '#F79009')};font-size:${nn(b.size, 20)}px;font-weight:900;letter-spacing:${nn(b.gap, 2)}px">${Array.from({ length: nn(b.max, 5) }, (_, i) => i < nn(b.value, 5) ? E(b.icon || '★') : E(b.emptyIcon || '☆')).join('')} ${b.label ? `<small style="color:#667085;font-size:12px;letter-spacing:0">${E(b.label)}</small>` : ''}</div>`;
        case 'testimonial': return `<div style="${S}background:${E(b.bg || '#F8FAFC')};border:1px solid ${E(b.border || '#EAECF0')};border-radius:${nn(b.radius, 18)}px;padding:${nn(b.padding, 24)}px;box-shadow:${SHADOW[b.shadow || 'none']};text-align:${alignOf(b, 'right')}">${b.showEmoji && b.emoji ? `<div class="t-emoji">${E(b.emoji)}</div>` : ''}${b.showRating ? `<div class="t-rating" style="color:${E(b.ratingColor || '#F79009')}">${'★'.repeat(Math.max(0, nn(b.rating, 5)))}${'☆'.repeat(Math.max(0, 5 - nn(b.rating, 5)))}</div>` : ''}${b.showQuote ? `<p>“${rich(b.quote || '')}”</p>` : ''}<div class="t-person">${b.showAvatar && b.avatar ? `<img src="${E(imgTransform(b.avatar, nn(b.avatarSize, 48), mediaSettings().imageKitQuality || 80))}" ${imgAttrs(b.avatar, { sizes: '48px' })} style="width:${nn(b.avatarSize, 48)}px;height:${nn(b.avatarSize, 48)}px;border-radius:${b.avatarShape === 'square' ? '12px' : '999px'};object-fit:cover">` : ''}<div>${b.showName ? `<strong>${rich(b.name || '')}</strong>` : ''}${b.showRole ? `<small>${rich(b.role || '')}</small>` : ''}</div></div></div>`;
        case 'faq': return `<div style="${S}"><h3 style="font-size:${nn(b.titleSize, 24)}px;font-weight:${nn(b.titleWeight, 800)};color:${E(b.titleColor || b.color || '#101828')};text-align:${alignOf(b, 'center')};margin:0 0 12px;${fontOf(b)}">${rich(b.title || fb('faqTitle', 'سوالات متداول'))}</h3>${(b.items || []).map((x, i) => `<details ${b.openFirst && i === 0 ? 'open' : ''} style="border:1px solid ${E(b.borderColor || '#EAECF0')};border-radius:12px;padding:11px;margin:7px 0;background:${E(b.itemBg || '#fff')}"><summary style="cursor:pointer;list-style:none;font-size:${nn(x.qSize, b.questionSize || 16)}px;font-weight:${nn(x.qWeight, b.questionWeight || 700)};color:${E(x.qColor || b.questionColor || b.color || '#101828')}">${rich(x.q || fb('faqQuestion', 'سوال'))}</summary><p style="color:${E(x.aColor || b.answerColor || '#667085')};margin:8px 0 0;font-size:${nn(x.aSize, b.answerSize || 14)}px;font-weight:${nn(x.aWeight, b.answerWeight || 400)};line-height:${nn(x.aLine, b.answerLine || 1.7)}">${rich(x.a || fb('faqAnswer', 'پاسخ'))}</p></details>`).join('')}</div>`;
        case 'form': {
          const endpoint = b.storeSubmissions ? '/api/form-submit' : (b.action || '#');
          const redirect = b.successUrl || '';
          const handler = !b.storeSubmissions && redirect ? ` onsubmit="event.preventDefault();window.location.href='${E(redirect)}';"` : '';
          return `<form class="render-form" action="${E(endpoint)}" method="${E(b.method || 'post')}"${handler} style="${S}">${b.storeSubmissions ? `<input type="hidden" name="__formId" value="${E(b.id || 'form')}"><input type="hidden" name="__successUrl" value="${E(redirect)}">` : ''}<h3>${E(b.title || fb('formWidget', 'فرم'))}</h3>${b.description ? `<p>${E(b.description)}</p>` : ''}${(b.fields || []).map(f => f.type === 'textarea' ? `<textarea name="${E(f.name || 'field')}" placeholder="${E(f.placeholder || f.label || '')}" ${f.required ? 'required' : ''}></textarea>` : `<input name="${E(f.name || 'field')}" type="${E(f.type || 'text')}" placeholder="${E(f.placeholder || f.label || '')}" ${f.required ? 'required' : ''}>`).join('')}<button type="submit">${E(b.submit || fb('formSend', 'ارسال'))}</button></form>`;
        }
        /* V131 — Embed: ارتفاع دستی (embedHeightMode='manual' + embedHeight px) —
           حالت خودکار دقیقاً مثل قبل رندر می‌شود؛ کلاس کمکی برای اسکرول داخلی. */
        case 'embed': return `<div class="render-embed${b.embedHeightMode === 'manual' ? ' render-embed--manual' : ''}" style="${S}${b.embedHeightMode === 'manual' ? `height:${Math.max(40, nn(b.embedHeight, 220))}px;overflow:auto;` : ''}">${b.code || '<div>Embed</div>'}</div>`;
        case 'custom': { /* V200 — Custom: HTML + CSS محدود به همین عنصر + JS اختیاری (فقط سایت منتشرشده) */
          const cid = 'rvc-' + String(b.id || 'x').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
          const css = String(b.css || '').replace(/<\/style/gi, '<\\/style');
          const js = String(b.js || '').trim().replace(/<\/script/gi, '<\\/script');
          const run = js && !isBrowser ? `<script>(function(root){try{${js}\n}catch(e){console.error('Custom element',e)}})(document.getElementById('${cid}'));</script>` : '';
          return `<div class="rv-custom" id="${cid}" style="${S}">${css ? `<style>#${cid}{${css}}</style>` : ''}${b.html || ''}</div>${run}`;
        }
        case 'quote': return `<blockquote class="render-quote" style="${S}border-right-color:${E(b.accent || '#175CD3')};font-size:${nn(b.size, 24)}px;font-style:${b.italic ? 'italic' : 'normal'}">${rich(b.text || '')}<small>${E(b.author || '')}</small></blockquote>`;
        case 'divider': {
          const thick = Math.max(1, nn(b.width, 2));
          const pat = b.pattern || 'line';
          const dMode = widthModeOf(b);
          const dPos = boxAlignOf(b, 'center');
          const full = dMode === 'bleed' ? RAVA_BLEED_CSS : dMode === 'edge' ? EDGE_CSS : dMode === 'pct' ? `width:100%;max-width:${Math.max(1, clampPct(b.maxWidth, 100))}%;` + (dPos === 'center' ? 'margin-left:auto;margin-right:auto' : dPos === 'right' ? 'margin-left:auto;margin-right:0' : 'margin-left:0;margin-right:auto') : 'width:100%';
          const mg = `margin-top:${nn(b.marginTop, nn(b.margin, 28))}px;margin-bottom:${nn(b.marginBottom, nn(b.margin, 28))}px`; /* V147 — longhands so the width position (auto side margins) survives */
          if (pat === 'none') { /* V200 — Spacer = Divider بدون خط */
            const sh = Math.max(0, Math.min(1200, nn(b.spaceHeight, nn(b.height, 48))));
            const smg = `margin-top:${nn(b.marginTop, 0)}px;margin-bottom:${nn(b.marginBottom, 0)}px`;
            const ed = localCtx() === 'edit' ? `outline:1px dashed #B2CCFF;outline-offset:-1px;background:repeating-linear-gradient(135deg,transparent 0 6px,rgba(23,92,211,.05) 6px 12px);display:flex;align-items:center;justify-content:center;font:700 10px/1 system-ui;color:#84ADFF;` : '';
            return `<div class="rv-spacer" aria-hidden="true" style="${full};${smg};height:${sh}px;${ed}">${ed && sh >= 14 ? 'SPACER · ' + sh + 'px' : ''}</div>`;
          }
          if (pat === 'stars') return `<div style="${full};${mg};display:flex;align-items:center;gap:10px"><span style="height:${thick}px;background:${E(b.color || '#EAECF0')};flex:1"></span><span style="color:${E(b.color || '#EAECF0')};letter-spacing:4px;font-size:${Math.max(12, thick * 8)}px">★ ★ ★</span><span style="height:${thick}px;background:${E(b.color || '#EAECF0')};flex:1"></span></div>`;
          if (pat === 'zigzag') return `<div style="${full};${mg};height:${Math.max(8, thick * 4)}px;background:linear-gradient(135deg,transparent 0 35%,${E(b.color || '#EAECF0')} 36% 64%,transparent 65%) 0 0/16px 16px repeat-x"></div>`;
          if (pat === 'wave') return `<div style="${full};${mg};height:${Math.max(8, thick * 3)}px;background:radial-gradient(circle at 8px -2px,transparent 9px,${E(b.color || '#EAECF0')} 10px,${E(b.color || '#EAECF0')} ${thick + 9}px,transparent ${thick + 10}px) 0 0/20px 12px repeat-x"></div>`;
          return `<div style="${full};${mg};height:${pat === 'double' ? Math.max(2, thick) : thick}px;border-top:${thick}px ${pat === 'dashed' ? 'dashed' : pat === 'dotted' ? 'dotted' : pat === 'double' ? 'double' : 'solid'} ${E(b.color || '#EAECF0')}"></div>`;
        }
        case 'spacer': return `<div style="height:${clampPct(b.height, 48) > 1200 ? 1200 : Math.max(0, nn(b.height, 48))}px"></div>`;
        case 'card': return `<div class="render-card" style="${S}background:${E(b.bg || '#fff')};border:1px solid ${E(b.border || '#EAECF0')};border-radius:${nn(b.radius, 18)}px;padding:${nn(b.padding, 24)}px;box-shadow:${SHADOW[b.shadow || 'none']}"><h3 style="font-size:${nn(b.titleSize, b.size || 22)}px;font-weight:${nn(b.titleWeight, b.weight || 800)};color:${E(b.titleColor || b.color || '#101828')};margin:0 0 8px;${fontOf(b)}">${rich(b.title || 'Card')}</h3><p style="font-size:${nn(b.textSize, 14)}px;font-weight:${nn(b.textWeight, 400)};line-height:${nn(b.textLine, b.line || 1.6)};color:${E(b.textColor || '#667085')};margin:0;${fontOf(b)}">${rich(b.text || '')}</p>${b.url ? `<a class="render-button" href="${E(withRef(String(b.url)))}" style="background:${E(b.buttonBg || '#175CD3')};color:#fff;border-radius:10px;padding:10px 14px;font-weight:800;">${E(b.button || fb('more', 'بیشتر'))}</a>` : ''}</div>`;
        case 'stats': return `<div class="render-stats" style="${S}display:grid;grid-template-columns:repeat(${Math.max(1, Math.min(6, nn(b.perRow, 3)))},minmax(0,1fr));gap:${nn(b.gap, 12)}px;">${(b.items || []).map(x => `<div style="padding:14px;border:1px solid ${E(b.borderColor || '#EAECF0')};border-radius:12px;background:${E(b.itemBg || '#fff')};text-align:${ALIGN_MAP[x.align || b.align] || 'center'}">${x.iconUrl ? `<img src="${E(x.iconUrl)}" style="width:${nn(x.iconSize, 28)}px;height:${nn(x.iconSize, 28)}px;object-fit:contain;background:${E(x.iconBg || 'transparent')};border-radius:12px;padding:4px;">` : x.icon ? `<div style="width:${nn(x.iconSize, 28)}px;height:${nn(x.iconSize, 28)}px;display:grid;place-items:center;background:${E(x.iconBg || 'transparent')};color:${E(x.iconColor || '#175CD3')};border-radius:12px;margin:0 auto 6px">${E(x.icon)}</div>` : ''}<div style="font-size:${nn(x.valueSize, 22)}px;font-weight:${nn(x.valueWeight, 800)};color:${E(x.valueColor || '#101828')};${fontOf(b)}">${rich(x.value || '0')}</div><div style="display:block;color:${E(x.labelColor || '#667085')};font-size:${nn(x.labelSize, 12)}px;font-weight:${nn(x.labelWeight, 400)};${fontOf(b)}">${rich(x.label || '')}</div></div>`).join('')}</div>`;
        case 'list': return `<ul class="render-list" style="${S}margin-top:${nn(b.marginTop)}px;margin-bottom:${nn(b.marginBottom)}px;padding-inline-start:1.4em;line-height:${nn(b.line, 2.1)};${fontOf(b)}">${(b.items || []).map(x => `<li>${rich(x && x.text !== undefined ? x.text : x || '')}</li>`).join('')}</ul>`;
        case 'icon': return renderIcon(b);
        case 'iconRow': return renderIcon(b); /* V114 — legacy blocks keep rendering */
        case 'scrollPoint': return renderScrollPoint(b, localCtx()); /* V116: edit, preview, published */
        case 'badge': return `<div style="${S}"><span class="render-badge" style="background:${E(b.bg || '#EEF4FF')};color:${E(b.color || '#175CD3')};border:1px solid ${E(b.border || '#D1E0FF')};border-radius:${nn(b.radius, 999)}px">${rich(b.text || 'Badge')}</span></div>`;
        case 'pricing': return `<div class="render-pricing" style="${S}background:${E(b.bg || '#101828')};color:${E(b.fg || '#fff')};border-radius:${nn(b.radius, 22)}px"><span style="font-size:${nn(b.kickerSize, 12)}px">${rich(b.kicker || 'PLAN')}</span><h3 style="font-size:${nn(b.titleSize, b.size || 22)}px;font-weight:${nn(b.titleWeight, b.weight || 800)};color:${E(b.titleColor || b.fg || '#fff')};margin:12px 0;${fontOf(b)}">${rich(b.title || 'Pro')}</h3><strong style="font-size:${nn(b.priceSize, 44)}px;font-weight:${nn(b.priceWeight, 900)};display:block">${E(b.price || '79$')}</strong><p style="font-size:${nn(b.textSize, 14)}px;color:${E(b.textColor || b.fg || '#fff')}">${rich(b.note || fb('fullAccess', 'دسترسی کامل'))}</p><a href="${E(withRef(String(b.url || '#')))}" class="render-button" style="background:${E(b.buttonBg || '#fff')};color:${E(b.buttonColor || '#101828')};border-radius:12px;">${E(b.button || fb('buy', 'خرید'))}</a></div>`;
        /* V117/V131 — Columns: روی PC ستون‌ها همیشه کنار هم‌اند و در موبایل زیر هم؛
           فقط با تیک «کنار هم در موبایل (فشرده)» (stackMobile='side') در موبایل هم
           کنار هم می‌مانند. dir قدیمی و مقدار legacy بدون این کلیدها همان رندر قبلی را می‌دهند. */
        case 'columns': {
          const items=b.items||[], cnt=items.length||1, vertical=b.dir==='column', stackMobile=b.stackMobile!=='side';
          const gap=Math.max(0,nn(b.gap,18)), gapM=Math.max(0,nn(b.gapMobile,Math.min(gap,12)));
          const valign=['start','center','end'].includes(b.valign)?b.valign:'stretch';
          const bgOf=v=>{let s=String(v==null?'':v).trim();if(!s)return '';if(/^[0-9a-fA-F]{3,8}#$/.test(s))s='#'+s.slice(0,-1);else if(/^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(s))s='#'+s;return fxColor(s,'');};
          const bw=Math.max(0,nn(b.colBorderWidth,0)), pad=b.colPadding!=null?Math.max(0,nn(b.colPadding,0)):(bw?Math.max(4,Math.round(gap/2)):0);
          const frame=(bw?`border:${bw}px solid ${E(bgOf(b.colBorder)||'#EAECF0')};`: '')+(b.colRadius?`border-radius:${nn(b.colRadius,0)}px;`:'')+(pad?`padding:${pad}px;`:'');
          const wOf=x=>Math.max(1,nn(x&&x.width,100/cnt));
          const rootHasBg=!!(b.bgxType&&b.bgxType!=='none')||!!b.backgroundType||!!b.backgroundColor||!!b.bg;
          const colInner=(x,ci)=>{const h=Number(x.height);const height=Number.isFinite(h)&&h>0?`min-height:${Math.max(1,h)}px;align-self:flex-start;`:'';const raw=String(x.bg??'').trim();const hasOwnBg=raw!=='';const bg=hasOwnBg?bgOf(raw):(!rootHasBg?bgOf(b.colBg):'');return `<div class="render-col" data-rava-col="${ci}" style="${vertical?'width:100%;':`flex:${wOf(x)} 1 0%;`}${height}${hasOwnBg||bg?`background:${E(bg||'transparent')} !important;`:''}${frame}box-sizing:border-box;min-width:0;${b.columnInnerGap?`display:flex;flex-direction:column;gap:${nn(b.columnInnerGap,0)}px;`:''}">${renderBlocks(x.blocks||[])}</div>`;};
          const alignBy=valign==='stretch'?'stretch':valign==='start'?'flex-start':valign==='center'?'center':'flex-end';
          const rid='rc-'+String(b.id||'x').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,48), sel=`.${rid}.${rid}.${rid}`;
          let css=`@container ravapage (max-width:720px){${sel}{gap:${gapM}px!important}`;
          /* Stacked mobile columns use the full content width, like Section. */
          if(!vertical&&stackMobile)css+=`${sel}>.render-col{width:100%!important;max-width:100%!important;flex:1 1 auto!important;align-self:stretch!important}`;
          css+='}';
          const totalH=nn(b.height,0)>0?`min-height:${Math.max(1,nn(b.height,0))}px;`:'', rootBg=fxBackground(b)||((b.backgroundType||b.backgroundColor||b.bg)?bgStyle(b):'');
          return `<div class="render-columns ${rid} ${!vertical&&!stackMobile?'rc-side':''}${!vertical&&stackMobile&&b.reverseMobile===true?' rc-rev':''}" style="${S}display:flex;${totalH}${rootBg?`background:${rootBg};`:''}flex-direction:${vertical?'column':'row'};gap:${gap}px;align-items:${alignBy}"><style>${css}</style>${items.map(colInner).join('')}</div>`;
        }
        case 'announcement': return `<div class="render-announcement" style="${S}background:${E(b.bg || '#101828')};color:${E(b.fg || '#fff')}"><span>${rich(b.text || '')}</span>${b.url ? `<a href="${E(withRef(String(b.url)))}">${E(b.button || fb('more', 'بیشتر'))}</a>` : ''}</div>`;
        case 'countdown': {
          const en = b.language === 'en';
          const labels = en ? ['Days', 'Hours', 'Minutes', 'Seconds'] : [fb('cdDays', 'روز'), fb('cdHours', 'ساعت'), fb('cdMinutes', 'دقیقه'), fb('cdSeconds', 'ثانیه')];
          const keys = ['days', 'hours', 'minutes', 'seconds'];
          const boxes = b.showBoxes !== false;
          return `<div class="render-countdown" dir="${en ? 'ltr' : 'rtl'}" style="${S}">${keys.map((k, i) => `<div class="${boxes ? '' : 'countdown-no-box'}"><strong>${String(nn(b[k])).padStart(2, '0')}</strong><span>${labels[i]}</span></div>`).join('')}</div>`;
        }
        case 'social': return renderSocial(b);
        case 'logo': return `<div class="render-logo" style="${S}color:${E(b.color || '#175CD3')};font-size:${nn(b.size, 28)}px;font-weight:900">${E(b.text || 'RAVA')}</div>`;
        case 'feature': {
          const ix=(Array.isArray(b.icons)&&b.icons[0])||{icon:b.icon||'✓',color:b.iconColor||'#175CD3'};
          const box=Math.max(20,nn(b.box,54)), sz=Math.max(8,nn(b.size,24));
          const shape=b.shape==='circle'?999:b.shape==='square'?0:b.shape==='none'?0:12;
          const glyph=iconGlyph(b,ix,sz,ix.color||b.iconColor||'#175CD3');
          /* V150 — Feature surface has no background controls any more: always transparent. */
          const featureBg='transparent';
          const featureOpacity=1;
          const fAlign=(b.align==='left'||b.align==='center'||b.align==='right')?b.align:'right';
          const fBoxMargin=fAlign==='center'?'margin-left:auto;margin-right:auto;':fAlign==='left'?'margin-left:0;margin-right:auto;':'margin-left:auto;margin-right:0;';
          const featurePad=`padding:${nn(b.padY,0)}px ${nn(b.padX,0)}px;`;
          const iconPosition=b.iconPosition==='end'?'row-reverse':'row';
          const iconWrap=b.shape==='none'
            ? `<div style="width:${box}px;height:${box}px;display:grid;place-items:center;flex:none;color:${E(ix.color||b.iconColor||'#175CD3')};opacity:${Math.max(0,Math.min(100,nn(b.opacity,100)))/100};transform:rotate(${nn(b.rotate,0)}deg)">${glyph}</div>`
            : `<div class="render-icon" style="background:${E(b.iconBg||'transparent')};color:${E(ix.color||b.iconColor||'#175CD3')};width:${box}px;height:${box}px;border-radius:${shape}px;display:grid;place-items:center;flex:none;opacity:${Math.max(0,Math.min(100,nn(b.opacity,100)))/100};transform:rotate(${nn(b.rotate,0)}deg)">${glyph}</div>`;
          return `<div class="render-feature" style="${S}${b.width!=null?`width:${Math.max(10,Math.min(100,nn(b.width,100)))}%;`:''}${nn(b.height,0)>0?`height:${nn(b.height,0)}px;`:''}${fBoxMargin}text-align:${fAlign};background:${featureBg};opacity:${featureOpacity};border-radius:${nn(b.radius,0)}px;${featurePad}display:flex;flex-direction:${iconPosition};align-items:center;justify-content:${fAlign};gap:${nn(b.iconGap,12)}px;transform:rotate(${nn(b.rotate,0)}deg);box-sizing:border-box"><div style="display:flex;align-items:center;flex:none">${iconWrap}</div><div style="min-width:0;color:${E(b.textColor||'#667085')};line-height:${nn(b.textLine,1.7)};font-size:${nn(b.textSize,12)}px;font-weight:${nn(b.textWeight,b.weight||400)};${fontOf(b)}">${rich(b.html||b.text||'')}</div></div>`;
        }
        case 'carousel': return renderCarousel(b);
        case 'buttonGroup': return `<div class="render-button-group" style="${S}display:flex;gap:${nn(b.gap, 10)}px;justify-content:${JUSTIFY_MAP[b.align || 'center']};flex-wrap:${b.wrap !== false ? 'wrap' : 'nowrap'}">${(b.buttons || []).map(x => { const bg = x.variant === 'outline' ? 'transparent' : (x.bg || '#175CD3'); const border = x.variant === 'ghost' ? 'transparent' : `${nn(x.borderWidth, 1)}px solid ${E(x.border || x.bg || '#175CD3')}`; return `<a href="${E(withRef(String(x.url || '#')))}" class="render-button" style="background:${E(bg)};color:${E(x.fg || '#fff')};border:${border};border-radius:${nn(x.radius, 12)}px;padding:${nn(x.padY, 12)}px ${nn(x.padX, 18)}px;font-size:${nn(x.size, 15)}px;font-weight:800;text-decoration:none;box-shadow:${SHADOW[x.shadow || 'none'] || 'none'}">${E(x.label || 'Button')}</a>`; }).join('')}</div>`;
        case 'guarantee': return `<div style="${S}background:${E(b.bg || '#F8FAFC')};border:1px solid ${E(b.border || '#D0D5DD')};border-radius:${nn(b.radius, 20)}px;padding:${nn(b.padding, 24)}px;display:flex;gap:14px;align-items:flex-start"><div style="width:48px;height:48px;border-radius:14px;background:${E(b.iconBg || '#ECFDF3')};color:${E(b.iconColor || '#067647')};display:grid;place-items:center;font-size:22px">${E(b.icon || '✓')}</div><div><div style="font-size:11px;font-weight:800;letter-spacing:.08em;color:${E(b.accent || '#067647')}">${E(b.kicker || 'GUARANTEE')}</div><h3 style="margin:4px 0 6px;font-size:${nn(b.titleSize, 20)}px;font-weight:900;color:${E(b.titleColor || '#101828')}">${rich(b.title || fb('guaranteeTitle', 'با خیال راحت شروع کن'))}</h3><div style="color:${E(b.textColor || '#667085')};font-size:${nn(b.textSize, 14)}px;line-height:1.8">${rich(b.text || '')}</div></div></div>`;
        case 'leadMagnet': return `<div style="${S}background:${E(b.bg || '#EEF4FF')};color:${E(b.fg || '#101828')};border-radius:${nn(b.radius, 20)}px;padding:${nn(b.padding, 24)}px;display:grid;gap:10px"><div style="font-size:11px;font-weight:800;letter-spacing:.08em;color:${E(b.accent || '#175CD3')}">${E(b.kicker || 'FREE')}</div><h3 style="margin:0;font-size:${nn(b.titleSize, 26)}px;font-weight:900">${rich(b.title || fb('leadMagnetTitle', 'راهنمای رایگان را بگیر'))}</h3><div style="color:${E(b.textColor || '#475467')};line-height:1.8">${rich(b.text || '')}</div>${b.url ? `<a href="${E(withRef(String(b.url)))}" class="render-button" style="background:${E(b.accent || '#175CD3')};color:#fff;text-decoration:none;border-radius:12px;padding:${nn(b.buttonY, 12)}px ${nn(b.buttonX, 18)}px;font-weight:800;width:max-content">${E(b.button || fb('getFree', 'دریافت رایگان'))}</a>` : ''}</div>`;
        case 'featureCompare': { const cols = b.columns || [fb('fcBasic', 'پایه'), fb('fcPro', 'حرفه‌ای')]; return `<div style="${S}overflow:auto;background:${E(b.bg || '#fff')};border:1px solid ${E(b.border || '#EAECF0')};border-radius:${nn(b.radius, 18)}px"><div style="min-width:520px"><div style="display:grid;grid-template-columns:1.4fr repeat(${cols.length},1fr);background:${E(b.headerBg || '#F8FAFC')};padding:14px 16px;font-weight:800"><div>${E(b.title || fb('fcCompare', 'مقایسه امکانات'))}</div>${cols.map(c => `<div style="text-align:center">${E(c)}</div>`).join('')}</div>${(b.items || []).map(row => `<div style="display:grid;grid-template-columns:1.4fr repeat(${cols.length},1fr);padding:14px 16px;border-top:1px solid #EAECF0"><div>${E(row.label || fb('fcFeature', 'ویژگی'))}</div>${cols.map((_, i) => `<div style="text-align:center;font-weight:800;color:${String((row.values || [])[i] || '').includes('✓') ? E(b.accent || '#175CD3') : '#667085'}">${E((row.values || [])[i] || '—')}</div>`).join('')}</div>`).join('')}</div></div>`; }
        case 'avatarStack': return `<div style="${S}"><div style="display:inline-flex;align-items:center"><div style="display:flex;align-items:center">${(b.items || []).slice(0, nn(b.max, 5)).map((x, i) => x.src ? `<img src="${E(imgTransform(x.src, nn(b.size, 42), mediaSettings().imageKitQuality || 80))}" alt="${E(x.alt || x.name || '')}" ${imgAttrs(x.src, { sizes: `${nn(b.size, 42)}px` })} style="width:${nn(b.size, 42)}px;height:${nn(b.size, 42)}px;object-fit:cover;border-radius:999px;border:3px solid ${E(b.border || '#fff')};margin-right:${i ? -(nn(b.overlap, 12)) : 0}px">` : `<span style="width:${nn(b.size, 42)}px;height:${nn(b.size, 42)}px;border-radius:999px;border:3px solid ${E(b.border || '#fff')};background:#EEF4FF;display:grid;place-items:center;font-weight:900;color:${E(b.accent || '#175CD3')};margin-right:${i ? -(nn(b.overlap, 12)) : 0}px">${E(String(x.name || 'U').slice(0, 1))}</span>`).join('')}</div>${b.caption ? `<span style="margin-right:12px;color:${E(b.captionColor || '#667085')};font-size:${nn(b.captionSize, 13)}px">${rich(b.caption)}</span>` : ''}</div></div></div>`;
        case 'latestProducts': return dynProducts ? dynProducts(b) : `<div style="${S}padding:20px;border:1px dashed #CBD5E1;border-radius:14px;color:#98A2B3;text-align:center">Dynamic products unavailable</div>`;
        case 'latestPosts': return dynPosts ? dynPosts(b) : `<div style="${S}padding:20px;border:1px dashed #CBD5E1;border-radius:14px;color:#98A2B3;text-align:center">Dynamic posts unavailable</div>`;
        case 'buyButton': {
          const bg2 = b.gradient ? `linear-gradient(${E(b.gradientDir || '135deg')},${E(b.bg || '#175CD3')},${E(b.gradient2 || '#7F56D9')})` : (b.variant === 'outline' || b.variant === 'ghost' ? 'transparent' : E(b.bg || '#175CD3'));
          const btnBorder = `${nn(b.borderWidth)}px ${E(b.borderStyle || 'solid')} ${E(b.border || b.bg || '#175CD3')}`;
          const subSeg = (() => { if (b.target !== 'subpage') return ''; const raw = String(b.subpage || '').replace(/^\/+/, ''); if (raw) return '/' + raw; const first = (p && Array.isArray(p.subPages) ? p.subPages : []).find(x => x && x.path); return first ? '/' + String(first.path).replace(/^\/+/, '') : ''; })();
          const target0 = b.target === 'subpage' ? (p && p.slug ? `/product/${encodeURIComponent(p.slug)}${subSeg}` : '#buy') : (b.target === 'checkout' ? (p && p.slug ? `/checkout?product=${encodeURIComponent(p.slug)}` : '#buy') : (b.url || '#buy'));
          const target = target0 + (refQ && /^\/[^/]/.test(target0) ? (target0.includes('?') ? `&${refQ.slice(1)}` : refQ) : '');
          const badge = b.showBadge && b.badgeText ? `<span style="position:absolute;top:-12px;left:14px;background:${E(b.badgeBg || '#F79009')};color:#fff;font-size:10px;font-weight:900;padding:4px 10px;border-radius:999px;box-shadow:0 4px 10px rgba(16,24,40,.15)">${E(b.badgeText)}</span>` : '';
          const inner = b.showIcon ? `<span style="margin-left:8px">${E(b.icon || '🛒')}</span>` : '';
          const note = b.note ? `<div style="margin-top:9px;font-size:12px;color:${E(b.noteColor || '#667085')};text-align:center">${E(b.note)}</div>` : '';
          const btn = `<a class="render-button v94-buy-btn" href="${E(target)}" style="position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;background:${bg2};color:${E(b.fg || '#fff')};border:${btnBorder};border-radius:${b.pill ? 999 : nn(b.radius, 14)}px;padding:${nn(b.padY, 14)}px ${nn(b.padX, 26)}px;font-size:${nn(b.size, 16)}px;font-weight:${nn(b.weight, 800)};font-family:${b.fontFamily ? `'${E(b.fontFamily)}',Vazirmatn,system-ui` : 'var(--site-font,system-ui)'};box-shadow:${SHADOW[b.shadow || 'md']};text-decoration:none;${b.fullWidth ? 'width:100%;' : ''}${b.uppercase ? 'text-transform:uppercase;' : ''}${b.hoverScale ? 'transition:transform .15s ease;' : ''}">${inner}${E(b.label || fb('buyNow', 'همین حالا خرید کن'))}${badge}</a>`;
          return `<div style="${S}margin-top:${nn(b.marginTop, 18)}px;margin-bottom:${nn(b.marginBottom, 18)}px"><div style="display:flex;justify-content:${JUSTIFY_MAP[b.align || 'center']}">${btn}</div>${note}</div>`;
        }
        /* V121 — Upsell ارتقایافته: هر آیتم می‌تواند به یک محصول واقعی وصل شود.
           - قیمت آیتم متصل = قیمت فعلی همان محصول (سمت سرور؛ اگر مدیر قیمت را عوض کند، همین قیمت سفارش می‌شود)
           - چک‌باکس هر آیتم slug محصول را حمل می‌کند (data-upsell-check value) تا سفارش دقیق ساخته شود
           - توضیحات هر آیتم داخل اکوردیون است و پیش‌فرض بسته است
           - دکمهٔ خرید به checkout همان محصول می‌رود و runtime، آیتم‌های تیک‌خورده را با ?addons= اضافه می‌کند */
        case 'upsellBox': {
          const upPrice = (x) => { if (upsellPrices && x.productSlug && upsellPrices[String(x.productSlug)] != null) return upsellPrices[String(x.productSlug)]; return x.price; };
          /* V121.1 — مدل قیمت جدید دکمهٔ آپسل:
             • کل دکمه از قیمت «محصول همین صفحه» شروع می‌شود (از نقشهٔ سمت سرور، نه عدد تایپی basePrice)
             • آیتم اول پیش‌فرض تیک می‌خورد؛ اگر همان محصول صفحه باشد کل = همان قیمت، وگرنه به کل اضافه می‌شود
             • هر تیک جدید → جمع روی دکمه زیاد می‌شود؛ runtime همین انتخاب‌ها را با ?addons= به checkout می‌برد
             • firstRequired فقط برای آیتم دستیِ بدون اتصال است (تیک اجباری و قفل) */
          const pageSlug = String(p && p.slug || '');
          const basePriceNum = (pageSlug && upsellPrices && upsellPrices[pageSlug] != null) ? (Number(String(upsellPrices[pageSlug]).replace(/[^0-9.]/g, '')) || 0) : (Number(String(b.basePrice || '0').replace(/[^0-9.]/g, '')) || 0);
          const rows = (b.items || []).map((x, i) => {
            const linked = !!String(x.productSlug || '').trim();
            const forced = !linked && i === 0 && b.firstRequired !== false;
            const priceStr = String(upPrice(x) ?? '0');
            const priceNum = Number(String(priceStr).replace(/[^0-9.]/g, '')) || 0;
            const img = x.image ? `<img src="${E(x.image)}" alt="" style="width:56px;height:56px;border-radius:12px;object-fit:cover;flex:none">` : '';
            const off = (Number(x.comparePrice) > priceNum && priceNum > 0) ? `<s style="color:#98a2b3;font-size:12px;font-weight:500;margin-right:8px">${E(x.comparePrice)}</s>` : '';
            const acc = b.accent || '#175CD3';
            const hasDesc = !!String(x.desc || '').trim();
            const prodUrl = (linked && p && p.slug && x.productSlug !== p.slug) ? `/product/${encodeURIComponent(x.productSlug)}` : '';
            const hasBody = hasDesc || prodUrl;
            const body = hasBody ? `<div class="v104-upsell-body" style="display:none;padding:0 14px 14px 14px;border-top:1px dashed ${E(b.borderColor || '#EAECF0')};margin:0 0 0 0">${hasDesc ? `<p style="margin:10px 0 0;font-size:12.5px;color:${E(b.muted || '#667085')};line-height:1.9">${rich(x.desc)}</p>` : ''}${prodUrl ? `<a href="${E(prodUrl)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;color:${E(acc)};font-weight:800;font-size:12px;text-decoration:none">مشاهده محصول ↗</a>` : ''}</div>` : '';
            const toggle = hasBody ? `<button type="button" class="v104-upsell-toggle" aria-label="جزئیات" style="flex:none;width:30px;height:30px;display:grid;place-items:center;border:none;border-radius:999px;background:transparent;color:${E(b.muted || '#667085')};cursor:pointer;font-size:14px;transition:transform .15s ease" onclick="var r=this.closest('.v104-upsell-item');var bd=r&&r.querySelector('.v104-upsell-body');if(bd){var open=bd.style.display!=='none';bd.style.display=open?'none':'block';this.style.transform=open?'':'rotate(180deg)';}">▾</button>` : '';
            return `<div class="v104-upsell-item" data-upsell-item data-price="${priceNum}" style="border:1.5px solid ${forced ? acc : E(b.borderColor || '#EAECF0')};border-radius:${Math.max(4, (nn(b.radius, 20)) - 8)}px;background:${E(b.itemBg || '#FFFFFF')};overflow:hidden;text-align:right">
              <div style="display:flex;align-items:center;gap:12px;padding:14px">
                <label style="flex:1;min-width:0;display:flex;align-items:center;gap:12px;cursor:pointer">
                  <input type="checkbox" data-upsell-check value="${E(x.productSlug || '')}" ${forced ? 'checked disabled' : (i === 0 ? 'checked' : '')} style="width:20px;height:20px;accent-color:${E(acc)};flex:none">
                  ${img}
                  <span style="flex:1;min-width:0;text-align:right"><strong style="display:block;font-size:${nn(b.titleSize, 15)}px;color:${E(b.fg || '#101828')}">${E(x.title || '')}</strong><span style="display:block;margin-top:4px;font-weight:800;color:${E(acc)};font-size:14px">${E(priceStr)}${off}</span></span>
                </label>
                ${toggle}
              </div>
              ${body}
            </div>`;
          }).join('');
          const head = `${b.eyebrow ? `<span style="display:inline-block;padding:6px 14px;border-radius:999px;background:${(b.accent || '#175CD3')}18;color:${b.accent || '#175CD3'};font-size:12px;font-weight:800">${E(b.eyebrow)}</span>` : ''}${b.title ? `<h3 style="font-size:${nn(b.titleSize, 24)}px;font-weight:900;margin:12px 0 6px;color:${b.fg || '#101828'}">${E(b.title)}</h3>` : ''}${b.subtitle ? `<p style="font-size:14px;color:${b.muted || '#667085'};line-height:1.9;margin:0 0 18px">${E(b.subtitle)}</p>` : ''}`;
          const saveNote = b.saveNote ? `<span style="background:#ECFDF3;color:#027A48;font-size:11px;font-weight:800;padding:4px 10px;border-radius:999px">${E(b.saveNote)}</span>` : '';
          const btnStyle = `display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;border:none;border-radius:${Math.max(4, (nn(b.radius, 20)) - 6)}px;background:${E(b.bg || '#175CD3')};color:${E(b.fg2 || '#FFFFFF')};font-size:${nn(b.btnSize, 16)}px;font-weight:900;padding:15px 20px;cursor:pointer;margin-top:14px;font-family:inherit;text-decoration:none`;
          const firstItem = (b.items || [])[0];
          const firstVal = firstItem ? String(firstItem.productSlug || '').trim() : '';
          const firstPriceNum = firstItem ? (Number(String(upPrice(firstItem) ?? '0').replace(/[^0-9.]/g, '')) || 0) : 0;
          const initialTotal = basePriceNum + ((pageSlug && firstVal && firstVal === pageSlug) ? 0 : firstPriceNum);
          const btnInner = `<span>${E(b.btnLabel || 'Get This Course Now')}</span><span data-upsell-total style="font-variant-numeric:tabular-nums">${E(String(initialTotal))}</span>`;
          /* در صفحهٔ واقعیِ محصول دکمه به checkout لینک می‌شود و runtime آیتم‌های تیک‌خورده را اضافه می‌کند؛ بیرون از محصول (ادیتور/صفحات دیگر) همان دکمهٔ قبلی می‌ماند */
          const btn = (p && p.slug)
            ? `<a href="/checkout?product=${encodeURIComponent(p.slug)}" class="v104-upsell-btn" data-upsell-product="${E(p.slug)}" style="${btnStyle}">${btnInner}</a>`
            : `<button type="button" class="v104-upsell-btn" style="${btnStyle}">${btnInner}</button>`;
          return `<div class="v104-upsell" data-upsell-base="${basePriceNum}" style="${S}background:${b.cardBg || '#F8FAFC'};border:1px solid ${b.borderColor || '#EAECF0'};border-radius:${nn(b.radius, 20)}px;padding:${nn(b.padY, 26)}px ${nn(b.padX, 20)}px;font-family:${b.fontFamily ? `'${E(b.fontFamily)}',Vazirmatn,system-ui` : 'var(--site-font,system-ui)'};text-align:${alignOf(b, 'center')};">${head}<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><strong style="font-size:15px;color:${b.fg || '#101828'}">${E(b.itemsTitle || 'ADD UPSELLS')}</strong>${saveNote}</div><div style="display:grid;gap:10px">${rows}</div>${btn}${b.note ? `<div style="margin-top:10px;font-size:12px;color:${b.muted || '#667085'};text-align:center">${E(b.note)}</div>` : ''}</div>`;
        }
        case 'offerCard': {
          const oldP = (Number(b.comparePrice) > Number(b.price) && Number(b.price) > 0) ? `<s style="opacity:.55;font-size:.6em;font-weight:600;margin-right:8px">${E(b.comparePrice)}</s>` : '';
          return `<div style="${S}position:relative;background:${b.bg || '#FFFFFF'};border:1px solid ${b.borderColor || '#EAECF0'};border-radius:${nn(b.radius, 18)}px;padding:${nn(b.padY, 18)}px ${nn(b.padX, 18)}px;text-align:${alignOf(b, 'center')};font-family:${b.fontFamily ? `'${E(b.fontFamily)}',Vazirmatn,system-ui` : 'var(--site-font,system-ui)'};overflow:hidden">${b.badge ? `<span style="position:absolute;top:14px;left:14px;background:${b.badgeBg || '#F79009'};color:#fff;font-size:11px;font-weight:900;padding:5px 12px;border-radius:999px;z-index:2">${E(b.badge)}</span>` : ''}${b.image ? `<img src="${E(b.image)}" alt="" style="width:100%;height:${nn(b.imageHeight, 180)}px;object-fit:cover;border-radius:${Math.max(0, (nn(b.radius, 18)) - 6)}px;margin-bottom:14px">` : ''}${b.eyebrow ? `<span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${(b.accent || '#175CD3')}18;color:${b.accent || '#175CD3'};font-size:11px;font-weight:800">${E(b.eyebrow)}</span>` : ''}<h3 style="font-size:${nn(b.titleSize, 22)}px;font-weight:900;margin:10px 0 6px;color:${b.fg || '#101828'}">${E(b.title || '')}</h3>${b.desc ? `<p style="font-size:13px;color:${b.muted || '#667085'};line-height:1.9;margin:0 0 12px">${E(b.desc)}</p>` : ''}<div style="font-size:${nn(b.priceSize, 30)}px;font-weight:900;color:${b.priceColor || (b.accent || '#175CD3')}">${E(b.currency || '$')}${E(b.price || '0')}${oldP}</div><a class="render-button" href="${E(saleHref(b))}" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:14px;background:${b.btnBg || (b.accent || '#175CD3')};color:${b.btnFg || '#FFFFFF'};border-radius:${nn(b.btnRadius, 14)}px;padding:14px 20px;font-size:${nn(b.btnSize, 15)}px;font-weight:900;text-decoration:none">${E(b.btnLabel || 'BUY NOW')}</a>${b.note ? `<div style="margin-top:10px;font-size:12px;color:${b.muted || '#667085'}">${E(b.note)}</div>` : ''}</div>`;
        }
        case 'countdownOffer': {
          const box = (id, l) => `<span style="display:grid;gap:2px;justify-items:center;background:${b.digitBg || '#FFFFFF14'};color:${b.digitColor || '#FFFFFF'};border-radius:12px;padding:10px 8px;min-width:56px"><b data-cd-${id} style="font-size:${nn(b.digitSize, 24)}px;font-weight:900;font-variant-numeric:tabular-nums">00</b><i style="font-style:normal;font-size:10px;opacity:.75">${l}</i></span>`;
          return `<div class="v104-countdown" data-cd-minutes="${nn(b.minutes, 60)}" data-cd-key="${E(b.id || '')}" style="${S}text-align:center;background:${b.bg || '#101828'};border-radius:${nn(b.radius, 20)}px;padding:${nn(b.padY, 24)}px ${nn(b.padX, 18)}px;font-family:${b.fontFamily ? `'${E(b.fontFamily)}',Vazirmatn,system-ui` : 'var(--site-font,system-ui)'}">${b.title ? `<div style="font-size:${nn(b.titleSize, 18)}px;font-weight:900;color:${b.fg || '#FFFFFF'};margin-bottom:14px">${E(b.title)}</div>` : ''}<div style="display:flex;justify-content:center;gap:8px" dir="ltr">${box('h', 'HRS')}${box('m', 'MIN')}${box('s', 'SEC')}</div>${b.note ? `<div style="margin-top:12px;font-size:12px;color:${b.noteColor || '#98a2b3'}">${E(b.note)}</div>` : ''}${b.ctaLabel ? `<a class="render-button" href="${E(saleHref(b))}" style="display:inline-flex;align-items:center;margin-top:16px;background:${b.btnBg || (b.accent || '#F79009')};color:${b.btnFg || '#FFFFFF'};border-radius:${nn(b.btnRadius, 12)}px;padding:13px 26px;font-size:${nn(b.btnSize, 15)}px;font-weight:900;text-decoration:none">${E(b.ctaLabel)}</a>` : ''}</div>`;
        }
        case 'stickyBuyBar': {
          const img = b.image ? `<img src="${E(b.image)}" alt="" style="width:44px;height:44px;border-radius:10px;object-fit:cover;flex:none">` : '';
          const oldP = (Number(b.comparePrice) > Number(b.price) && Number(b.price) > 0) ? `<s style="opacity:.6;font-size:12px;font-weight:600;margin-right:6px">${E(b.comparePrice)}</s>` : '';
          return `<div class="v104-stickybar" style="${S}position:sticky;bottom:12px;z-index:30;display:flex;align-items:center;gap:12px;background:${b.bg || '#FFFFFF'};border:1px solid ${b.borderColor || '#EAECF0'};border-radius:${nn(b.radius, 16)}px;padding:10px 12px;box-shadow:0 12px 34px rgba(16,24,40,.16);font-family:${b.fontFamily ? `'${E(b.fontFamily)}',Vazirmatn,system-ui` : 'var(--site-font,system-ui)'}">${img}<span style="flex:1;min-width:0;text-align:${alignOf(b, 'right')}"><strong style="display:block;font-size:${nn(b.titleSize, 14)}px;color:${b.fg || '#101828'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${E(b.title || '')}</strong><span style="font-weight:900;color:${b.priceColor || (b.accent || '#175CD3')};font-size:15px">${E(b.currency || '$')}${E(b.price || '0')}${oldP}</span></span><a class="render-button" href="${E(saleHref(b))}" style="flex:none;display:inline-flex;align-items:center;background:${b.btnBg || (b.accent || '#175CD3')};color:${b.btnFg || '#FFFFFF'};border-radius:${nn(b.btnRadius, 12)}px;padding:12px 18px;font-size:${nn(b.btnSize, 14)}px;font-weight:900;text-decoration:none">${E(b.btnLabel || 'BUY')}</a></div>`;
        }
        case 'group': { /* V147 — padding lives on an inner layer (4 sides, like every other container) so Edge-to-edge children escape it exactly */
          const gpt = nn(b.padTop, nn(b.padY, 0)), gpb = nn(b.padBottom, nn(b.padY, 0)), gpr = nn(b.padRight, nn(b.padX, 0)), gpl = nn(b.padLeft, nn(b.padX, 0));
          const gGap = Math.max(0, nn(b.innerGap, 0));
          return `<div class="render-group" style="${shellStyle(b, 'right', { padXY: true })}background:${E(b.bg || 'transparent')};border:${b.borderWidth ? `${nn(b.borderWidth)}px solid ${E(b.border || '#EAECF0')}` : '0'};border-radius:${nn(b.radius)}px;box-shadow:${SHADOW[b.shadow || 'none'] || 'none'};"><div class="render-group__inner" data-rava-inner="1" style="box-sizing:border-box;padding:${gpt}px ${gpr}px ${gpb}px ${gpl}px;--rv-pl:${gpl}px;--rv-pr:${gpr}px;${gGap ? `display:flex;flex-direction:column;gap:${gGap}px;` : ''}">${renderBlocks(b.blocks || [])}</div></div>`;
        }
        case 'trustBar': { const per = Math.max(1, Math.min(6, nn(b.perRow, 3))); return `<div style="${S}display:grid;grid-template-columns:repeat(${per},minmax(0,1fr));gap:${nn(b.gap, 14)}px;text-align:center">${(b.items || []).map(x => `<div><div style="font-size:${nn(b.iconSize, 24)}px;color:${E(b.iconColor || '#175CD3')};background:${E(b.iconBg || '#EEF4FF')};width:52px;height:52px;border-radius:50%;display:grid;place-items:center;margin:0 auto 10px">${E(x.icon || '')}</div><strong style="display:block;font-size:${nn(b.titleSize, 15)}px;font-weight:${nn(b.titleWeight, 800)}">${E(x.title || '')}</strong><span style="font-size:${nn(b.textSize, 12)}px;color:${E(b.textColor || '#667085')}">${E(x.text || '')}</span></div>`).join('')}</div>`; }
        case 'iconGrid': { const per = Math.max(1, Math.min(6, nn(b.perRow, 3))); return `<div style="${S}">${b.title ? `<h3 style="${common(b)}font-size:26px;font-weight:800;margin:0 0 18px">${E(b.title)}</h3>` : ''}<div style="display:grid;grid-template-columns:repeat(${per},minmax(0,1fr));gap:${nn(b.gap, 18)}px">${(b.items || []).map(x => `<div><div style="font-size:${nn(b.iconSize, 24)}px;color:${E(b.iconColor || '#175CD3')};background:${E(b.iconBg || '#EEF4FF')};width:52px;height:52px;border-radius:14px;display:grid;place-items:center;margin-bottom:12px">${E(x.icon || '')}</div><strong style="display:block;font-size:${nn(b.titleSize, 16)}px;margin-bottom:6px">${E(x.title || '')}</strong><p style="margin:0;font-size:${nn(b.textSize, 13)}px;line-height:1.85;color:#667085">${E(x.text || '')}</p></div>`).join('')}</div></div>`; }
        case 'steps': { const per = Math.max(1, Math.min(6, nn(b.perRow, 3))); return `<div style="${S}display:grid;grid-template-columns:repeat(${per},minmax(0,1fr));gap:${nn(b.gap, 22)}px">${(b.items || []).map((x, i) => `<div><div style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-weight:900;background:${E(b.numberBg || '#175CD3')};color:${E(b.numberColor || '#fff')};margin-bottom:12px">${E(x.number || String(i + 1).padStart(2, '0'))}</div><strong style="display:block;font-size:${nn(b.titleSize, 17)}px;margin-bottom:6px">${E(x.title || '')}</strong><p style="margin:0;font-size:${nn(b.textSize, 13)}px;line-height:1.85;color:#667085">${E(x.text || '')}</p></div>`).join('')}</div>`; }
        case 'timeline': return `<div style="${S}display:grid;gap:${nn(b.gap, 18)}px;position:relative">${(b.items || []).map(x => `<div style="display:flex;gap:14px;align-items:flex-start"><span style="flex:none;width:${nn(b.radioSize, 12)}px;height:${nn(b.radioSize, 12)}px;border-radius:50%;background:${E(b.dot || '#175CD3')};margin-top:7px"></span><div style="flex:1;background:${E(b.itemBg || '#fff')};border:1px solid ${E(b.line || '#D0D5DD')};border-radius:${nn(b.itemRadius, 14)}px;padding:${nn(b.itemPadding, 16)}px"><strong style="display:block;font-size:${nn(b.titleSize, 16)}px;font-weight:${nn(b.titleWeight, 800)};color:${E(b.titleColor || '#101828')};margin-bottom:5px">${E(x.title || '')}</strong><p style="margin:0;font-size:${nn(b.textSize, 13)}px;line-height:1.85;color:${E(b.textColor || '#667085')}">${E(x.text || '')}</p></div></div>`).join('')}</div>`;
        case 'roadmap': {
          const rmDot = { done: '#12B76A', current: '#175CD3', next: '#D0D5DD' };
          const rmTxt = { done: '#067647', current: '#175CD3', next: '#98A2B3' };
          return `<div style="${S}position:relative;padding:6px 4px"><span style="position:absolute;top:22px;bottom:22px;right:17px;width:2px;background:${E(b.line || '#EAECF0')}"></span><div style="display:grid;gap:${nn(b.gap, 16)}px">${(b.items || []).map((x, i) => { const st = x.status || b.status || (i === 0 ? 'current' : 'next'); const dc = rmDot[st] || rmDot.next; return `<div style="display:flex;gap:14px;align-items:flex-start;position:relative"><span style="flex:none;width:28px;height:28px;border-radius:50%;background:${E(x.dotBg || b.dotBg || '#FFFFFF')};border:2px solid ${dc};display:grid;place-items:center;font-size:12px;font-weight:900;color:${dc};position:relative;z-index:1">${st === 'done' ? '✓' : (i + 1)}</span><div style="flex:1;background:${E(x.bg || b.itemBg || '#FFFFFF')};border:1px solid ${E(st === 'current' ? (b.accent || '#175CD3') : (b.line || '#EAECF0'))};border-radius:${nn(b.itemRadius, 16)}px;padding:${nn(b.itemPadding, 16)}px;box-shadow:${st === 'current' ? '0 8px 24px rgba(23,92,211,.10)' : 'none'}"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:${nn(b.iconSize, 18)}px">${E(x.icon || '')}</span><strong style="font-size:${nn(b.titleSize, 16)}px;font-weight:${nn(b.titleWeight, 800)};color:${E(x.titleColor || b.titleColor || '#101828')}">${E(x.title || 'مرحله')}</strong>${x.tag ? `<span style="font-size:11px;font-weight:800;padding:3px 9px;border-radius:999px;background:${E(rmTxt[st] || '#98A2B3')}1A;color:${rmTxt[st] || '#98A2B3'}">${E(x.tag)}</span>` : ''}</div><p style="margin:6px 0 0;font-size:${nn(b.textSize, 14)}px;line-height:1.9;color:${E(x.textColor || b.textColor || '#475467')}">${E(x.text || '')}</p>${x.meta ? `<div style="margin-top:9px;font-size:12px;font-weight:700;color:${rmTxt[st] || '#98A2B3'}">${E(x.meta)}</div>` : ''}</div></div>`; }).join('')}</div></div>`;
        }
        case 'forWho': {
          const fwCard = (title, items, bg, border, icon, iconBg, iconColor) => `<div style="flex:1;min-width:240px;background:${E(bg)};border:1px solid ${E(border)};border-radius:${nn(b.radius, 20)}px;padding:${nn(b.padding, 22)}px"><div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><span style="width:38px;height:38px;border-radius:12px;background:${E(iconBg)};display:grid;place-items:center;font-size:18px;color:${E(iconColor)}">${E(icon)}</span><strong style="font-size:${nn(b.titleSize, 17)}px;font-weight:800;color:${E(b.titleColor || '#101828')}">${E(title)}</strong></div><ul style="margin:0;padding:0;list-style:none;display:grid;gap:9px">${(items || []).filter(Boolean).map(t => `<li style="display:flex;gap:8px;align-items:flex-start;font-size:${nn(b.textSize, 14)}px;line-height:1.8;color:${E(b.textColor || '#475467')}"><span style="color:${E(iconColor)};font-weight:900">${E(icon)}</span><span>${E(t)}</span></li>`).join('')}</ul></div>`;
          return `<div style="${S}display:flex;gap:${nn(b.gap, 16)}px;flex-wrap:wrap">${fwCard(b.yesTitle || 'این دوره برای توست اگر…', b.yesItems, b.yesBg || '#F0FDF4', b.yesBorder || '#ABEFC6', '✓', b.yesIconBg || '#DCFAE6', b.yesColor || '#067647')}${fwCard(b.noTitle || 'برای تو نیست اگر…', b.noItems, b.noBg || '#FEF3F2', b.noBorder || '#FECDCA', '×', b.noIconBg || '#FEE4E2', b.noColor || '#B42318')}</div>`;
        }
        case 'bonusStack': {
          const bsItems = (b.items || []);
          const bsTotal = bsItems.reduce((s, x) => s + (Number(String(x.value || '').replace(/[^0-9]/g, '')) || 0), 0);
          return `<div style="${S}background:${E(b.bg || '#FFFFFF')};border:1px solid ${E(b.border || '#EAAA08')};border-radius:${nn(b.radius, 24)}px;padding:${nn(b.padY, 26)}px ${nn(b.padX, 24)}px;max-width:640px;margin-left:auto;margin-right:auto"><div style="text-align:center;margin-bottom:18px">${b.kicker ? `<div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:${E(b.accent || '#B54708')};margin-bottom:6px">${E(b.kicker)}</div>` : ''}<strong style="font-size:${nn(b.titleSize, 22)}px;font-weight:900;color:${E(b.titleColor || '#101828')}">${E(b.title || 'ثبت‌نام امروز، این بونوس‌ها رایگان')}</strong></div><div style="display:grid;gap:${nn(b.gap, 12)}px">${bsItems.map(x => `<div style="display:flex;align-items:center;gap:12px;background:${E(b.itemBg || '#FFFCF5')};border:1px solid ${E(b.itemBorder || '#FEDF89')};border-radius:14px;padding:13px 16px"><span style="font-size:20px">${E(x.icon || '🎁')}</span><div style="flex:1"><strong style="display:block;font-size:${nn(b.textSize, 15)}px;color:${E(b.textColor || '#101828')}">${E(x.title || 'بونوس')}</strong>${x.text ? `<span style="font-size:12px;color:#667085">${E(x.text)}</span>` : ''}</div>${x.value ? `<span style="font-weight:900;color:${E(b.accent || '#B54708')};white-space:nowrap">${E(x.value)}</span>` : ''}</div>`).join('')}</div>${b.showTotal !== false && bsTotal > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:14px;border-top:2px dashed ${E(b.itemBorder || '#FEDF89')}"><strong style="font-size:15px;color:${E(b.titleColor || '#101828')}">ارزش کل بونوس‌ها</strong><strong style="font-size:20px;font-weight:900;color:${E(b.accent || '#B54708')}">${bsTotal.toLocaleString('fa-IR')} تومان</strong></div>` : ''}${b.cta ? `<div style="text-align:center;margin-top:16px"><a href="${E(b.ctaUrl || '#')}" style="display:inline-block;background:${E(b.ctaBg || b.accent || '#B54708')};color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:13px 26px;border-radius:12px">${E(b.cta)}</a></div>` : ''}</div>`;
        }
        case 'beforeAfter': {
          const baPanel = (label, text, bg, border, color, icon) => `<div style="flex:1;min-width:220px;background:${E(bg)};border:1px solid ${E(border)};border-radius:${nn(b.radius, 18)}px;padding:${nn(b.padding, 20)}px"><div style="font-size:12px;font-weight:800;letter-spacing:.1em;color:${E(color)};margin-bottom:8px">${E(icon)} ${E(label)}</div><p style="margin:0;font-size:${nn(b.textSize, 14)}px;line-height:1.9;color:${E(b.textColor || '#475467')}">${E(text || '')}</p></div>`;
          return `<div style="${S}display:flex;gap:${nn(b.gap, 14)}px;flex-wrap:wrap;align-items:stretch">${baPanel(b.beforeLabel || 'قبل', b.beforeText, b.beforeBg || '#FEF3F2', b.beforeBorder || '#FECDCA', b.beforeColor || '#B42318', '○')}${baPanel(b.afterLabel || 'بعد', b.afterText, b.afterBg || '#F0FDF4', b.afterBorder || '#ABEFC6', b.afterColor || '#067647', '●')}${b.note ? `<div style="width:100%;text-align:center;font-size:13px;font-weight:700;color:${E(b.noteColor || '#175CD3')};margin-top:2px">${E(b.note)}</div>` : ''}</div>`;
        }
        case 'curriculum': {
          const cuModules = (b.modules || []);
          const cuLessons = cuModules.reduce((s, m) => s + (m.lessons || []).length, 0);
          return `<div style="${S}background:${E(b.bg || '#FFFFFF')};border:1px solid ${E(b.border || '#EAECF0')};border-radius:${nn(b.radius, 22)}px;padding:${nn(b.padY, 22)}px ${nn(b.padX, 20)}px;max-width:720px;margin-left:auto;margin-right:auto"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:16px"><strong style="font-size:${nn(b.titleSize, 20)}px;font-weight:900;color:${E(b.titleColor || '#101828')}">${E(b.title || 'سرفصل‌های دوره')}</strong><span style="font-size:12px;font-weight:800;color:${E(b.accent || '#175CD3')};background:${E(b.accent || '#175CD3')}1A;padding:4px 12px;border-radius:999px">${cuModules.length} ماژول • ${cuLessons} درس</span></div><div style="display:grid;gap:${nn(b.gap, 10)}px">${cuModules.map((m, mi) => `<details ${mi === 0 && b.openFirst ? 'open' : ''} style="background:${E(b.moduleBg || '#F8FAFC')};border:1px solid ${E(b.moduleBorder || '#EAECF0')};border-radius:14px;overflow:hidden"><summary style="display:flex;align-items:center;gap:10px;padding:13px 16px;cursor:pointer;list-style:none"><span style="font-size:11px;font-weight:900;color:${E(b.accent || '#175CD3')};background:#fff;border:1px solid ${E(b.moduleBorder || '#EAECF0')};border-radius:8px;padding:3px 8px">${String(mi + 1).padStart(2, '0')}</span><strong style="flex:1;font-size:${nn(b.textSize, 15)}px;color:${E(b.textColor || '#101828')}">${E(m.title || 'ماژول')}</strong><span style="font-size:12px;color:#98A2B3;white-space:nowrap">${E(m.meta || `${(m.lessons || []).length} درس`)}</span><span style="font-size:14px">${m.locked === false ? '🔓' : '🔒'}</span></summary><div style="padding:2px 16px 13px;display:grid;gap:7px">${(m.lessons || []).map(l => `<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#475467"><span style="color:${E(b.accent || '#175CD3')}">▸</span><span>${E(l)}</span></div>`).join('') || '<span style="font-size:13px;color:#98A2B3">درسی ثبت نشده</span>'}</div></details>`).join('')}</div></div>`;
        }
        case 'instructor': {
          const inAvatar = b.avatar ? `<img src="${E(b.avatar)}" alt="" style="width:88px;height:88px;border-radius:50%;object-fit:cover;border:3px solid ${E(b.accent || '#175CD3')}22">` : `<span style="width:88px;height:88px;border-radius:50%;background:${E(b.accent || '#175CD3')}1A;display:grid;place-items:center;font-size:34px;font-weight:900;color:${E(b.accent || '#175CD3')}">${E(String(b.name || 'م').slice(0, 1))}</span>`;
          return `<div style="${S}background:${E(b.bg || '#F8FAFC')};border:1px solid ${E(b.border || '#EAECF0')};border-radius:${nn(b.radius, 24)}px;padding:${nn(b.padY, 26)}px ${nn(b.padX, 24)}px;max-width:680px;margin-left:auto;margin-right:auto"><div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">${inAvatar}<div style="flex:1;min-width:220px">${b.kicker ? `<div style="font-size:11px;font-weight:800;letter-spacing:.12em;color:${E(b.accent || '#175CD3')};margin-bottom:4px">${E(b.kicker)}</div>` : ''}<strong style="display:block;font-size:${nn(b.nameSize, 20)}px;font-weight:900;color:${E(b.titleColor || '#101828')}">${E(b.name || 'نام مدرس')}</strong>${b.role ? `<span style="font-size:13px;color:#667085">${E(b.role)}</span>` : ''}<p style="margin:10px 0 0;font-size:${nn(b.textSize, 14)}px;line-height:1.9;color:${E(b.textColor || '#475467')}">${E(b.bio || '')}</p></div></div>${(b.creds || []).filter(Boolean).length ? `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:18px">${(b.creds || []).filter(Boolean).map(c => `<div style="display:flex;gap:8px;align-items:center;background:#fff;border:1px solid ${E(b.border || '#EAECF0')};border-radius:12px;padding:10px 13px"><span style="color:${E(b.accent || '#175CD3')};font-weight:900">✓</span><span style="font-size:13px;font-weight:600;color:${E(b.textColor || '#344054')}">${E(c)}</span></div>`).join('')}</div>` : ''}</div>`;
        }
        case 'ctaSplit': return `<div style="${S}background:${E(b.bg || '#101828')};color:${E(b.fg || '#fff')};border-radius:${nn(b.radius, 24)}px;padding:${nn(b.pad, 28)}px;display:grid;grid-template-columns:${b.image ? '1.2fr .8fr' : '1fr'};gap:22px;align-items:center"><div><h3 style="margin:0 0 10px;font-size:30px;font-weight:900">${E(b.title || '')}</h3><p style="margin:0 0 18px;opacity:.85;line-height:1.85">${E(b.text || '')}</p><a href="${E(withRef(String(b.url || '#')))}" style="display:inline-block;background:${E(b.accent || '#175CD3')};color:#fff;padding:13px 22px;border-radius:12px;font-weight:800">${E(b.button || '')}</a></div>${b.image ? `<img src="${E(b.image)}" alt="" loading="lazy" style="width:100%;height:auto;border-radius:16px;display:block">` : ''}</div>`;
        case 'videoHero': return `<div style="${S}background:${E(b.bg || '#101828')};color:${E(b.fg || '#fff')};border-radius:${nn(b.radius, 28)}px;padding:${nn(b.padY, 44)}px ${nn(b.padX, 28)}px;display:grid;gap:18px;justify-items:center;text-align:center"><div style="font-size:11px;font-weight:800;letter-spacing:.1em;opacity:.75">${E(b.kicker || 'VIDEO')}</div><h2 style="margin:0;font-size:${nn(b.titleSize, 40)}px;font-weight:900;line-height:1.15">${E(b.title || '')}</h2><div style="font-size:${nn(b.textSize, 16)}px;line-height:1.9;opacity:.85">${E(b.text || '')}</div>${b.videoUrl ? `<div style="width:100%;max-width:680px;aspect-ratio:${E(b.aspect || '16/9')};border-radius:16px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.35)"><video src="${E(b.videoUrl)}"${b.poster ? ` poster="${E(b.poster)}"` : ''} controls style="width:100%;height:100%;object-fit:cover"></video></div>` : `<div style="width:100%;max-width:680px;aspect-ratio:${E(b.aspect || '16/9')};border-radius:16px;background:rgba(255,255,255,.08);display:grid;place-items:center;font-size:44px">▶</div>`}<a href="${E(withRef(String(b.ctaUrl || '#')))}" style="background:${E(b.accent || '#175CD3')};color:#fff;padding:13px 22px;border-radius:12px;text-decoration:none;font-weight:800">${E(b.cta || 'شروع کن')}</a></div>`;
        case 'offerBox': return `<div style="${S}position:relative;background:${E(b.bg || '#fff')};color:${E(b.fg || '#101828')};border:${nn(b.borderWidth, 2)}px solid ${E(b.border || '#FEE4C2')};border-radius:${nn(b.radius, 24)}px;padding:${nn(b.padY, 26)}px ${nn(b.padX, 26)}px;box-shadow:0 24px 60px rgba(16,24,40,.16);display:grid;gap:12px;justify-items:center;text-align:center">${b.badge ? `<span style="position:absolute;top:-14px;right:20px;background:${E(b.badgeBg || '#F79009')};color:${E(b.badgeColor || '#fff')};font-weight:900;font-size:12px;padding:5px 14px;border-radius:999px">${E(b.badge)}</span>` : ''}<div style="font-size:11px;font-weight:800;letter-spacing:.1em;color:${E(b.accent || '#F79009')}">${E(b.kicker || 'پیشنهاد ویژه')}</div><h3 style="margin:0;font-size:${nn(b.titleSize, 26)}px;font-weight:900">${E(b.title || '')}</h3>${b.oldPrice ? `<div style="font-size:15px;color:#98A2B3;text-decoration:line-through">${E(b.oldPrice)}</div>` : ''}<div style="font-size:${nn(b.priceSize, 44)}px;font-weight:900;color:${E(b.accent || '#F79009')}">${E(b.price || '')}</div><div style="font-size:12px;color:#B54708;background:#FFFAEB;border-radius:999px;padding:4px 12px">${E(b.note || '')}</div><div style="display:grid;gap:7px;text-align:right;width:100%;max-width:340px">${(b.items || []).map(it => `<div style="display:flex;gap:8px;align-items:center;font-size:14px"><span style="color:${E(b.accent || '#067647')};font-weight:900">✓</span><span>${E(typeof it === 'string' ? it : (it && it.text) || '')}</span></div>`).join('')}</div><a href="${E(withRef(String(b.ctaUrl || '#')))}" style="width:100%;max-width:340px;background:${E(b.accent || '#F79009')};color:#fff;padding:14px;border-radius:14px;text-decoration:none;font-weight:900;font-size:16px">${E(b.cta || 'همین حالا بگیر')}</a></div>`;
        case 'testiMarquee': { const mq = (b.variant === 'logos' ? (helpers.logoMarqueeRender || ((x) => '')) : (helpers.testiMarqueeRender || ((x) => '')))(b); const css = helpers.RAVA_MARQUEE_CSS || ''; return mq && String(mq).trim() ? mq + css : ''; }
        case 'logoWall': return b.marquee ? (helpers.logoMarqueeRender || (() => ''))({ mode: b.marqueeMode || 'auto', speed: b.speed || 30, direction: b.direction, pauseOnHover: b.pauseOnHover, gap: b.gap, size: b.size, opacity: b.opacity, color: b.color, grayscale: true, logos: (b.items || []).map(it => ({ text: typeof it === 'string' ? it : (it && it.text) || '' })) }) + (helpers.RAVA_MARQUEE_CSS || '') : `<div style="${S}display:grid;gap:14px;justify-items:center;text-align:center;margin-top:${nn(b.marginTop)}px;margin-bottom:${nn(b.marginBottom)}px">${b.title ? `<div style="font-size:12px;font-weight:700;color:#667085;letter-spacing:.06em">${E(b.title)}</div>` : ''}<div style="display:flex;flex-wrap:wrap;gap:${nn(b.gap, 16)}px ${nn(b.gap, 16) * 2}px;justify-content:center;align-items:center">${(b.items || []).map(it => `<span style="font-weight:900;font-size:${nn(b.size, 17)}px;color:${E(b.color || '#98A2B3')};opacity:${(nn(b.opacity, 80)) / 100};white-space:nowrap">${E(typeof it === 'string' ? it : (it && it.text) || '')}</span>`).join('')}</div></div>`;
        case 'caseStudy': return `<div style="${S}background:${E(b.bg || '#F8FAFC')};color:${E(b.fg || '#101828')};border-radius:${nn(b.radius, 24)}px;padding:${nn(b.padY, 28)}px ${nn(b.padX, 28)}px;display:grid;gap:14px">${b.image ? `<img src="${E(b.image)}" alt="" loading="lazy" style="width:100%;height:180px;object-fit:cover;border-radius:14px">` : ''}<div style="font-size:11px;font-weight:800;letter-spacing:.1em;color:${E(b.accent || '#175CD3')}">${E(b.kicker || 'CASE STUDY')}</div><h3 style="margin:0;font-size:${nn(b.titleSize, 24)}px;font-weight:900">${E(b.title || '')}</h3><div style="font-size:14px;line-height:1.9;color:#475467">${E(b.text || '')}</div><div style="display:flex;gap:12px;flex-wrap:wrap">${(b.metrics || []).map(m => `<div style="flex:1;min-width:90px;background:#fff;border:1px solid #EAECF0;border-radius:14px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:900;color:${E(b.metricColor || '#175CD3')}">${E(m.value || '')}</div><div style="font-size:11px;color:#667085">${E(m.label || '')}</div></div>`).join('')}</div>${b.cta ? `<a href="${E(withRef(String(b.ctaUrl || '#')))}" style="width:max-content;background:${E(b.accent || '#175CD3')};color:#fff;padding:11px 18px;border-radius:12px;text-decoration:none;font-weight:800;font-size:14px">${E(b.cta)}</a>` : ''}</div>`;
        case 'popupSection': return renderPopupSection(b); /* V137 — Pop Up: سکشن شناور؛ عنصر popup قدیمی حذف شد */
        case 'mediaMarquee': return renderMediaMarquee(b); /* V137 — Marquee تصویری */
        case 'productShowcase': return `<div style="${S}background:${E(b.bg || '#fff')};border:1px solid ${E(b.border || '#EAECF0')};border-radius:${nn(b.radius, 18)}px;padding:${nn(b.padY, 24)}px ${nn(b.padX, 20)}px;display:grid;gap:14px">${b.title ? `<h3 style="margin:0;font-size:${nn(b.titleSize, 20)}px;font-weight:900;text-align:center">${E(b.title || '')}</h3>` : ''}<div style="display:grid;grid-template-columns:repeat(${Math.max(1, Math.min(6, nn(b.perRow, 3)))},1fr);gap:${nn(b.gap, 14)}px">${(b.images || []).map(im => `<div style="aspect-ratio:4/3;border-radius:14px;background:#F2F4F7;display:grid;place-items:center;overflow:hidden">${im && im.src ? `<img src="${E(im.src)}" alt="${E(im.alt || '')}" loading="lazy" style="width:100%;height:100%;object-fit:cover">` : '<span style="font-size:26px;opacity:.4">🖼</span>'}</div>`).join('')}</div>${b.showCta ? `<a href="${E(withRef(String(b.ctaUrl || '#')))}" style="justify-self:center;background:#175CD3;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:800">${E(b.cta || 'مشاهده و خرید')}</a>` : ''}</div>`;
        case 'marquee': return `<div style="${S}overflow:hidden;background:${E(b.bg || '#fff')};padding:12px 0"><div style="display:inline-block;white-space:nowrap;color:${E(b.color || '#101828')};font-size:${nn(b.size, 16)}px;font-weight:700;animation:rava-marquee ${Math.max(4, nn(b.speed, 18))}s linear infinite">${E(b.text || '')} &nbsp;·&nbsp; ${E(b.text || '')} &nbsp;·&nbsp; ${E(b.text || '')}</div></div>`;
        case 'logoCloud': { const per = Math.max(1, Math.min(8, nn(b.perRow, 4))); return `<div style="${S}display:grid;grid-template-columns:repeat(${per},minmax(0,1fr));gap:${nn(b.gap, 14)}px;align-items:center;justify-items:${E(b.align || 'center')}">${(b.items || []).map(x => { const img = `<img src="${E(x.url || '')}" alt="${E(x.alt || '')}" loading="lazy" style="max-width:${nn(x.size, 72)}px;height:auto;display:block;opacity:.8">`; return x.link ? `<a href="${E(x.link)}">${img}</a>` : img; }).join('')}</div>`; }
        case 'progress': return `<div style="${S}"><div style="font-size:${nn(b.labelSize, b.size || 14)}px;font-weight:${nn(b.labelWeight, b.weight || 600)};color:${E(b.labelColor || b.color || '#101828')};margin-bottom:8px;${fontOf(b)}">${rich(b.label || '')}</div><div style="display:flex;justify-content:space-between;font-size:${nn(b.labelSize, 14)}px"><span></span><strong>${Math.max(0, Math.min(100, nn(b.value, 0)))}%</strong></div><div style="background:${E(b.track || '#EEF2F6')};border-radius:${nn(b.radius, 999)}px;height:${nn(b.height, 10)}px;overflow:hidden"><div style="width:${Math.max(0, Math.min(100, nn(b.value, 0)))}%;height:100%;background:${E(b.bar || '#175CD3')}"></div></div></div>`;
        /* V138 — Sticky Button: همان دکمهٔ خرید (buyButton) با position:fixed در گوشهٔ پایین صفحه.
           چون body صفحه container-type دارد (و containing block برای fixed می‌شود)، یک اسکریپت کوچک
           عنصر را به <body> منتقل می‌کند تا واقعاً به viewport بچسبد. نمایش موبایل/دسکتاپ با media query
           (نه container query) چون بعد از انتقال بیرون از کانتینر صفحه است. */
        case 'stickyButton': {
          const pos = ['bottom-right', 'bottom-left', 'bottom-center'].includes(b.stickyPos) ? b.stickyPos : 'bottom-right';
          const ox = Math.max(0, Math.min(80, nn(b.offsetX, 16))), oy = Math.max(0, Math.min(120, nn(b.offsetY, 16)));
          const inner = renderOneBlock(Object.assign({}, b, { type: 'buyButton', marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, padTop: 0, padBottom: 0, padLeft: 0, padRight: 0, maxWidth: 100, desktopWidth: undefined, mobileWidth: undefined, edgeToEdge: false, fullBleed: false, note: '', align: 'center', position: undefined, opacity: undefined, rotate: 0, fullWidth: false, mobileSize: 0 }));
          const side = pos === 'bottom-left' ? `left:${ox}px;` : pos === 'bottom-center' ? 'left:50%;transform:translateX(-50%);' : `right:${ox}px;`;
          const hideM = (b.hideMobile === true || b.showOnMobile === false) ? ' rava-sb-hide-m' : '';
          const hideD = (b.hideDesktop === true || b.showOnDesktop === false) ? ' rava-sb-hide-d' : '';
          const css = '<style>.rava-sticky-btn{position:fixed;z-index:80;max-width:calc(100vw - 24px);margin:0!important}.rava-sticky-btn>div{margin:0!important;padding:0!important;width:auto!important;max-width:none!important}.rava-sticky-btn .v94-buy-btn:hover{transform:scale(1.04)}@media (max-width:720px){.rava-sticky-btn.rava-sb-hide-m{display:none!important}.rava-sticky-btn[data-mfull="1"]{left:12px!important;right:12px!important;transform:none!important;max-width:none}.rava-sticky-btn[data-mfull="1"]>div{width:100%!important}.rava-sticky-btn[data-mfull="1"] .v94-buy-btn{width:100%}}@media (min-width:721px){.rava-sticky-btn.rava-sb-hide-d{display:none!important}}</style>';
          const mover = isBrowser ? '' : '<script>(function(){var s=document.currentScript,e=s&&s.previousElementSibling;if(e&&e.parentNode!==document.body){document.body.appendChild(e);}if(s&&s.parentNode)s.parentNode.removeChild(s);})();</script>';
          return `<div class="rava-sticky-btn${hideM}${hideD}" data-rava-sticky-btn data-pos="${pos}" data-mfull="${b.mobileFull === true ? '1' : '0'}" style="position:fixed;z-index:80;bottom:calc(${oy}px + env(safe-area-inset-bottom, 0px));${side}">${css}${inner}</div>${mover}`;
        }
        case 'stickyCta': { const sHref = saleHref(b); const pos = String(b.position || 'bottom-right'); return `<a href="${E(sHref)}" style="position:fixed;z-index:60;${pos.includes('bottom') ? 'bottom' : 'top'}:${nn(b.offsetY, 18)}px;${pos.includes('right') ? 'right' : 'left'}:${nn(b.offsetX, 18)}px;background:${E(b.bg || '#175CD3')};color:${E(b.fg || '#fff')};border-radius:${nn(b.radius, 999)}px;padding:${nn(b.padY, 12)}px ${nn(b.padX, 18)}px;font-size:${nn(b.size, 15)}px;font-weight:${nn(b.weight, 800)};box-shadow:0 14px 34px rgba(16,24,40,.24)">${E(b.label || '')}</a>`; }
        case 'stickySection': return `<div class="${b.showOnMobile === false ? 'sticky-hide-mobile' : ''}" style="${padXYShell(b, 'right')}position:sticky;${b.position === 'top' ? 'top' : 'bottom'}:${nn(b.offset)}px;z-index:40;background:${E(b.bg || '#fff')};color:${E(b.fg || '#101828')};border:${nn(b.borderWidth)}px solid ${E(b.border || '#EAECF0')};border-radius:${nn(b.radius)}px;box-shadow:${SHADOW[b.shadow || 'lg'] || 'none'}">${renderBlocks(b.blocks || [])}</div>`;
        case 'stickyColumn': return `<div class="${b.showOnMobile === false ? 'sticky-hide-mobile' : ''}" style="${padXYShell(b, 'right')}position:sticky;${b.position === 'bottom' ? 'bottom' : 'top'}:${nn(b.offset, 18)}px;background:${E(b.bg || '#fff')};color:${E(b.fg || '#101828')};border:${nn(b.borderWidth)}px solid ${E(b.border || '#EAECF0')};border-radius:${nn(b.radius, 18)}px;box-shadow:${SHADOW[b.shadow || 'md'] || 'none'};min-height:${nn(b.minHeight)}px">${renderBlocks(b.blocks || [])}</div>`;
        case 'comparison': return `<div style="${S}position:relative;border-radius:${nn(b.radius, 18)}px;overflow:hidden;height:${nn(b.height, 360)}px;display:grid;grid-template-columns:1fr 1fr;gap:2px">${[b.before, b.after].map(src => src ? `<img src="${E(src)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block">` : `<div style="background:#F2F4F7"></div>`).join('')}</div>`;
        default: return '';
      }
    }

    function applyBlockFont(b, html) {
      /* V158 — the element font lands on the element ROOT tag (not on the first
         style attribute anywhere inside), so every inner text that has no font
         of its own inherits it. Inline rich-text fonts still win. */
      const f = b && b.fontFamily ? String(b.fontFamily).slice(0, 80) : '';
      if (!f || f === 'system-ui' || typeof html !== 'string' || !html || html[0] !== '<') return html;
      const gt = html.indexOf('>'); if (gt < 0) return html;
      let tag = html.slice(0, gt);
      if (/^<(style|script)/i.test(tag) || /font-family/.test(tag)) return html;
      const fam = `font-family:'${E(f).replace(/&#39;/g, '')}',Vazirmatn,system-ui;`;
      tag = /\sstyle="/.test(tag) ? tag.replace(/\sstyle="/, ` style="${fam}`) : tag.replace(/^<([a-zA-Z0-9-]+)/, `<$1 style="${fam}"`);
      tag = /\sclass="/.test(tag) ? tag.replace(/\sclass="/, ' class="rv-font ') : tag.replace(/^<([a-zA-Z0-9-]+)/, '<$1 class="rv-font"');
      return tag + html.slice(gt);
    }
    /* V131 — Custom CSS (تب پیشرفته): به نخستین style=" خروجی هر عنصر تزریق می‌شود؛
       بعد از renderOneBlock اعمال می‌شود تا همهٔ کیس‌ها (سکشن، ستون، پلیر صوت و…)
       پوشش داده شوند. V132 — انیمیشن: data-* های اجرای انیمیشن + کلاس پایهٔ
       rva-anim-host (perspective والد برای Flip/Tilt) به نخستین class=" تزریق می‌شوند. */
    function applyBlockExtras(b, html) {
      if (typeof html !== 'string' || !html || html[0] !== '<') return html;
      let out = html;
      /* V132 — انیمیشن: data-* های اجرا بلافاصله بعد از نام تگِ ریشه تزریق می‌شوند
         (تمام خروجی‌های renderOneBlock با یک تگ شروع می‌شوند). اگر بلوک نوع انیمیشن
         Flip/Tilt دارد، کلاس rva-anim-host هم به نخستین class=" می‌چسبد تا perspective
         روی خود عنصر (والدِ لایهٔ سه‌بعدی) ست شود. */
      /* V147 — stable element hook: lets the canvas, QA tooling and custom CSS
         target the exact root of every block (same attribute on site + editor). */
      if (b && b.id && !/^<(style|script)/i.test(out)) {
        const gt0 = out.indexOf('>');
        const rid = String(b.id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
        if (gt0 > 0 && rid && !/data-rb="/.test(out.slice(0, gt0))) out = out.slice(0, gt0).replace(/\/$/, '') + ` data-rb="${rid}"` + out.slice(gt0);
      }
      const attrs = animAttrs(b);
      const meta = (b && b.animationType && window_ANIM_META) ? window_ANIM_META[b.animationType] : null;
      if (attrs) {
        const gt = out.indexOf('>');
        if (gt > 0) out = out.slice(0, gt) + attrs + out.slice(gt);
      }
      if (meta && meta.flip && /class="/.test(out)) out = out.replace(/class="/, 'class="rva-anim-perspective ');
      const userCss = String((b && b.customCss) || '').trim();
      /* V250 — Custom CSS: plain declarations stay inline (legacy); anything with a rule
         block ({ … }) becomes a stylesheet scoped to this element («&» = the element). */
      if (userCss && !/undefined|NaN/.test(userCss)) {
        if (userCss.includes('{')) {
          const rid2 = String(b.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
          if (rid2) {
            const scope = `[data-rb="${rid2}"]`;
            const css = userCss.replace(/<\/?style[^>]*>/gi, '').replace(/<\/script/gi, '').replace(/(^|})\s*([^{}@]+)\{/g, (m, br, sel) => br + sel.split(',').map(x => { x = x.trim(); if (!x) return x; return x.includes('&') ? x.replace(/&/g, scope) : `${scope} ${x}`; }).join(',') + '{');
            const gtS = out.indexOf('>');
            if (gtS > 0) out = out.slice(0, gtS + 1) + `<style>${css}</style>` + out.slice(gtS + 1);
          }
        } else out = out.replace(/style="/, `style="${E(userCss.replace(/;+$/, ''))};`);
      }
      /* V250 — Advanced tab «Element ID» + «Custom class» finally reach the output
         (anchors like /#pricing and custom CSS hooks work on the live site). */
      const domId = String((b && b.domId) || '').trim().replace(/^#/, '').replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '-').slice(0, 64);
      if (domId && !/^<(style|script)/i.test(out)) { const gtI = out.indexOf('>'); if (gtI > 0 && !/\sid="/.test(out.slice(0, gtI))) out = out.slice(0, gtI) + ` id="${E(domId)}"` + out.slice(gtI); }
      const userCls = String((b && b.className) || '').trim().split(/\s+/).map(c => c.replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean).slice(0, 8).join(' ');
      if (userCls && !/^<(style|script)/i.test(out)) { const gtC = out.indexOf('>'); const head = out.slice(0, gtC); if (/\sclass="/.test(head)) out = head.replace(/\sclass="/, ` class="${userCls} `) + out.slice(gtC); else if (gtC > 0) out = head + ` class="${userCls}"` + out.slice(gtC); }
      /* V143 — opt-in per-device overrides. CSS variables keep this additive:
         when disabled, the published output is byte-for-byte on the legacy path. */
      const rr=b&&b.responsive;
      if(rr&&rr.enabled){
        const safe=(x,d='')=>String(x??d).replace(/[^0-9.%\-a-zA-Z]/g,'');
        const vars=[];
        [['desktop','d'],['tablet','t'],['mobile','m']].forEach(([name,short])=>{
          const v=rr[name]||{};
          if(v.width!=null)vars.push(`--rva-rw-${short}:${safe(v.width,100)}%`);
          if(v.fontSize!=null&&v.fontSize!=='')vars.push(`--rva-rfs-${short}:${safe(v.fontSize)}px`);
          if(v.padY!=null)vars.push(`--rva-rpy-${short}:${safe(v.padY)}px`);
          if(v.padX!=null)vars.push(`--rva-rpx-${short}:${safe(v.padX)}px`);
          if(v.align&&v.align!=='inherit')vars.push(`--rva-ra-${short}:${safe(v.align)}`);
        });
        const gt=out.indexOf('>');
        if(gt>0){
          if(/class="/.test(out)) out=out.replace(/class="/,'class="rava-rsp ');
          else out=out.slice(0,gt)+` class="rava-rsp"`+out.slice(gt);
          if(vars.length){
            if(/style="/.test(out)) out=out.replace(/style="/,`style="${vars.join(';')};`);
            else out=out.slice(0,gt)+` style="${vars.join(';')};"`+out.slice(gt);
          }
        }
      }
      return out;
    }

    /* V133 — editorCtx ممکن است در helpers (بیلدر همین‌طور پاس می‌دهد) یا opts بیاید؛ هر دو خوانده می‌شود */
    function localCtx() { const ec = (opts && opts.editorCtx) || (helpers && helpers.editorCtx); if (ec === 'edit' || ec === 'preview') return ec; return undefined; }
    function renderBlocks(blocks = [], localOpts = {}) {
      /* V113 — per-call page context (see the `let p` note above): the cached
         factory must render THIS page's checkout/sub-page links, not the first
         one it saw. Renders are synchronous, so the swap is safe. */
      if (localOpts.page !== undefined) p = (localOpts.page && typeof localOpts.page === 'object') ? localOpts.page : null;
      if (localOpts.refCode !== undefined) { refCode = String(localOpts.refCode || '').slice(0, 40); refQ = refCode ? `?ref=${encodeURIComponent(refCode)}` : ''; }
      /* V121 — نقشهٔ قیمت آپسل هم per-call است (کل سرور از یک factory کش‌شده استفاده می‌کند) */
      upsellPrices = (localOpts.upsellPrices && typeof localOpts.upsellPrices === 'object') ? localOpts.upsellPrices : null;
      const device = localOpts.device !== undefined ? localOpts.device : opts.device;
      const list = Array.isArray(blocks) ? blocks : [];
      /* V124 — وقتی کل صفحه یک‌جا رندر می‌شود (بدون device)، بین عناصر rootGap می‌گذاریم.
         فراخوانی‌های تودرتو (بلوک‌های داخل سکشن/ستون) از طریق renderOneBlock می‌روند و
         گپ ریشه رویشان اعمال نمی‌شود. */
      /* V143: page gap is a root-layout concern, not a device concern.
         The editor passes the gap explicitly for desktop/mobile previews, so
         gate on that explicit root call instead of `device === undefined`.
         Nested renderBlocks calls never receive localOpts.gap and keep their
         own container spacing untouched. */
      if (localOpts.gap !== undefined && (rootGapPx > 0 || rootSectionGapPx > 0 || rootPadTopPx > 0 || rootPadBottomPx > 0)) {
        return `<div class="rava-root-gap" style="display:flex;flex-direction:column;gap:${rootGapPx}px;align-items:stretch">${list
          .filter(b => b && b.type && shouldRenderForCanvasDevice(b, device))
          .map(b => {
            let html = '';
            try { html = fxInject(b, renderOneBlock(b)); } catch (err) { html = `<div style="padding:12px;border:1px dashed #FECACA;background:#FFF7F7;color:#B42318;border-radius:10px;font-size:12px">Render error: ${E(b.type || 'element')}</div>`; }
            if (!html) return '';
            html = visibilityWrap(b, html);
            html = bleedWrap(b, html);
            return applyBlockFont(b, applyBlockExtras(b, html));
          })
          .filter(Boolean).join('')}</div>`;
      }
      return list
        .filter(b => b && b.type && shouldRenderForCanvasDevice(b, device))
        .map(b => {
          let html = '';
          try { html = fxInject(b, renderOneBlock(b)); } catch (err) { html = `<div style="padding:12px;border:1px dashed #FECACA;background:#FFF7F7;color:#B42318;border-radius:10px;font-size:12px">Render error: ${E(b.type || 'element')}</div>`; }
          if (!html) return '';
          html = visibilityWrap(b, html);
          html = bleedWrap(b, html);
          return applyBlockFont(b, applyBlockExtras(b, html));
        })
        .filter(Boolean).join('');
    }

    return { renderBlocks, renderOneBlock, shellStyle, shouldRenderForCanvasDevice, visibilityWrap, bleedWrap, RAVA_BLEED_CSS };
  }

  return { createWidgetRenderer, fxCss, fxInject, fxVideoTag, FX_CAPS, cleanSvg, svgIsPalette, paintSvg, bgStyle, pageBaseBackground, landingShellBackground, landingShellDecor, landingSurface, landingSurfaceCss, patternInfo, patternList, renderVideoEmbed, SHADOW, ALIGN_MAP, JUSTIFY_MAP, RAVA_BLEED_CSS };
});
