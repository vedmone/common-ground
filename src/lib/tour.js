// Grounding helpers: map model targets to real preview elements, and run Ground's pointer through
// them in step with the spoken reply.

const STOP = new Set(['the', 'a', 'an', 'this', 'that', 'of', 'and', 'to', 'in', 'on', 'for', 'with', 'is', 'it', 'section', 'element']);
const KIND_WORDS = {
  heading: ['h1', 'h2', 'h3', 'h4'], headline: ['h1', 'h2'], title: ['h1', 'h2', 'h3'], button: ['button', 'a'], cta: ['button', 'a'],
  link: ['a'], image: ['img', 'svg', 'figure'], illustration: ['svg', 'div'], paragraph: ['p'], nav: ['nav'], navigation: ['nav'],
  footer: ['footer'], header: ['header'], card: ['article', 'div', 'li'], form: ['form'], field: ['input', 'textarea'], list: ['ul', 'ol'],
};

function tokens(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

export function matchElement(label, elements) {
  const words = tokens(label);
  if (!words.length || !elements?.length) return null;
  const wanted = new Set(words.flatMap((w) => KIND_WORDS[w] || []));
  let best = null;
  let bestScore = 0;
  for (const el of elements) {
    const hay = new Set([...tokens(el.text), ...tokens(el.id), ...tokens(el.selector), ...tokens(el.kind)]);
    let score = 0;
    for (const w of words) if (hay.has(w)) score += w.length > 3 ? 2 : 1;
    if (wanted.has(el.tag)) score += 1.5;
    const text = String(el.text || '').toLowerCase();
    const phrase = String(label || '').toLowerCase().trim();
    if (phrase.length > 5 && text.includes(phrase)) score += 4;
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }
  return bestScore >= 2.5 ? best : null;
}

/** Resolve [{id,label}] against the current element inventory; drop what cannot be grounded. */
export function resolveTargets(targets, elements) {
  const ids = new Map((elements || []).map((e) => [e.id, e]));
  const out = [];
  const seen = new Set();
  for (const t of targets || []) {
    if (!t) continue;
    let el = t.id && ids.get(t.id);
    if (!el) el = matchElement(t.label || t.description || t.id, elements);
    if (!el || seen.has(el.id)) continue;
    seen.add(el.id);
    out.push({ id: el.id, label: t.label || t.description || el.text || el.kind || el.tag, kind: el.kind });
  }
  return out;
}

function positionInReply(reply, label) {
  const text = String(reply || '').toLowerCase();
  if (!text) return -1;
  const phrase = String(label || '').toLowerCase().trim();
  if (phrase && text.includes(phrase)) return text.indexOf(phrase) / text.length;
  for (const w of tokens(label).sort((a, b) => b.length - a.length)) {
    if (w.length < 4) continue;
    const i = text.indexOf(w);
    if (i >= 0) return i / text.length;
  }
  return -1;
}

/**
 * PointerTour sends cg:point commands to the bridge. The first target is shown immediately; the
 * rest are scheduled either across the audio duration (when speech starts) or at reading pace.
 */
export class PointerTour {
  constructor(send, onStep) {
    this.send = send;
    this.onStep = onStep;
    this.timers = [];
    this.active = null;
  }

  start(targets, { reply = '', tone = 'point', expectAudio = false } = {}) {
    this.cancel(false);
    if (!targets?.length) return;
    this.active = { targets, reply, tone, synced: false };
    this.step(0);
    if (!expectAudio) this.schedule(Math.max(2.2, reply.length / 15));
  }

  /** Called when spoken audio actually begins; reschedules remaining targets against its duration. */
  syncToAudio(duration) {
    const a = this.active;
    if (!a || a.synced) return;
    a.synced = true;
    this.clearTimers();
    this.schedule(duration > 0 ? duration : Math.max(2.2, a.reply.length / 15));
  }

  /** Speech failed or was skipped: fall back to reading pace. */
  audioUnavailable() {
    const a = this.active;
    if (!a || a.synced) return;
    a.synced = true;
    this.clearTimers();
    this.schedule(Math.max(2.2, a.reply.length / 15));
  }

  schedule(seconds) {
    const a = this.active;
    if (!a) return;
    const n = a.targets.length;
    const total = seconds * 1000;
    let last = 0;
    const times = a.targets.map((t, i) => {
      if (i === 0) return 0;
      const p = positionInReply(a.reply, t.label);
      const even = (i / n) * total * 0.92;
      return p > 0 ? Math.max(p * total, 0) : even;
    });
    for (let i = 1; i < n; i++) {
      const at = Math.max(times[i], last + 1100);
      last = at;
      this.timers.push(setTimeout(() => this.step(i), at));
    }
    this.timers.push(setTimeout(() => this.finish(), Math.max(total, last + 1600) + 2600));
  }

  step(i) {
    const a = this.active;
    if (!a) return;
    const t = a.targets[i];
    this.send({ type: 'cg:point', id: t.id, label: t.label, tone: a.tone });
    this.onStep?.({ index: i, total: a.targets.length, target: t, tone: a.tone });
  }

  finish() {
    if (!this.active) return;
    this.send({ type: 'cg:clear', scope: 'fade' });
    this.active = null;
    this.onStep?.(null);
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  cancel(fade = true) {
    this.clearTimers();
    const was = this.active;
    this.active = null;
    if (was && fade) {
      this.send({ type: 'cg:clear', scope: 'fade' });
      this.onStep?.(null);
    }
  }
}
