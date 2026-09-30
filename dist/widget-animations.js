/* ============================================================
   WIDGET ANIMATIONS RUNTIME — V132
   The ONE animation engine for builder blocks. Used by:
   - server.js shell() runtime  (published pages: IntersectionObserver)
   - public/builder.js          (canvas: Replay button + editor observer)
   - public/widget-renderer.js  (exposes intensity/keyframe metadata via RAVA_ANIMATIONS.META)
   No GSAP / no JS animation libraries — the motion itself is 100% CSS
   keyframes (public/widget-renderer.css); this file only *switches classes*
   and variables on the element.

   Public API (window.RAVA_ANIMATIONS):
     META              — table of animation types (label fa/en, keyframe class,
                         intensity variable mapping, extra flags)
     cssVars(b)        — { '--rva-dur': …, … } from block animation fields
     resolve(b)        — normalized {type,dur,delay,intensity,threshold,replayable}
     play(el)          — (re)start the animation on a live DOM element NOW
     observe(scope)    — bind IntersectionObserver to [data-rva-anim] inside scope
     observerFor(el)   — internal observer with per-element threshold/replay
   ============================================================ */
(function (root) {
  'use strict';

  /* intensity → value per family. dist px, blur px, deg, glitch px, scale start, bounce px */
  const INTENSITY = {
    subtle: { dist: 20, blur: 4, deg: 8, glitch: 4, scale: 0.9, bounce: 6 },
    normal: { dist: 50, blur: 10, deg: 18, glitch: 10, scale: 0.7, bounce: 12 },
    strong: { dist: 100, blur: 20, deg: 35, glitch: 20, scale: 0.4, bounce: 24 }
  };
  /* threshold steps for the IntersectionObserver (how much must be visible) */
  const THRESHOLDS = { low: 0.1, normal: 0.5, high: 0.9 };

  const META = {
    none: { fa: 'بدون انیمیشن', cls: '' },
    fadeIn: { fa: 'Fade In', cls: 'rva-fadein', kf: 'rvaFadeIn' },
    fadeUp: { fa: 'Fade Up', cls: 'rva-fadeup', kf: 'rvaFadeUp', varKey: 'dist' },
    fadeDown: { fa: 'Fade Down', cls: 'rva-fadedown', kf: 'rvaFadeDown', varKey: 'dist' },
    fadeLeft: { fa: 'Fade Left', cls: 'rva-fadeleft', kf: 'rvaFadeLeft', varKey: 'dist' },
    fadeRight: { fa: 'Fade Right', cls: 'rva-faderight', kf: 'rvaFadeRight', varKey: 'dist' },
    blur1: { fa: 'Blur 1', cls: 'rva-blur1', kf: 'rvaBlur1', varKey: 'blur' },
    blur2: { fa: 'Blur 2', cls: 'rva-blur2', kf: 'rvaBlur2', varKey: 'blur' },
    glitch1: { fa: 'Glitch 1', cls: 'rva-glitch1', kf: 'rvaGlitch1', varKey: 'glitch' },
    glitch2: { fa: 'Glitch 2', cls: 'rva-glitch2', kf: 'rvaGlitch2', varKey: 'glitch' },
    bounceUp: { fa: 'Bounce Up', cls: 'rva-bounceup', kf: 'rvaBounceUp', varKey: 'dist', varKey2: 'bounce' },
    bounceDown: { fa: 'Bounce Down', cls: 'rva-bouncedown', kf: 'rvaBounceDown', varKey: 'dist', varKey2: 'bounce' },
    bounceLeft: { fa: 'Bounce Left', cls: 'rva-bounceleft', kf: 'rvaBounceLeft', varKey: 'dist', varKey2: 'bounce' },
    bounceRight: { fa: 'Bounce Right', cls: 'rva-bounceright', kf: 'rvaBounceRight', varKey: 'dist', varKey2: 'bounce' },
    tiltLeft: { fa: 'Tilt Left', cls: 'rva-tiltleft', kf: 'rvaTiltLeft', varKey: 'deg', varKey2: 'dist', flip: true },
    tiltRight: { fa: 'Tilt Right', cls: 'rva-tiltright', kf: 'rvaTiltRight', varKey: 'deg', varKey2: 'dist', flip: true },
    flipForward: { fa: 'Flip Forward', cls: 'rva-flipforward', kf: 'rvaFlipForward', varKey: 'deg', flip: true },
    flipBackward: { fa: 'Flip Backward', cls: 'rva-flipbackward', kf: 'rvaFlipBackward', varKey: 'deg', flip: true },
    flipLeft: { fa: 'Flip Left', cls: 'rva-flipleft', kf: 'rvaFlipLeft', varKey: 'deg', flip: true },
    flipRight: { fa: 'Flip Right', cls: 'rva-flipright', kf: 'rvaFlipRight', varKey: 'deg', flip: true },
    popIn: { fa: 'Pop In', cls: 'rva-popin', kf: 'rvaPopIn', varKey: 'scale' },
    slideLeft: { fa: 'Slide Left', cls: 'rva-slideleft', kf: 'rvaSlideLeft', varKey: 'dist', noFade: true },
    slideRight: { fa: 'Slide Right', cls: 'rva-slideright', kf: 'rvaSlideRight', varKey: 'dist', noFade: true },
    wipeUp: { fa: 'Wipe Up', cls: 'rva-wipeup', kf: 'rvaWipeUp', noFade: true },
    wipeDown: { fa: 'Wipe Down', cls: 'rva-wipedown', kf: 'rvaWipeDown', noFade: true },
    wipeLeft: { fa: 'Wipe Left', cls: 'rva-wipeleft', kf: 'rvaWipeLeft', noFade: true },
    wipeRight: { fa: 'Wipe Right', cls: 'rva-wiperight', kf: 'rvaWipeRight', noFade: true },
    wipeDiag: { fa: 'Wipe Diagonal', cls: 'rva-wipediag', kf: 'rvaWipeDiag', noFade: true },
    wipeRevDiag: { fa: 'Wipe Reverse Diagonal', cls: 'rva-wiperevdiag', kf: 'rvaWipeRevDiag', noFade: true },
    zoomIn: { fa: 'Zoom In', cls: 'rva-zoomin', kf: 'rvaZoomIn', varKey: 'scale' },
    zoomOut: { fa: 'Zoom Out', cls: 'rva-zoomout', kf: 'rvaZoomOut', varKey: 'scale' },
    typewriter: { fa: 'Typewriter', cls: 'rva-typewriter', special: 'typewriter' },
    wordReveal: { fa: 'Staggered Word Reveal', cls: 'rva-wordreveal', special: 'wordReveal' }
  };
  const TYPE_ORDER = ['none','fadeIn','fadeUp','fadeDown','fadeLeft','fadeRight','blur1','blur2','glitch1','glitch2','bounceUp','bounceDown','bounceLeft','bounceRight','tiltLeft','tiltRight','flipForward','flipBackward','flipLeft','flipRight','popIn','slideLeft','slideRight','wipeUp','wipeDown','wipeLeft','wipeRight','wipeDiag','wipeRevDiag','zoomIn','zoomOut','typewriter','wordReveal'];

  /* Fields come either from a raw block (animationType/…) or from a live canvas
     element's data attributes (rvaType/rvaIntensity/… — data-rva-type becomes
     dataset.rvaType). resolve() accepts both shapes. */
  function fieldsOf(src) {
    if (!src) return {};
    if (src.animationType !== undefined || src.animationDuration !== undefined) return src;
    return {
      animationType: src.rvaType,
      animationDuration: src.rvaDuration,
      animationIntensity: src.rvaIntensity,
      animationDelay: src.rvaDelay,
      animationThreshold: src.rvaThreshold,
      animationReplayable: src.rvaReplayable === '0' ? false : src.rvaReplayable === '1' ? true : undefined
    };
  }
  const norm = (b) => ({
    type: (b && b.animationType) || 'none',
    duration: clamp(Number(b && b.animationDuration), 0.2, 2.5, 1),
    intensity: ['subtle', 'normal', 'strong'].includes(b && b.animationIntensity) ? b.animationIntensity : 'normal',
    delay: clamp(Number(b && b.animationDelay), 0, 2, 0),
    threshold: ['low', 'normal', 'high'].includes(b && b.animationThreshold) ? b.animationThreshold : 'normal',
    replayable: !b || b.animationReplayable !== false
  });
  function resolve(fields) { return norm(fieldsOf(fields)); }
  function clamp(v, min, max, def) { const x = Number(v); return Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : def; }

  /* CSS variables for one element from its animation fields */
  function cssVars(r) {
    const step = INTENSITY[r.intensity] || INTENSITY.normal;
    const meta = META[r.type] || {};
    const vars = { '--rva-dur': r.duration + 's', '--rva-delay': r.delay + 's', '--rva-persp': '900px' };
    const setVar = (key) => { if (step[key] !== undefined) vars['--rva-' + key] = step[key] + (key === 'scale' ? '' : 'px'); };
    if (meta.varKey) setVar(meta.varKey);
    if (meta.varKey2) setVar(meta.varKey2);
    if (meta.varKey === 'scale' || meta.varKey2 === 'scale') setVar('scale');
    /* keyframes that reference --rva-dist but the type maps to scale/blur still
       need a sane fallback so the element never animates from undefined */
    vars['--rva-dist'] = vars['--rva-dist'] || step.dist + 'px';
    vars['--rva-bounce'] = vars['--rva-bounce'] || step.bounce + 'px';
    vars['--rva-blur'] = vars['--rva-blur'] || step.blur + 'px';
    vars['--rva-deg'] = vars['--rva-deg'] || step.deg + 'deg';
    vars['--rva-glitch'] = vars['--rva-glitch'] || step.glitch + 'px';
    vars['--rva-scale'] = vars['--rva-scale'] || step.scale;
    return vars;
  }

  /* typewriter: wrap plain text into the sliding-mask span (keeps rich markup children).
     wordReveal: split EVERY descendant text node into per-word spans — not just direct
     children — so rich blocks (text/heading with inner <div>/<p>) reveal word-by-word. */
  function prepareSpecial(el, r) {
    if (r.type === 'typewriter') {
      if (!el.querySelector(':scope > .rva-type-text')) {
        const span = document.createElement('span');
        span.className = 'rva-type-text';
        while (el.firstChild) span.appendChild(el.firstChild);
        el.appendChild(span);
      }
    } else if (r.type === 'wordReveal') {
      if (el.querySelector('.rva-word')) return;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.textContent && n.textContent.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      });
      const targets = [];
      while (walker.nextNode()) targets.push(walker.currentNode);
      let wi = 0;
      targets.forEach((textNode) => {
        const frag = document.createDocumentFragment();
        String(textNode.textContent).split(/(\s+)/).forEach((word) => {
          if (!word) return;
          if (/^\s+$/.test(word)) { frag.appendChild(document.createTextNode(word)); return; }
          const w = document.createElement('span');
          w.className = 'rva-word';
          w.style.setProperty('--rva-wi', String(wi++));
          w.textContent = word;
          frag.appendChild(w);
        });
        textNode.parentNode.replaceChild(frag, textNode);
      });
    }
  }

  /* THE one play/restart function: works on any live DOM element. */
  function play(el, fields) {
    if (!el) return;
    const r = resolve(fields || el.dataset || {});
    if (r.type === 'none' || !META[r.type]) { cleanup(el); return; }
    const meta = META[r.type];
    cleanup(el);
    /* V139 — ریستارت واقعی: بین حذف و افزودن کلاس باید reflow شود، وگرنه مرورگر
       انیمیشن تمام‌شده را دوباره اجرا نمی‌کند (علت کار نکردن Replay) */
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.removeProperty('animation');
    el.classList.add('rva-anim', meta.cls);
    el.classList.remove('rva-pending');
    const vars = cssVars(r);
    Object.keys(vars).forEach((k) => el.style.setProperty(k, vars[k]));
    if (meta.flip) el.classList.add('rva-flip3d');
    if (meta.special) prepareSpecial(el, r);
    /* force a reflow so removing/adding the class in the same frame restarts keyframes */
    void el.offsetWidth;
  }

  function cleanup(el) {
    Object.values(META).forEach((m) => { if (m.cls) el.classList.remove(m.cls); });
    el.classList.remove('rva-anim', 'rva-flip3d');
    ['--rva-dur','--rva-delay','--rva-dist','--rva-bounce','--rva-blur','--rva-deg','--rva-glitch','--rva-scale','--rva-persp'].forEach((k) => el.style.removeProperty(k));
  }

  function resolveLocal(fields) { return resolve(fields); }

  /* Published-site path: observe every animated element with ITS OWN settings.
     replayable=false → unobserve after the first run (plays exactly once). */
  function observe(scope) {
    const rootEl = scope && scope.querySelectorAll ? scope : document;
    let io = null;
    try { io = new IntersectionObserver(onIo, { threshold: [0.1, 0.5, 0.9] }); } catch (e) { io = null; }
    rootEl.querySelectorAll('[data-rva-anim]').forEach((el) => {
      if (el.dataset.rvaAnimBound === '1') return;
      el.dataset.rvaAnimBound = '1';
      if (!io) { play(el); return; }
      /* V139 — روی سایت واقعی عنصر تا ورود به دید مخفی می‌ماند (بدون پرش/فلش قبل از انیمیشن) */
      if (!el.closest('.builder-app')) el.classList.add('rva-pending');
      io.observe(el);
      el.__rvaIo = io;
    });
  }
  function onIo(entries) {
    entries.forEach((entry) => {
      const el = entry.target;
      if (!entry.isIntersecting) { const r0 = resolve(el.dataset); if (r0.replayable && el.classList.contains('rva-anim') && !el.closest('.builder-app')) { cleanup(el); el.classList.add('rva-pending'); } return; }
      const r = resolve(el.dataset);
      const need = THRESHOLDS[r.threshold] !== undefined ? THRESHOLDS[r.threshold] : 0.5;
      if (entry.intersectionRatio + 0.02 < need) return; /* wait until enough is visible */
      play(el);
      if (!r.replayable && el.__rvaIo) { el.__rvaIo.unobserve(el); el.__rvaIo = null; }
    });
  }

  const api = { META, TYPE_ORDER, INTENSITY, THRESHOLDS, resolve, cssVars, play, cleanup, observe, prepareSpecial };
  root.RAVA_ANIMATIONS = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
