/* Baatelier preview bridge.
 * Runs inside the sandboxed preview document. It gives useful elements a stable data-cg-id, draws
 * the "You" hover/selection outlines and the "Ground" pointer, and talks to the review room
 * exclusively through postMessage. It never reads anything from the parent window.
 * Protocol (child → parent): cg:ready, cg:elements, cg:hover, cg:select, cg:snapshot, cg:key, cg:blocked
 * Protocol (parent → child): cg:config, cg:point, cg:clear, cg:select, cg:simulate-hover, cg:snapshot, cg:ping
 */
(function () {
  'use strict';
  if (window.__cgBridge) return;
  var parentWin = window.parent;
  if (!parentWin || parentWin === window) return;
  window.__cgBridge = { version: 2 };

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, META: 1, LINK: 1, TITLE: 1, HEAD: 1, BR: 1, WBR: 1, TEMPLATE: 1, BASE: 1, HTML: 1, 'CG-OVERLAY': 1 };
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var KIND = {
    H1: 'Heading', H2: 'Heading', H3: 'Heading', H4: 'Heading', H5: 'Heading', H6: 'Heading',
    A: 'Link', BUTTON: 'Button', IMG: 'Image', PICTURE: 'Image', SVG: 'Illustration', P: 'Paragraph',
    SECTION: 'Section', NAV: 'Navigation', HEADER: 'Header', FOOTER: 'Footer', MAIN: 'Main', ASIDE: 'Aside',
    UL: 'List', OL: 'List', LI: 'List item', INPUT: 'Field', TEXTAREA: 'Field', SELECT: 'Field', LABEL: 'Label',
    FORM: 'Form', FIGURE: 'Figure', ARTICLE: 'Card', BLOCKQUOTE: 'Quote', SPAN: 'Text', STRONG: 'Text', EM: 'Text',
    TABLE: 'Table', BODY: 'Page', SMALL: 'Text', VIDEO: 'Video', DL: 'List'
  };
  var state = {
    review: true,
    hoverEl: null,
    simulated: null,
    selectedEl: null,
    aiEl: null,
    aiLabel: '',
    aiTone: 'point',
    aiFadeTimer: 0,
    cursor: { x: -60, y: -60, visible: false, placed: false },
    lastHoverId: null,
    raf: 0,
    counter: 0
  };
  var host, shadow, boxes = {}, cursorEl, cursorPill;

  function post(type, payload) {
    try { parentWin.postMessage(Object.assign({ type: type, source: 'cg-bridge' }, payload || {}), '*'); } catch (e) { /* parent gone */ }
  }

  function isOurs(el) { return !el || el === host || (host && host.contains(el)); }
  function skippable(el) {
    if (!el || el.nodeType !== 1 || SKIP[el.tagName]) return true;
    if (el.namespaceURI === SVG_NS && el.tagName.toLowerCase() !== 'svg') return true;
    return isOurs(el);
  }

  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 3).join('-').slice(0, 28);
  }

  var usedIds = {};
  function stamp(root) {
    if (!root) return 0;
    var added = 0;
    var list = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (skippable(el)) continue;
      var id = el.getAttribute('data-cg-id');
      if (id && !usedIds[id]) { usedIds[id] = el; continue; }
      if (id && usedIds[id] === el) continue;
      var base = el === document.body ? 'page' : el.tagName.toLowerCase() + (el.id ? '-' + slug(el.id) : '');
      var next = base;
      while (usedIds[next] && usedIds[next] !== el) { state.counter += 1; next = base + '-' + state.counter; }
      el.setAttribute('data-cg-id', next);
      usedIds[next] = el;
      added++;
    }
    return added;
  }

  function byId(id) {
    if (!id) return null;
    try { return document.querySelector('[data-cg-id="' + String(id).replace(/["\\]/g, '\\$&') + '"]'); } catch (e) { return null; }
  }

  function clean(s, n) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n || 120); }
  function textOf(el) {
    if (el.tagName === 'IMG') return clean(el.getAttribute('alt') || 'image');
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return clean(el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.name || 'field');
    return clean(el.innerText || el.textContent, 160);
  }
  function labelOf(el) {
    var a = el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('placeholder');
    if (a) return clean(a, 60);
    var t = textOf(el);
    if (t) return t.length > 48 ? t.slice(0, 46) + '…' : t;
    return '';
  }
  function kindOf(el) {
    var k = KIND[el.tagName] || KIND[el.tagName.toUpperCase()];
    if (k) return k;
    var cls = (el.getAttribute('class') || '').toLowerCase();
    if (/card|tile/.test(cls)) return 'Card';
    if (/btn|button|cta/.test(cls)) return 'Button';
    if (/hero/.test(cls)) return 'Hero';
    if (/art|illus|thumb|image|photo/.test(cls)) return 'Artwork';
    return 'Block';
  }
  function selectorOf(el) {
    var parts = [];
    var node = el;
    for (var depth = 0; node && node.nodeType === 1 && depth < 4 && node !== document.documentElement; depth++) {
      var part = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(part + '#' + node.id); break; }
      var cls = (node.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0];
      if (cls) part += '.' + cls;
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  }
  function stylesOf(el) {
    var cs = window.getComputedStyle(el);
    return {
      color: cs.color, background: cs.backgroundColor, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
      fontFamily: (cs.fontFamily || '').split(',')[0].replace(/["']/g, ''), padding: cs.padding,
      borderRadius: cs.borderRadius, display: cs.display,objectFit:cs.objectFit,border:cs.border,boxShadow:cs.boxShadow,filter:cs.filter
    };
  }
  function cgParent(el) {
    var p = el.parentElement;
    while (p && !p.getAttribute('data-cg-id')) p = p.parentElement;
    return p;
  }
  function cgChild(el) {
    var kids = el.querySelectorAll('[data-cg-id]');
    for (var i = 0; i < kids.length; i++) if (!isOurs(kids[i])) return kids[i];
    return null;
  }
  function describe(el, full) {
    if (!el) return null;
    var p = cgParent(el), c = cgChild(el);
    var d = {
      id: el.getAttribute('data-cg-id'), tag: el.tagName.toLowerCase(), kind: kindOf(el), label: labelOf(el),
      text: textOf(el), selector: selectorOf(el), rect: rectOf(el),
      parentId: p ? p.getAttribute('data-cg-id') : null, childId: c ? c.getAttribute('data-cg-id') : null
    };
    if (full) d.styles = stylesOf(el);
    return d;
  }

  function score(el) {
    var t = el.tagName;
    if (/^H[1-6]$/.test(t)) return 10;
    if (t === 'BUTTON' || t === 'A') return 9;
    if (t === 'SECTION' || t === 'HEADER' || t === 'NAV' || t === 'FOOTER' || t === 'MAIN' || t === 'FORM' || t === 'ARTICLE') return 8;
    if (t === 'IMG' || t === 'svg' || t === 'SVG' || t === 'INPUT' || t === 'FIGURE' || t === 'BLOCKQUOTE') return 7;
    if (t === 'P' || t === 'LI' || t === 'LABEL') return 6;
    var cls = el.getAttribute('class') || '';
    if (cls) return 5;
    return 2;
  }
  function inventory() {
    var all = Array.prototype.slice.call(document.querySelectorAll('[data-cg-id]')).filter(function (el) { return !isOurs(el); });
    var ranked = all.map(function (el, i) {
      var r = el.getBoundingClientRect();
      var visible = r.width > 0 && r.height > 0 ? 1 : 0;
      return { el: el, i: i, s: score(el) + visible * 2 };
    });
    ranked.sort(function (a, b) { return b.s - a.s || a.i - b.i; });
    var chosen = ranked.slice(0, 160).sort(function (a, b) { return a.i - b.i; });
    return {
      total: all.length,
      elements: chosen.map(function (item) {
        var el = item.el, p = cgParent(el);
        var d = { id: el.getAttribute('data-cg-id'), tag: el.tagName.toLowerCase(), kind: kindOf(el), text: textOf(el).slice(0, 100), selector: selectorOf(el), parentId: p ? p.getAttribute('data-cg-id') : null };
        if (/^H[1-3]$/.test(el.tagName) || el.tagName === 'BUTTON') d.styles = stylesOf(el);
        return d;
      })
    };
  }

  /* ---------- overlay ---------- */
  var CSS = [
    ':host{all:initial}',
    '.layer{position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:500 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}',
    '.box{position:fixed;left:0;top:0;width:0;height:0;border-radius:6px;opacity:0;transition:opacity .16s ease;box-sizing:border-box}',
    '.box.on{opacity:1}',
    '.hover{outline:1.5px solid rgba(70,102,78,.85);outline-offset:1px;background:rgba(70,102,78,.06)}',
    '.hover.sim{outline-style:dashed}',
    '.sel{outline:2px solid #46664e;outline-offset:2px;background:rgba(70,102,78,.08);box-shadow:0 0 0 6px rgba(70,102,78,.10)}',
    '.ai{outline:2px solid #6f5cd3;outline-offset:3px;background:rgba(111,92,211,.10);box-shadow:0 0 0 7px rgba(111,92,211,.14)}',
    '.ai.clarify{outline-style:dashed}',
    '.ai.change{animation:pulse 1.6s ease-out 2}',
    '@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(146,134,208,.45)}100%{box-shadow:0 0 0 14px rgba(146,134,208,0)}}',
    '.tag{position:absolute;left:-2px;top:-24px;white-space:nowrap;max-width:320px;overflow:hidden;text-overflow:ellipsis;padding:4px 8px;border-radius:6px;color:#fff;letter-spacing:.01em}',
    '.tag.below{top:auto;bottom:-24px}',
    '.hover .tag{background:rgba(47,74,55,.92)}',
    '.sel .tag{background:#2f4a37}',
    '.ai .tag{display:none}',
    '.cursor{position:fixed;left:0;top:0;opacity:0;transform:translate(-80px,-80px);transition:transform .72s cubic-bezier(.2,.75,.15,1),opacity .25s ease;will-change:transform}',
    '.cursor.on{opacity:1}',
    '.cursor.dim{opacity:.55}',
    '.cursor svg{display:block;filter:drop-shadow(0 2px 3px rgba(32,40,35,.28))}',
    '.pill{position:absolute;left:18px;top:20px;white-space:nowrap;max-width:300px;overflow:hidden;text-overflow:ellipsis;background:#6f5cd3;color:#fff;padding:5px 9px;border-radius:999px 999px 999px 4px;font-weight:600;box-shadow:0 4px 14px -4px rgba(60,48,120,.45)}',
    '.pill b{font-weight:700;margin-right:4px}',
    '@media (prefers-reduced-motion: reduce){.cursor{transition:opacity .2s ease}.ai.change{animation:none}}'
  ].join('\n');

  function buildOverlay() {
    host = document.createElement('cg-overlay');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:block;';
    shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    shadow.innerHTML = '<style>' + CSS + '</style><div class="layer">' +
      '<div class="box hover"><span class="tag"></span></div>' +
      '<div class="box sel"><span class="tag"></span></div>' +
      '<div class="box ai"><span class="tag"></span></div>' +
      '<div class="cursor"><svg width="22" height="24" viewBox="0 0 22 24" fill="none"><path d="M2 1.8 19 10.6l-7.4 1.9-3.5 7.2L2 1.8Z" fill="#6f5cd3" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg><span class="pill"></span></div>' +
      '</div>';
    boxes.hover = shadow.querySelector('.hover');
    boxes.sel = shadow.querySelector('.sel');
    boxes.ai = shadow.querySelector('.ai');
    cursorEl = shadow.querySelector('.cursor');
    cursorPill = shadow.querySelector('.pill');
    document.documentElement.appendChild(host);
  }

  function place(box, el, label) {
    if (!el || !el.isConnected) { box.classList.remove('on'); box._el = null; return; }
    var r = el.getBoundingClientRect();
    var key = r.left + ',' + r.top + ',' + r.width + ',' + r.height;
    if (box._key !== key) {
      box._key = key;
      box.style.transform = 'translate(' + r.left + 'px,' + r.top + 'px)';
      box.style.width = Math.max(2, r.width) + 'px';
      box.style.height = Math.max(2, r.height) + 'px';
      var tag = box.firstChild;
      if (tag) tag.classList.toggle('below', r.top < 30);
    }
    if (box._label !== label) { box._label = label; if (box.firstChild) box.firstChild.textContent = label; }
    box.classList.add('on');
  }

  function aim(el) {
    var r = el.getBoundingClientRect();
    var x = r.left + Math.max(6, Math.min(r.width * 0.5, 56));
    var y = r.top + Math.max(6, Math.min(r.height * 0.5, 30));
    x = Math.min(Math.max(x, 4), window.innerWidth - 40);
    y = Math.min(Math.max(y, 4), window.innerHeight - 40);
    return { x: x, y: y };
  }

  function describeShort(el) {
    var k = kindOf(el), l = labelOf(el);
    return l ? k + ' · ' + l : k;
  }

  function frame() {
    state.raf = 0;
    if (!host) return;
    var hov = state.simulated || (state.review ? state.hoverEl : null);
    if (hov && hov === state.selectedEl) hov = null;
    boxes.hover.classList.toggle('sim', !!state.simulated);
    place(boxes.hover, hov, hov ? (state.simulated ? 'You · ' + (state.simulatedLabel || describeShort(hov)) : 'You · ' + describeShort(hov)) : '');
    place(boxes.sel, state.selectedEl, state.selectedEl ? 'Selected · ' + describeShort(state.selectedEl) : '');
    place(boxes.ai, state.aiEl, '');
    boxes.ai.className = 'box ai' + (state.aiEl ? ' on ' + state.aiTone : '');
    if (state.aiEl && state.aiEl.isConnected) {
      var p = aim(state.aiEl);
      if (Math.abs(p.x - state.cursor.x) > 0.5 || Math.abs(p.y - state.cursor.y) > 0.5) {
        state.cursor.x = p.x; state.cursor.y = p.y;
        cursorEl.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
      }
    }
    if (hov || state.selectedEl || state.aiEl) schedule();
  }
  function schedule() { if (!state.raf) state.raf = window.requestAnimationFrame(frame); }

  function targetFrom(node) {
    var el = node && node.nodeType === 1 ? node : node && node.parentElement;
    while (el && (skippable(el) || !el.getAttribute('data-cg-id'))) el = el.parentElement;
    if (!el || el === document.body || el === document.documentElement) return null;
    return el;
  }

  function setHover(el) {
    if (el === state.hoverEl) return;
    state.hoverEl = el;
    var id = el ? el.getAttribute('data-cg-id') : null;
    if (id !== state.lastHoverId) {
      state.lastHoverId = id;
      post('cg:hover', { element: el ? describe(el, false) : null, at: Date.now() });
    }
    schedule();
  }

  function select(el, origin) {
    state.selectedEl = el || null;
    post('cg:select', { element: el ? describe(el, true) : null, origin: origin || 'user', at: Date.now() });
    schedule();
  }

  function point(id, label, tone, opts) {
    var el = byId(id);
    if (!el) { post('cg:point-missed', { id: id }); return; }
    window.clearTimeout(state.aiFadeTimer);
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight;
    var tall = r.height > vh * 0.8;
    var needsScroll = tall ? (r.top < -vh * 0.3 || r.top > vh * 0.6) : (r.top < 8 || r.bottom > vh - 8);
    if (needsScroll) {
      try { el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: tall ? 'start' : 'center' }); } catch (e) { el.scrollIntoView(); }
    }
    state.aiEl = el;
    state.aiTone = tone === 'clarify' || tone === 'change' ? tone : 'point';
    var name = clean(label, 60) || describeShort(el);
    var prefix = tone === 'clarify' ? 'this?' : tone === 'change' ? 'changed' : 'here';
    cursorPill.innerHTML = '';
    var b = document.createElement('b');
    b.textContent = 'Ground';
    cursorPill.appendChild(b);
    cursorPill.appendChild(document.createTextNode(prefix + ' · ' + name));
    if (!state.cursor.placed) {
      // First appearance: enter from the top right edge instead of teleporting.
      state.cursor.placed = true;
      cursorEl.style.transition = 'none';
      state.cursor.x = window.innerWidth - 60; state.cursor.y = 24;
      cursorEl.style.transform = 'translate(' + state.cursor.x + 'px,' + state.cursor.y + 'px)';
      void cursorEl.offsetWidth;
      cursorEl.style.transition = '';
    }
    cursorEl.classList.add('on');
    cursorEl.classList.remove('dim');
    schedule();
    var hold = opts && opts.hold > 0 ? opts.hold : 0;
    if (hold) state.aiFadeTimer = window.setTimeout(fadeAi, hold);
    post('cg:pointed', { id: id, element: describe(el, false) });
  }

  function fadeAi() {
    state.aiEl = null;
    cursorEl.classList.add('dim');
    schedule();
  }

  function clearAi() {
    window.clearTimeout(state.aiFadeTimer);
    state.aiEl = null;
    if (cursorEl) cursorEl.classList.remove('on', 'dim');
    state.cursor.placed = false;
    schedule();
  }

  function snapshotHtml() {
    var clone = document.documentElement.cloneNode(true);
    var junk = clone.querySelectorAll('cg-overlay, script[data-cg-bridge], script[src*="bridge.js"]');
    for (var i = 0; i < junk.length; i++) junk[i].parentNode.removeChild(junk[i]);
    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }

  function announceReady() {
    var inv = inventory();
    post('cg:ready', { title: document.title || '', url: String(location.href).slice(0, 300), elements: inv.elements, count: inv.total, at: Date.now() });
  }

  /* ---------- events ---------- */
  function onMove(e) { setHover(targetFrom(e.target)); }
  function onLeave(e) { if (!e.relatedTarget) setHover(null); }
  function onDown(e) {
    if (!state.review || e.button !== 0) return;
    var t = targetFrom(e.target);
    if (t) e.preventDefault();
  }
  function onClick(e) {
    var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (state.review) {
      e.preventDefault();
      e.stopPropagation();
      var t = targetFrom(e.target);
      if (t) select(t === state.selectedEl ? null : t, 'user');
      return;
    }
    if (link) {
      var href = link.getAttribute('href') || '';
      if (href.charAt(0) !== '#') { e.preventDefault(); post('cg:blocked', { href: href.slice(0, 200) }); }
    }
  }
  function onSubmit(e) { e.preventDefault(); post('cg:blocked', { href: 'form submission' }); }
  function onKey(e) {
    if (e.key === 'Escape') { if (state.selectedEl) select(null, 'user'); post('cg:key', { key: 'Escape' }); return; }
    var tag = e.target && e.target.tagName;
    var typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable);
    if (typing && state.review === false) return;
    if (e.key === '/' || ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z'))) {
      e.preventDefault();
      post('cg:key', { key: e.key, meta: !!(e.metaKey || e.ctrlKey), shift: !!e.shiftKey });
    }
  }

  function onMessage(e) {
    if (e.source !== parentWin) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || typeof d.type !== 'string' || d.type.indexOf('cg:') !== 0) return;
    switch (d.type) {
      case 'cg:config':
        state.review = d.review !== false;
        if (!state.review) setHover(null);
        document.documentElement.style.cursor = '';
        schedule();
        break;
      case 'cg:point':
        point(String(d.id || ''), d.label, d.tone, { hold: Number(d.hold) || 0 });
        break;
      case 'cg:clear':
        if (d.scope === 'selection' || d.scope === 'all') { state.selectedEl = null; }
        if (d.scope === 'hover' || d.scope === 'all') { state.simulated = null; }
        if (!d.scope || d.scope === 'ai' || d.scope === 'all') clearAi();
        if (d.scope === 'fade') fadeAi();
        schedule();
        break;
      case 'cg:select':
        select(d.id ? byId(String(d.id)) : null, 'parent');
        if (d.id && state.selectedEl && d.reveal) {
          var r = state.selectedEl.getBoundingClientRect();
          if (r.bottom < 0 || r.top > window.innerHeight) state.selectedEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        break;
      case 'cg:simulate-hover':
        state.simulated = d.id ? byId(String(d.id)) : null;
        state.simulatedLabel = d.label ? clean(d.label, 60) : '';
        if (state.simulated) {
          var sr = state.simulated.getBoundingClientRect();
          if (sr.bottom < 0 || sr.top > window.innerHeight) state.simulated.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        schedule();
        break;
      case 'cg:snapshot':
        post('cg:snapshot', { nonce: d.nonce, html: snapshotHtml().slice(0, 200000), title: document.title || '' });
        break;
      case 'cg:ping':
        announceReady();
        break;
    }
  }

  var mutationTimer = 0;
  function watch() {
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(function (records) {
      var relevant = false;
      for (var i = 0; i < records.length; i++) {
        if (records[i].type === 'childList' && !isOurs(records[i].target)) { relevant = true; break; }
      }
      if (!relevant) return;
      window.clearTimeout(mutationTimer);
      mutationTimer = window.setTimeout(function () {
        if (stamp(document.body)) post('cg:elements', inventory());
        if (state.selectedEl && !state.selectedEl.isConnected) select(null, 'mutation');
      }, 450);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function init() {
    if (!document.body) { window.setTimeout(init, 30); return; }
    stamp(document.body);
    buildOverlay();
    document.addEventListener('pointermove', onMove, { passive: true, capture: true });
    document.addEventListener('pointerout', onLeave, true);
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('auxclick', function (e) { if (state.review) e.preventDefault(); }, true);
    document.addEventListener('submit', onSubmit, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('message', onMessage);
    watch();
    announceReady();
    // Fonts and images shift layout after first paint; refresh rects once things settle.
    window.addEventListener('load', function () { schedule(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
