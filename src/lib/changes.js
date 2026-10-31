const normalize = (s) =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
const label = (e) =>
  normalize(e.label || e.text || e.kind || e.tag).slice(0, 85);
export function pageTour(elements, language = 'en-IN') {
  const meaningful = elements.filter(
    (e) => e.id && e.text && ['nav', 'h1', 'h2', 'footer'].includes(e.tag),
  );
  const seen = new Set();
  return meaningful
    .filter((e) => {
      const key = normalize(e.text);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 150)
    .map((e) => ({
      id: e.id,
      label: label(e),
      description:
        language === 'hinglish'
          ? `ये ${e.tag === 'h1' ? 'main headline' : e.tag === 'nav' ? 'navigation' : e.tag === 'footer' ? 'footer' : 'section'} है — “${label(e)}”.`
          : language === 'hi-IN'
            ? `यह ${e.tag === 'h1' ? 'मुख्य शीर्षक' : e.tag === 'nav' ? 'ऊपर की कड़ियाँ' : e.tag === 'footer' ? 'पृष्ठ का अंतिम हिस्सा' : 'हिस्सा'} है — “${label(e)}”।`
            : `${e.tag === 'h1' ? 'The main headline' : e.tag === 'nav' ? 'Navigation' : e.tag === 'footer' ? 'The footer' : 'This section'}: ${label(e)}.`,
    }));
}
export function changedTargets(
  before,
  after,
  requested = [],
  language = 'en-IN',
  limit = 6,
) {
  const old = new Map(before.map((e) => [e.id, e]));
  const changed = after.filter((e) => {
    if (
      ![
        'h1',
        'h2',
        'h3',
        'button',
        'a',
        'p',
        'img',
        'svg',
        'section',
        'article',
      ].includes(e.tag)
    )
      return false;
    const prev = old.get(e.id);
    return (
      !prev ||
      normalize(prev.text) !== normalize(e.text) ||
      JSON.stringify(prev.styles || {}) !== JSON.stringify(e.styles || {})
    );
  });
  const priority = (e) =>
    requested.some((c) => c.id === e.id)
      ? 0
      : /^(h[1-3]|button)$/.test(e.tag)
        ? 1
        : 2;
  const byId = new Map(after.map((e) => [e.id, e]));
  const isDescendant = (child, parentId) => {
    let node = child;
    for (let depth = 0; depth < 30 && node?.parentId; depth++) {
      if (node.parentId === parentId) return true;
      node = byId.get(node.parentId);
    }
    return false;
  };
  const seen = new Set();
  return changed
    .filter((e) => {
      const previous = old.get(e.id);
      if (
        !previous ||
        !['section', 'article'].includes(e.tag) ||
        requested.some((c) => c.id === e.id)
      )
        return true;
      if (
        JSON.stringify(previous.styles || {}) !== JSON.stringify(e.styles || {})
      )
        return true;
      return !changed.some(
        (child) => child.id !== e.id && isDescendant(child, e.id),
      );
    })
    .sort((a, b) => priority(a) - priority(b))
    .filter((e) => {
      const text = label(e);
      if (seen.has(text)) return false;
      seen.add(text);
      return true;
    })
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      label: label(e),
      description:
        requested.find((c) => c.id === e.id)?.description ||
        changeDescription(old.get(e.id), e, language),
    }));
}
function changeDescription(before, after, language) {
  if (!['hinglish', 'hi-IN'].includes(language))
    return `Updated ${after.kind || after.tag}: ${label(after)}`;
  const name =
    after.tag === 'img'
      ? 'image'
      : /^h[1-3]$/.test(after.tag)
        ? 'heading'
        : ['button', 'a'].includes(after.tag)
          ? 'button'
          : 'section';
  if (language === 'hi-IN')
    return `“${label(after)}” ${before ? 'का रूप बदल दिया है' : 'जोड़ दिया है'}।`;
  if (!before) return `यहाँ ${name} add कर दिया — “${label(after)}”.`;
  if (normalize(before.text) !== normalize(after.text))
    return `इस ${name} का text update कर दिया — “${label(after)}”.`;
  const properties = Object.keys(after.styles || {}).filter(
    (k) => after.styles[k] !== before.styles?.[k],
  );
  const detail = properties.some((k) => /border.?radius/i.test(k))
    ? 'corners'
    : properties.some((k) => /color|background/i.test(k))
      ? 'color'
      : properties.some((k) => /font.?size|width|height/i.test(k))
        ? 'size'
        : 'look';
  return `इस ${name} का ${detail} update कर दिया.`;
}

export function comparisonChoice(text) {
  const value = String(text)
    .trim()
    .replace(/[.!?।]+$/, '')
    .toLowerCase();
  if (
    /^(?:(?:i (?:like|prefer|choose|want)|use|keep|choose|pick|go with)\s+)?(?:(?:option|version|direction)\s+)?(?:a|1|one|first(?: one)?|pehla(?: wala)?|पहला)$/.test(
      value,
    )
  )
    return 0;
  if (
    /^(?:(?:i (?:like|prefer|choose|want)|use|keep|choose|pick|go with)\s+)?(?:(?:option|version|direction)\s+)?(?:b|2|two|second(?: one)?|doosra(?: wala)?|दूसरा)$/.test(
      value,
    )
  )
    return 1;
  return null;
}

export function changeReceipt(
  before,
  after,
  requested = [],
  language = 'en-IN',
) {
  const present = new Set(after.map((e) => e.id));
  const removed = before
    .filter(
      (e) =>
        e.id &&
        !present.has(e.id) &&
        [
          'h1',
          'h2',
          'h3',
          'p',
          'a',
          'button',
          'img',
          'section',
          'article',
        ].includes(e.tag),
    )
    .map((e) => ({
      id: e.id,
      label: label(e),
      description:
        language === 'hinglish'
          ? `“${label(e)}” remove कर दिया.`
          : language === 'hi-IN'
            ? `“${label(e)}” हटा दिया है।`
            : `Removed ${e.kind || e.tag}: ${label(e)}`,
      removed: true,
    }));
  return [
    ...changedTargets(before, after, requested, language, 150),
    ...removed,
  ].slice(0, 150);
}
