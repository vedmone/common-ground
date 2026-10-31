// Voice review is read-only. A tour records the version it describes and advances one element at a time.
const plain = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)))
    .replace(
      /task (one|two|three|four|five|six|seven|eight|nine|ten)\b/g,
      (_, n) =>
        `task ${{ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }[n]}`,
    )
    .replace(/[,.!?।—–-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export function reviewCommand(text, active = false) {
  const s = plain(text);
  if (active) {
    if (
      /^(?:please )?(?:next|next (?:one|element|section|change)|skip(?: this)?|aage|agla|आगे|अगला)$/.test(
        s,
      )
    )
      return { action: 'next' };
    if (
      /^(?:go )?(?:back|previous|previous (?:one|element|section|change)|pichhla|peeche|पिछला|पीछे)$/.test(
        s,
      )
    )
      return { action: 'back' };
    if (
      /^(?:repeat(?: that| this| the explanation)?|say (?:that|it) again|explain (?:it|that|this) again|phir se batao|dobara batao|फिर से बताओ)$/.test(
        s,
      )
    )
      return { action: 'repeat' };
    if (
      /^(?:pause(?: (?:the )?(?:tour|walkthrough|explanation))?|wait|hold on|ruko|रुको|stop)$/.test(
        s,
      )
    )
      return { action: 'pause' };
    if (
      /^(?:continue(?: (?:the )?(?:tour|walkthrough|explanation))?|resume(?: (?:the )?(?:tour|walkthrough|explanation))?|carry on|go on|aage batao|आगे बताओ)$/.test(
        s,
      )
    )
      return { action: 'resume' };
    if (
      /^(?:stop|end|close|cancel) (?:the )?(?:tour|walkthrough|explanation)$/.test(
        s,
      )
    )
      return { action: 'stop' };
  }
  const number =
    s.match(
      /(?:explain|review|walk me through|samjhao|समझाओ)\s+(?:the )?task\s*(\d+)/,
    ) || s.match(/task\s*(\d+)\s*(?:explain|samjhao|समझाओ)/);
  if (number)
    return { action: 'start', mode: 'changes', seq: Number(number[1]) };
  // A concrete editing instruction takes precedence over words such as "changes" or "element".
  if (
    /^(?:please )?(?:add|make|change|replace|remove|build|create|update|move|redesign)\b/.test(
      s,
    )
  )
    return null;
  if (
    /(?:explain|describe|walk|show|what|which|kya|batao|samjhao|समझाओ|बताओ|क्या).*(?:changes|changed|did you change|have you changed|edits|differences|change kiya|badla|बदला|बदलाव)|(?:kya kya|क्या क्या).*(?:change|बदला|बदलाव)/.test(
      s,
    )
  )
    return { action: 'start', mode: 'changes' };
  if (
    /(?:saare|all|sabhi|सारे|सभी).*(?:changes|edits|बदलाव).*(?:explain|samjhao|batao|समझाओ|बताओ)/.test(
      s,
    )
  )
    return { action: 'start', mode: 'changes' };
  if (
    /(?:explain|describe|walk|tour|samjhao|समझाओ|बताओ).*(?:every|each|all|har ek|saare|हर|सारे).*(?:element|section|part|detail|चीज|हिस्स)|(?:every|each|all|har(?: ek)?|saare|सभी|सारे|हर).*(?:element|section).*(?:explain|why|kyun|समझाओ|क्यों)/.test(
      s,
    )
  )
    return { action: 'start', mode: 'elements' };
  if (
    /(?:tour|walkthrough|walk me through|show me around|टूर|घुमाओ)/.test(s) &&
    !/\b(?:build|create|design|website for|tourism|travel company)\b/.test(s)
  )
    return { action: 'start', mode: 'page' };
  return null;
}
const TAGS = new Set([
  'nav',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'button',
  'a',
  'img',
  'svg',
  'input',
  'textarea',
  'select',
  'label',
  'figcaption',
  'footer',
]);
export function elementTour(elements) {
  return elements
    .filter(
      (e) =>
        e?.id &&
        TAGS.has(e.tag) &&
        (String(e.text || e.label || '').trim() ||
          ['img', 'svg', 'input', 'textarea', 'select'].includes(e.tag)),
    )
    .slice(0, 150)
    .map((e) => ({
      id: e.id,
      label: String(e.label || e.text || e.kind || e.tag)
        .replace(/\s+/g, ' ')
        .slice(0, 100),
      description: '',
      tag: e.tag,
    }));
}
export function changeTour(version, elements) {
  const byId = new Map(elements.map((e) => [e.id, e]));
  return (version?.changes || [])
    .filter((c) => c?.id)
    .slice(0, 60)
    .map((c) => {
      const e = byId.get(c.id);
      return {
        id: c.id,
        label: String(e?.text || e?.label || c.description || c.id)
          .replace(/\s+/g, ' ')
          .slice(0, 100),
        description: String(c.description || '').slice(0, 500),
        missing: !e,
        tag: e?.tag,
      };
    });
}
export function sourceEvidence(html, id) {
  if (!html || typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const e = [...doc.querySelectorAll('[data-cg-id]')].find(
    (e) => e.getAttribute('data-cg-id') === id,
  );
  if (!e) return null;
  return {
    tag: e.tagName.toLowerCase(),
    text: (e.textContent || e.getAttribute('alt') || '')
      .replace(/\s+/g, ' ')
      .slice(0, 350),
    inlineStyle: (e.getAttribute('style') || '').slice(0, 700),
    image:
      e.tagName === 'IMG' ? e.getAttribute('src')?.slice(0, 1200) : undefined,
  };
}
export function reviewEvidence(version, parent, step, task) {
  return {
    mode: 'element',
    focusId: step.id,
    versionSummary: version.summary || '',
    request: task?.request || version.intent || '',
    change: step.description || '',
    before: sourceEvidence(parent?.html, step.id),
    after: sourceEvidence(version.html, step.id),
    missing: !!step.missing,
  };
}
export function moveTaskNext(tasks, id) {
  const queued = tasks
    .filter((t) => t.state === 'queued')
    .sort((a, b) => (a.order ?? a.seq) - (b.order ?? b.seq));
  const task = queued.find((t) => t.id === id);
  if (!task || queued[0]?.id === id) return tasks;
  const first = queued[0].order ?? queued[0].seq;
  return tasks.map((t) =>
    t.id === id ? { ...t, order: first - 1, updatedAt: Date.now() } : t,
  );
}
