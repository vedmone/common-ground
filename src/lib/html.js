import BRIDGE_SOURCE from '../../public/bridge.js?raw';

const SKIP = new Set(['script', 'style', 'noscript', 'meta', 'link', 'title', 'head', 'br', 'wbr', 'template', 'base', 'html']);
const SVG_NS = 'http://www.w3.org/2000/svg';
const TEXT_HINT = /^(h[1-6]|a|button|label|li|p|span|strong|em|small|blockquote|figcaption|dt|dd|th|td)$/;

function slug(s, words = 3) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    .slice(0, words)
    .join('-')
    .slice(0, 30);
}

function makeId(el, used) {
  const tag = el.tagName.toLowerCase();
  let hint = el.id ? slug(el.id) : '';
  if (!hint && TEXT_HINT.test(tag)) hint = slug(el.textContent);
  if (!hint) {
    const cls = (el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0];
    hint = slug(cls);
  }
  const base = hint ? `${tag}-${hint}` : tag;
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

function stampable(el) {
  if (SKIP.has(el.tagName.toLowerCase())) return false;
  if (el.namespaceURI === SVG_NS && el.tagName.toLowerCase() !== 'svg') return false;
  return true;
}

function serialize(doc) {
  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

const DANGEROUS = 'script, iframe, object, embed, base, frame, frameset, portal';

/**
 * Parse an HTML document, optionally remove executable content, and give every useful element a
 * stable data-cg-id. Existing ids are preserved so the AI can keep referring to the same element
 * across versions. Returns serialized HTML or throws a readable error.
 */
export function prepareDocument(html, { sanitize = false } = {}) {
  const source = String(html || '').trim();
  if (source.length < 40) throw new Error('The page source is empty.');
  const doc = new DOMParser().parseFromString(source, 'text/html');
  if (!doc.body) throw new Error('The page has no body.');
  if (sanitize) {
    doc.querySelectorAll(DANGEROUS).forEach((n) => n.remove());
    doc.querySelectorAll('meta[http-equiv]').forEach((n) => {
      if (/refresh|content-security-policy/i.test(n.getAttribute('http-equiv') || '')) n.remove();
    });
    doc.querySelectorAll('*').forEach((el) => {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith('on')) el.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'src' || name === 'action' || name === 'formaction' || name === 'xlink:href') && /^\s*(javascript|vbscript|data:text\/html)/i.test(attr.value)) {
          el.removeAttribute(attr.name);
        }
      }
    });
  }
  const visibleText = (doc.body.textContent || '').trim();
  if (doc.body.children.length === 0 && visibleText.length < 2) throw new Error('The generated page has no visible content.');

  const all = [doc.body, ...doc.body.querySelectorAll('*')];
  const used = new Set();
  for (const el of all) {
    const id = el.getAttribute('data-cg-id');
    if (!id) continue;
    if (used.has(id) || !stampable(el)) el.removeAttribute('data-cg-id');
    else used.add(id);
  }
  if (!doc.body.hasAttribute('data-cg-id') && !used.has('page')) {
    doc.body.setAttribute('data-cg-id', 'page');
    used.add('page');
  }
  for (const el of all) {
    if (!stampable(el) || el.hasAttribute('data-cg-id')) continue;
    el.setAttribute('data-cg-id', makeId(el, used));
  }
  return serialize(doc);
}

export function stripReviewIds(html) {
  return String(html || '').replace(/\s+data-cg-id="[^"]*"/g, '');
}

export function titleOf(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html || '');
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

const CSP = [
  "default-src 'none'",
  "img-src https: data: blob:",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com data:",
  "script-src 'unsafe-inline'",
  "media-src https: data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
].join('; ');

/** Build the iframe srcDoc: the user's document plus a CSP and the injected bridge script. */
export function buildSrcDoc(html) {
  let doc = String(html || '');
  const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
  if (/<head[^>]*>/i.test(doc)) doc = doc.replace(/<head[^>]*>/i, (m) => `${m}${meta}`);
  else doc = doc.replace(/<html[^>]*>/i, (m) => `${m}<head>${meta}</head>`);
  const script = `<script data-cg-bridge>${BRIDGE_SOURCE.replace(/<\/script/gi, '<\\/script')}</script>`;
  const idx = doc.toLowerCase().lastIndexOf('</body>');
  return idx >= 0 ? `${doc.slice(0, idx)}${script}${doc.slice(idx)}` : `${doc}${script}`;
}

/**
 * Deterministic local edit used only by the scripted guided demonstration.
 * mutate receives the parsed document and changes it in place.
 */
export function transformDocument(html, mutate) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  mutate(doc);
  return prepareDocument(serialize(doc));
}

export function looksLikeHtml(s) {
  return typeof s === 'string' && /<(html|body|main|div|section)\b/i.test(s) && s.length >= 40;
}
