import { cleanTasks } from './tasks.js';
import { cleanWork } from './workConversation.js';
// Local persistence with strict validation. Anything malformed is dropped rather than trusted.

const PREFIX = 'commonground:v1:';
const MAX_VERSIONS = 32;
const MAX_MESSAGES = 240;
const MAX_HTML = 400_000;

export const DEFAULT_SETTINGS = {
  welcomeSeen: false,
  projectId: 'saltmarsh',
  language: 'auto',
  readAloud: false,
  handsFree: true,
  mode: 'discuss',
  companionUrl: 'http://127.0.0.1:4319',
  companionToken: '',
  hintsDismissed: false,
};

function read(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const str = (v, max = 2000) => typeof v === 'string' && v.length <= max;
const num = (v) => typeof v === 'number' && Number.isFinite(v);

export function loadSettings() {
  const raw = read('settings');
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  for (const key of ['welcomeSeen', 'readAloud', 'handsFree', 'hintsDismissed'])
    if (typeof raw[key] === 'boolean') s[key] = raw[key];
  if (str(raw.projectId, 60)) s.projectId = raw.projectId;
  s.language = 'auto';
  if (raw.mode === 'edit' || raw.mode === 'discuss') s.mode = raw.mode;
  if (str(raw.companionUrl, 300) && /^https?:\/\//.test(raw.companionUrl))
    s.companionUrl = raw.companionUrl;
  if (str(raw.companionToken, 300)) s.companionToken = raw.companionToken;
  return s;
}

export function saveSettings(settings) {
  return write('settings', settings);
}

function cleanRef(ref) {
  if (!ref || typeof ref !== 'object' || !str(ref.id, 120)) return null;
  return {
    id: ref.id,
    label: str(ref.label, 200) ? ref.label : '',
    kind: str(ref.kind, 40) ? ref.kind : '',
    tag: str(ref.tag, 30) ? ref.tag : '',
    locked: !!ref.locked,
  };
}

function cleanTargets(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((t) => t && str(t.id, 120))
    .slice(0, 8)
    .map((t) => ({ id: t.id, label: str(t.label, 200) ? t.label : '' }));
}

function cleanChanges(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && typeof c === 'object')
    .slice(0, 150)
    .map((c) => ({
      id: str(c.id, 120) ? c.id : '',
      description: str(c.description, 400) ? c.description : '',
    }));
}

function cleanSourceChanges(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (f) =>
        f &&
        str(f.file, 400) &&
        typeof f.before === 'string' &&
        typeof f.after === 'string',
    )
    .slice(0, 12)
    .map((f) => ({
      file: f.file,
      before: f.before.slice(0, 80_000),
      after: f.after.slice(0, 80_000),
    }));
}

function cleanVersion(v) {
  if (!v || typeof v !== 'object' || !str(v.id, 120) || !num(v.createdAt))
    return null;
  if (typeof v.html !== 'string' || v.html.length > MAX_HTML) return null;
  if (v.html && !/<html[\s>]/i.test(v.html)) return null;
  return {
    id: v.id,
    taskId: str(v.taskId, 120) ? v.taskId : null,
    html: v.html,
    summary: str(v.summary, 200) ? v.summary : 'Version',
    intent: str(v.intent, 1200) ? v.intent : '',
    createdAt: v.createdAt,
    parentId: str(v.parentId, 120) ? v.parentId : null,
    status: ['base', 'pending', 'kept', 'undone'].includes(v.status)
      ? v.status
      : 'kept',
    origin: ['sample', 'ai', 'demo', 'companion', 'snapshot'].includes(v.origin)
      ? v.origin
      : 'ai',
    changes: cleanChanges(v.changes),
    sourceChanges: cleanSourceChanges(v.sourceChanges),
    provider: str(v.provider, 80) ? v.provider : '',
  };
}

function cleanMessage(m) {
  if (!m || typeof m !== 'object' || !str(m.id, 120) || !num(m.at)) return null;
  if (!['user', 'assistant', 'note'].includes(m.role) || !str(m.content, 8000))
    return null;
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    at: m.at,
    via: ['voice', 'brief', 'resume', 'resume-followup'].includes(m.via)
      ? m.via
      : 'text',
    ref: cleanRef(m.ref),
    action: ['none', 'point', 'clarify', 'edit'].includes(m.action)
      ? m.action
      : undefined,
    targets: cleanTargets(m.targets),
    versionId: str(m.versionId, 120) ? m.versionId : null,
    taskId: str(m.taskId, 120) ? m.taskId : null,
    lane: m.lane === 'conversation' ? 'conversation' : 'work',
    provider: str(m.provider, 80) ? m.provider : '',
    language: /^(?:hinglish|(?:en|hi|bn|gu|kn|ml|mr|od|pa|ta|te)-IN)$/.test(
      m.language || '',
    )
      ? m.language
      : 'auto',
    scripted: !!m.scripted,
    progress: !!m.progress,
    local: !!m.local,
    error: str(m.error, 600) ? m.error : '',
    tone: ['info', 'error', 'success'].includes(m.tone) ? m.tone : undefined,
  };
}

export function validateSession(raw, projectId) {
  if (!raw || typeof raw !== 'object' || raw.projectId !== projectId)
    return null;
  const versions = Array.isArray(raw.versions)
    ? raw.versions.map(cleanVersion).filter(Boolean)
    : [];
  const ids = new Set();
  const unique = versions.filter((v) =>
    ids.has(v.id) ? false : ids.add(v.id),
  );
  if (!unique.length) return null;
  for (const v of unique)
    if (v.parentId && !ids.has(v.parentId))
      v.parentId = unique[0].id === v.id ? null : unique[0].id;
  const messages = Array.isArray(raw.messages)
    ? raw.messages.map(cleanMessage).filter(Boolean).slice(-MAX_MESSAGES)
    : [];
  let currentVersionId =
    str(raw.currentVersionId, 120) && ids.has(raw.currentVersionId)
      ? raw.currentVersionId
      : unique[unique.length - 1].id;
  const work = cleanWork(raw.work);
  const tasks = cleanTasks(raw.tasks, unique, work);
  return {
    projectId,
    tasks,
    queuePaused:
      !!raw.queuePaused ||
      tasks.some((t) => t.state === 'interrupted') ||
      (!Array.isArray(raw.tasks) &&
        ['running', 'failed', 'cancelled'].includes(work?.state)),
    voiceStyle: /^(?:hinglish|(?:en|hi|bn|gu|kn|ml|mr|od|pa|ta|te)-IN)$/.test(
      raw.voiceStyle || '',
    )
      ? raw.voiceStyle
      : undefined,
    createdAt: num(raw.createdAt) ? raw.createdAt : Date.now(),
    updatedAt: num(raw.updatedAt) ? raw.updatedAt : Date.now(),
    work,
    versions: unique,
    messages,
    currentVersionId,
    voiceMetrics: Array.isArray(raw.voiceMetrics)
      ? raw.voiceMetrics
          .slice(-40)
          .map((m) =>
            Object.fromEntries(
              Object.entries(m || {}).filter(
                ([key, value]) =>
                  [
                    'speechEndedAt',
                    'transcribedAt',
                    'requestAt',
                    'firstReplyAt',
                    'replyReadyAt',
                    'ttsRequestedAt',
                    'firstAudioAt',
                    'speechEndToAudioMs',
                  ].includes(key) && num(value),
              ),
            ),
          )
      : [],
  };
}

export function loadSession(projectId) {
  return validateSession(read(`session:${projectId}`), projectId);
}

/** Save; on quota errors, progressively drop old undone/kept versions (never base or current). */
export function saveSession(session) {
  let s = { ...session, updatedAt: Date.now() };
  if (s.versions.length > MAX_VERSIONS)
    s = trim(s, s.versions.length - MAX_VERSIONS);
  for (let attempt = 0; attempt < 6; attempt++) {
    if (write(`session:${s.projectId}`, s))
      return {
        ok: true,
        trimmed: attempt > 0 || s.versions.length !== session.versions.length,
        session: s,
      };
    const before = s.versions.length;
    s = trim(s, Math.max(2, Math.ceil(before / 4)));
    if (s.versions.length === before) break;
  }
  return { ok: false, session };
}

function trim(session, count) {
  const keep = new Set([session.currentVersionId, session.versions[0]?.id]);
  let cur = session.versions.find((v) => v.id === session.currentVersionId);
  while (cur?.parentId) {
    keep.add(cur.parentId);
    cur = session.versions.find((v) => v.id === cur.parentId);
    if (keep.size > 6) break;
  }
  const removable = session.versions.filter((v) => !keep.has(v.id));
  removable.sort(
    (a, b) =>
      (a.status === 'undone' ? -1 : 0) - (b.status === 'undone' ? -1 : 0) ||
      a.createdAt - b.createdAt,
  );
  const drop = new Set(removable.slice(0, count).map((v) => v.id));
  const versions = session.versions.filter((v) => !drop.has(v.id));
  const valid = new Set(versions.map((v) => v.id));
  return {
    ...session,
    versions: versions.map((v) =>
      v.parentId && !valid.has(v.parentId)
        ? { ...v, parentId: versions[0].id === v.id ? null : versions[0].id }
        : v,
    ),
    messages: session.messages.map((m) =>
      m.versionId && !valid.has(m.versionId) ? { ...m, versionId: null } : m,
    ),
  };
}

export function clearSession(projectId) {
  try {
    localStorage.removeItem(`${PREFIX}session:${projectId}`);
  } catch {
    /* ignore */
  }
}
