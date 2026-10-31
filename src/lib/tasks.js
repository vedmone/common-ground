const STATES = new Set([
  'queued',
  'running',
  'needs_detail',
  'needs_choice',
  'ready',
  'failed',
  'cancelled',
  'interrupted',
]);
const KINDS = new Set([
  'create',
  'edit',
  'compare',
  'manual',
  'publish',
  'image',
]);
const bounded = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
export function taskTitle(text) {
  return (
    String(text || 'Page change')
      .replace(/\s+/g, ' ')
      .replace(/^(?:okay[, ]+|please |can you |could you )/i, '')
      .trim()
      .slice(0, 85) || 'Page change'
  );
}
export function trimTasks(tasks) {
  const pending = tasks.filter(
    (t) => !['ready', 'cancelled'].includes(t.state),
  );
  const recent = tasks
    .filter((t) => ['ready', 'cancelled'].includes(t.state))
    .slice(-32);
  return [...pending, ...recent].sort((a, b) => a.seq - b.seq).slice(-60);
}
export function updateTask(tasks, id, patch) {
  return tasks.map((t) =>
    t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t,
  );
}
export function addTask(tasks, task) {
  if (tasks.some((t) => t.id === task.id))
    return updateTask(tasks, task.id, task);
  return trimTasks([...tasks, task]);
}
export function cleanTasks(raw, versions = [], work) {
  const ids = new Set(versions.map((v) => v.id));
  if (!Array.isArray(raw)) {
    if (!work || (!work.awaitingClarification && work.state === 'answered'))
      return [];
    const id = work.taskId || `task-${work.id || 'legacy'}`;
    const state = work.awaitingClarification
      ? 'needs_detail'
      : work.state === 'ready'
        ? 'ready'
        : work.state === 'failed'
          ? 'failed'
          : work.state === 'cancelled'
            ? 'cancelled'
            : 'interrupted';
    const first = {
      id,
      seq: 1,
      request: work.request,
      title: taskTitle(work.request),
      kind: work.task === 'create' ? 'create' : 'edit',
      state,
      createdAt: work.startedAt || Date.now(),
      startedAt: work.startedAt || 0,
      updatedAt: work.finishedAt || Date.now(),
      target: work.target || null,
      question: work.question || '',
      error: work.error || '',
      resultVersionId: state === 'ready' ? versions.at(-1)?.id : null,
      attempt: 1,
    };
    return [
      first,
      ...(work.followups || []).slice(0, 8).map((request, i) => ({
        id: `${id}-${i + 1}`,
        seq: i + 2,
        request,
        title: taskTitle(request),
        kind: 'edit',
        state: 'queued',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        attempt: 0,
        target: null,
      })),
    ];
  }
  const unique = new Map();
  for (const item of raw.slice(-60)) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id ||
      !STATES.has(item.state) ||
      typeof item.request !== 'string'
    )
      continue;
    const interrupted = ['running', 'needs_choice'].includes(item.state);
    unique.set(item.id, {
      id: bounded(item.id, 120),
      seq:
        Number.isSafeInteger(item.seq) && item.seq > 0
          ? item.seq
          : unique.size + 1,
      order: Number.isFinite(item.order) ? item.order : item.seq,
      reviewedAt: Number.isFinite(item.reviewedAt) ? item.reviewedAt : 0,
      request: bounded(item.request, 5000),
      title: bounded(item.title, 85) || taskTitle(item.request),
      kind: KINDS.has(item.kind) ? item.kind : 'edit',
      state: interrupted ? 'interrupted' : item.state,
      createdAt: Number.isFinite(item.createdAt) ? item.createdAt : Date.now(),
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : Date.now(),
      startedAt: Number.isFinite(item.startedAt) ? item.startedAt : 0,
      finishedAt: Number.isFinite(item.finishedAt) ? item.finishedAt : 0,
      attempt: Number.isSafeInteger(item.attempt)
        ? Math.min(100, item.attempt)
        : 0,
      sourceMessageId: bounded(item.sourceMessageId, 120),
      via: bounded(item.via, 30),
      target:
        item.target && typeof item.target.id === 'string'
          ? {
              id: bounded(item.target.id, 120),
              label: bounded(item.target.label, 200),
              tag: bounded(item.target.tag, 30),
              locked: !!item.target.locked,
            }
          : null,
      question: bounded(item.question, 400),
      error: interrupted
        ? 'This task stopped when the room closed. Retry to continue.'
        : bounded(item.error, 400),
      baseVersionId: ids.has(item.baseVersionId) ? item.baseVersionId : null,
      resultVersionId: ids.has(item.resultVersionId)
        ? item.resultVersionId
        : null,
      applied: item.applied !== false,
      url:
        typeof item.url === 'string' && item.url.startsWith('https://')
          ? item.url.slice(0, 2048)
          : null,
    });
  }
  return trimTasks([...unique.values()]);
}
export function nextQueuedTask(tasks, paused, hasPage) {
  if (
    paused ||
    tasks.some((t) =>
      ['running', 'needs_detail', 'needs_choice'].includes(t.state),
    )
  )
    return null;
  const queued = tasks
    .filter((t) => t.state === 'queued')
    .sort((a, b) => (a.order ?? a.seq) - (b.order ?? b.seq));
  const next = queued[0];
  if (!hasPage && tasks.some((t) => t.kind === 'create' && t.state !== 'ready'))
    return queued.find((t) => t.kind === 'create') || null;
  return next || null;
}
export function inputLane(text) {
  const value = String(text || '').trim();
  if (
    /(?:explain|samjhao|समझाओ)/i.test(value) &&
    !/^(?:please )?(?:add|make|change|replace|remove|build|create|update|move|redesign)\b/i.test(
      value,
    )
  )
    return 'conversation';
  if (
    /^(?:(?:please|also|and)\s+)?(?:add|make|change|update|replace|create|build|redesign|move|remove|insert|put|use|set|increase|decrease|show me two|give (?:me|it|this|that).*(?:look|style|two|options|versions|directions)|(?:can|could|would) you (?:add|make|change|create|build|replace))\b/i.test(
      value,
    )
  )
    return 'work';
  if (
    /(?:kar do|karo|banao|hatao|badlo|lagao|कर दो|करो|बनाओ|हटाओ|बदलो|लगाओ|बनाना है)/i.test(
      value,
    ) &&
    !/^(?:why|explain|tell me why|क्यों|kyun)/i.test(value)
  )
    return 'work';
  return 'conversation';
}
export function isInformationalQuestion(text) {
  return /^(?:what|why|which|where|when|how (?:does|do|is|are|to|can)|explain|tell me|kya|kyun|kaun|kaisa)(?:\s|$)|(?:क्यों|कैसे|कौन सा|क्या है)/i.test(
    String(text).trim(),
  );
}
export function taskCommand(text) {
  const value = String(text || '')
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String('०१२३४५६७८९'.indexOf(d)))
    .replace(/[.!?।]/g, '')
    .trim();
  if (/^(?:please )?pause (?:the )?(?:queue|tasks|task list)$/.test(value))
    return { action: 'pause' };
  const next = value.match(/^(?:do )?task (\d+) next(?: karo| करो)?$/);
  if (next) return { action: 'next', seq: Number(next[1]) };
  const reviewed = value.match(/^mark task (\d+) (?:as )?reviewed$/);
  if (reviewed) return { action: 'reviewed', seq: Number(reviewed[1]) };
  if (
    /^(?:please )?(?:continue|resume|start) (?:the )?(?:queue|tasks|task list)$/.test(
      value,
    )
  )
    return { action: 'continue' };
  const words = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    first: 1,
    second: 2,
  };
  const m =
    value.match(
      /^(?:please )?(cancel|stop|remove|retry|resume|view|show) (?:task|change)\s*(\d+|one|two|three|four|five|first|second)$/,
    ) ||
    value.match(
      /^(?:task|change)\s*(\d+) (cancel|stop|remove|retry|resume|view|show)(?: karo)?$/,
    );
  if (!m) return null;
  const reverse = /^(?:task|change)/.test(value),
    verb = reverse ? m[2] : m[1],
    number = reverse ? m[1] : m[2];
  return {
    action: ['cancel', 'stop', 'remove'].includes(verb)
      ? 'cancel'
      : ['retry', 'resume'].includes(verb)
        ? 'retry'
        : 'view',
    seq: words[number] || Number(number),
  };
}
