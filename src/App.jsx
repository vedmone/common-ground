import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import TopBar from './components/TopBar.jsx';
import Welcome from './components/Welcome.jsx';
import PreviewStage from './components/PreviewStage.jsx';
import Conversation from './components/Conversation.jsx';
import CallDock from './components/CallDock.jsx';
import ActionBar from './components/ActionBar.jsx';
import SourceDrawer from './components/SourceDrawer.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import SetupPanel from './components/SetupPanel.jsx';
import HelpPanel from './components/HelpPanel.jsx';
import TourBanner from './components/TourBanner.jsx';
import { ConfirmDialog, Toasts } from './components/Feedback.jsx';
import { SAMPLE_PROJECTS, COMPANION_PROJECT, projectById } from './samples/index.js';
import { loadSettings, saveSettings, loadSession, saveSession, clearSession } from './lib/storage.js';
import { api, companionApi, isAbort } from './lib/api.js';
import { prepareDocument, buildSrcDoc, transformDocument } from './lib/html.js';
import { createBridgeStore } from './lib/bridgeStore.js';
import { PointerTour, resolveTargets } from './lib/tour.js';
import { VoiceSession, voiceSupport, micErrorMessage } from './lib/voice.js';
import { SpeechPlayer } from './lib/player.js';
import { DEMO_STEPS } from './lib/demo.js';
import { uid, clip, UNDO_RE, STOP_RE, describeElement } from './lib/util.js';

/* ---------------- session helpers ---------------- */

function freshSession(project) {
  const base = {
    id: uid('v'),
    html: project.html ? prepareDocument(project.html) : '',
    summary: project.id === 'companion' ? 'Connected project' : 'Original',
    intent: '',
    createdAt: Date.now(),
    parentId: null,
    status: 'base',
    origin: project.id === 'companion' ? 'companion' : 'sample',
    changes: [],
    sourceChanges: [],
    provider: '',
  };
  return { projectId: project.id, createdAt: Date.now(), updatedAt: Date.now(), versions: [base], messages: [], currentVersionId: base.id };
}

function loadOrCreate(project) {
  return loadSession(project.id) || freshSession(project);
}

const currentOf = (s) => s.versions.find((v) => v.id === s.currentVersionId) || s.versions[0];

function refSummary(ref) {
  const el = ref?.selection || ref?.hover;
  if (!el?.id) return null;
  return { id: el.id, label: el.label || el.text || '', kind: el.kind || '', tag: el.tag || '', locked: !!ref.selection };
}

function toApiMessages(messages, versions) {
  const summaries = new Map(versions.map((v) => [v.id, v]));
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && !m.scripted && !m.error && m.content.trim())
    .slice(-16)
    .map((m) => {
      let content = m.content;
      if (m.role === 'user' && m.ref) content += `\n[pointing at ${m.ref.id}${m.ref.label ? ` "${clip(m.ref.label, 50)}"` : ''}${m.ref.locked ? ', locked selection' : ''}]`;
      if (m.role === 'assistant' && m.versionId) {
        const v = summaries.get(m.versionId);
        if (v) content += `\n[applied edit: ${v.summary}${v.status === 'undone' ? ' — later undone by the user' : ''}]`;
      }
      return { role: m.role, content };
    });
}

function cleanElement(el) {
  if (!el || typeof el !== 'object' || typeof el.id !== 'string') return null;
  const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const rect = el.rect && typeof el.rect === 'object' ? { x: +el.rect.x || 0, y: +el.rect.y || 0, width: +el.rect.width || 0, height: +el.rect.height || 0 } : undefined;
  return {
    id: s(el.id, 120),
    tag: s(el.tag, 30),
    kind: s(el.kind, 30),
    label: s(el.label, 120),
    text: s(el.text, 200),
    selector: s(el.selector, 240),
    parentId: typeof el.parentId === 'string' ? el.parentId.slice(0, 120) : null,
    childId: typeof el.childId === 'string' ? el.childId.slice(0, 120) : null,
    rect,
    styles: el.styles && typeof el.styles === 'object' ? el.styles : undefined,
  };
}

/* ---------------- app ---------------- */

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const updateSettings = useCallback((patch) => setSettings((s) => ({ ...s, ...patch })), []);
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const [welcome, setWelcome] = useState(() => !settings.welcomeSeen);
  const [health, setHealth] = useState({ status: 'checking', chat: false, voice: false, provider: '' });
  const [projectId, setProjectId] = useState(() => (projectById(settings.projectId) ? settings.projectId : SAMPLE_PROJECTS[0].id));
  const project = projectById(projectId) || SAMPLE_PROJECTS[0];
  const isCompanion = project.id === 'companion';
  const [session, setSession] = useState(() => loadOrCreate(project));
  const [panel, setPanel] = useState(null); // 'source' | 'history' | 'setup' | 'help'
  const [turn, setTurn] = useState({ phase: 'idle', startedAt: 0 });
  const [transcribing, setTranscribing] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [queued, setQueued] = useState(null);
  const [call, setCall] = useState({ active: false, connecting: false, state: 'off', muted: false, speakerMuted: false, error: '' });
  const [companion, setCompanion] = useState({ status: 'disconnected', info: null, error: '' });
  const [previewNonce, setPreviewNonce] = useState(0);
  const [reviewMode, setReviewMode] = useState(true);
  const [pointing, setPointing] = useState(null);
  const [demo, setDemo] = useState(null); // {index, playing}
  const [toasts, setToasts] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [composerSeed, setComposerSeed] = useState(null);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);

  const store = useMemo(() => createBridgeStore(), []);
  const bridge = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const iframeRef = useRef(null);
  const previewOriginRef = useRef('*');
  const player = useMemo(() => new SpeechPlayer(), []);
  const voiceRef = useRef(null);
  const turnRef = useRef(null);
  const speakCtrlRef = useRef(null);
  const transcribeCtrls = useRef(new Set());
  const utterRefs = useRef(new Map());
  const queueRef = useRef(null);
  const snapshotWaiters = useRef(new Map());
  const levelListeners = useRef(new Set());
  const composerRef = useRef(null);
  const blockedToastAt = useRef(0);

  const current = currentOf(session);

  // Latest values for callbacks that outlive a render (voice handlers, timers, async turns).
  const live = useRef(null);
  useLayoutEffect(() => {
    live.current = { session, settings, health, project, companion, call, turn, reviewMode, demo, current };
  });

  /* ---------- toasts ---------- */
  const toast = useCallback((message, tone = 'info', ms = 4200) => {
    const id = uid('t');
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    if (ms) setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  /* ---------- preview messaging ---------- */
  const sendToPreview = useCallback((msg) => {
    const w = iframeRef.current?.contentWindow;
    if (w) w.postMessage(msg, previewOriginRef.current || '*');
  }, []);

  const tour = useMemo(() => new PointerTour((msg) => sendToPreview(msg), (step) => setPointing(step)), [sendToPreview]);

  useEffect(() => {
    sendToPreview({ type: 'cg:config', review: reviewMode });
  }, [reviewMode, sendToPreview]);

  /* ---------- persistence ---------- */
  const storageWarned = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      const result = saveSession(session);
      if (!result.ok && !storageWarned.current) {
        storageWarned.current = true;
        toast('Browser storage is full, so the latest versions may not survive a refresh. Export the session to keep a copy.', 'error', 8000);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [session, toast]);

  /* ---------- health ---------- */
  const checkHealth = useCallback(async () => {
    setHealth((h) => ({ ...h, status: 'checking' }));
    try {
      const r = await api.health();
      setHealth({ status: 'ok', chat: !!r.chat, voice: !!r.voice, provider: r.provider || '', companionHost: !!r.companion, message: r.chat ? '' : 'AI keys are not configured on this server.' });
    } catch (e) {
      setHealth({ status: 'error', chat: false, voice: false, provider: '', message: e.message || 'The server is unreachable.' });
    }
  }, []);
  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  /* ---------- player ---------- */
  useEffect(
    () =>
      player.subscribe((playing) => {
        setSpeaking(playing);
        voiceRef.current?.setPlayback(playing);
        if (!playing) setSpeakingMessageId(null);
      }),
    [player],
  );

  /* ---------- session mutations ---------- */
  const appendMessages = useCallback((...msgs) => {
    setSession((s) => ({ ...s, messages: [...s.messages, ...msgs].slice(-240) }));
  }, []);
  const patchMessage = useCallback((id, patch) => {
    setSession((s) => ({ ...s, messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  }, []);
  const note = useCallback((content, tone = 'info', extra = {}) => appendMessages({ id: uid('m'), role: 'note', content, at: Date.now(), tone, ...extra }), [appendMessages]);

  const commitVersion = useCallback(
    (v) => {
      store.set({ ready: false });
      setSession((s) => ({
        ...s,
        versions: [...s.versions.map((x) => (x.status === 'pending' ? { ...x, status: 'kept' } : x)), v],
        currentVersionId: v.id,
      }));
    },
    [store],
  );

  /* ---------- reference capture ---------- */
  const captureReference = useCallback(() => {
    const snap = store.getSnapshot();
    const now = Date.now();
    const recent = store.trail.slice(-18);
    const trail = recent
      .map((t, i) => ({ ...t, dwellMs: (recent[i + 1]?.at ?? now) - t.at }))
      .filter((t) => t.dwellMs >= 140)
      .slice(-12)
      .map((t) => ({ id: t.id, kind: t.kind, tag: t.tag, label: clip(t.label, 60), secondsAgo: Math.round((now - t.at) / 100) / 10, dwellMs: t.dwellMs }));
    return { selection: snap.selection, hover: store.hover, trail, capturedAt: now };
  }, [store]);

  const requestSnapshot = useCallback(() => {
    return new Promise((resolve) => {
      const nonce = uid('snap');
      const timer = setTimeout(() => {
        snapshotWaiters.current.delete(nonce);
        resolve('');
      }, 1500);
      snapshotWaiters.current.set(nonce, (html) => {
        clearTimeout(timer);
        resolve(html);
      });
      sendToPreview({ type: 'cg:snapshot', nonce });
    });
  }, [sendToPreview]);

  /* ---------- bridge listener ---------- */
  const handleKeyRef = useRef(null);
  useEffect(() => {
    function onMessage(e) {
      const frame = iframeRef.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const d = e.data;
      if (!d || typeof d !== 'object' || typeof d.type !== 'string' || !d.type.startsWith('cg:')) return;
      switch (d.type) {
        case 'cg:ready': {
          const elements = Array.isArray(d.elements) ? d.elements.map(cleanElement).filter(Boolean) : [];
          store.markReady({ title: String(d.title || '').slice(0, 200), elements, count: Number(d.count) || elements.length, url: String(d.url || '') });
          sendToPreview({ type: 'cg:config', review: live.current?.reviewMode !== false });
          const sel = store.getSnapshot().selection;
          if (sel) sendToPreview({ type: 'cg:select', id: sel.id });
          break;
        }
        case 'cg:elements':
          store.setElements(Array.isArray(d.elements) ? d.elements.map(cleanElement).filter(Boolean) : []);
          break;
        case 'cg:hover':
          store.recordHover(cleanElement(d.element), Number(d.at) || Date.now());
          break;
        case 'cg:select': {
          const el = cleanElement(d.element);
          store.set({ selection: el });
          if (el && d.origin === 'user' && !live.current.settings.hintsDismissed) updateSettings({ hintsDismissed: true });
          break;
        }
        case 'cg:snapshot': {
          const w = snapshotWaiters.current.get(d.nonce);
          if (w) {
            snapshotWaiters.current.delete(d.nonce);
            w(typeof d.html === 'string' ? d.html : '');
          }
          break;
        }
        case 'cg:key':
          handleKeyRef.current?.({ key: d.key, meta: !!d.meta, shift: !!d.shift, fromPreview: true });
          break;
        case 'cg:blocked':
          if (Date.now() - blockedToastAt.current > 6000) {
            blockedToastAt.current = Date.now();
            toast(live.current.reviewMode ? 'Review mode is on: clicks select elements instead of following links.' : 'Navigation is paused inside the preview so your review stays put.');
          }
          break;
        default:
          break;
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [store, sendToPreview, toast, updateSettings]);

  /* ---------- interrupt ---------- */
  const interrupt = useCallback(
    ({ silent = false } = {}) => {
      const hadTurn = !!turnRef.current;
      turnRef.current?.controller.abort();
      turnRef.current = null;
      speakCtrlRef.current?.abort();
      speakCtrlRef.current = null;
      for (const c of transcribeCtrls.current) c.abort();
      transcribeCtrls.current.clear();
      const wasSpeaking = player.playing;
      player.stop();
      tour.cancel();
      queueRef.current = null;
      setQueued(null);
      setTurn({ phase: 'idle', startedAt: 0 });
      if (!silent && (hadTurn || wasSpeaking)) note(hadTurn ? 'You interrupted Ground. Your latest preview is still available.' : 'Stopped Ground’s voice.', 'info');
    },
    [player, tour, note],
  );

  /* ---------- speech ---------- */
  const speakText = useCallback(
    async (text, { messageId, onStart, language } = {}) => {
      const { health: h, settings: st, companion: comp } = live.current;
      const viaCompanion = !h.voice && comp.status === 'connected' && comp.info?.voice;
      if (!h.voice && !viaCompanion) return 'unavailable';
      speakCtrlRef.current?.abort();
      const ctrl = new AbortController();
      speakCtrlRef.current = ctrl;
      try {
        const r = viaCompanion
          ? await api.speak(text.slice(0, 2000), language || st.language, ctrl.signal, companionApi.normalizeBase(st.companionUrl), st.companionToken)
          : await api.speak(text.slice(0, 2000), language || st.language, ctrl.signal);
        if (ctrl.signal.aborted) return 'cancelled';
        if (!r?.audio) return 'error';
        setSpeakingMessageId(messageId || null);
        const result = await player.play(r.audio, r.mimeType, { onStart });
        if (result === 'blocked') toast('Your browser blocked audio playback. Press Listen on the reply to hear it.', 'info', 6000);
        return result;
      } catch (e) {
        if (isAbort(e)) return 'cancelled';
        toast(`Voice reply unavailable: ${e.message}`, 'error');
        return 'error';
      } finally {
        if (speakCtrlRef.current === ctrl) speakCtrlRef.current = null;
      }
    },
    [player, toast],
  );

  const listen = useCallback(
    (message) => {
      if (speakingMessageId === message.id) {
        player.stop();
        speakCtrlRef.current?.abort();
        return;
      }
      speakText(message.content, { messageId: message.id });
    },
    [player, speakText, speakingMessageId],
  );

  /* ---------- versions: keep / undo / restore ---------- */
  const versionNumber = useCallback((id) => live.current.session.versions.findIndex((v) => v.id === id) + 1, []);

  const undo = useCallback(
    async ({ announce = false } = {}) => {
      const s = live.current.session;
      const cur = currentOf(s);
      if (!cur.parentId) {
        toast('Nothing to undo. You are on the original version.');
        if (announce) appendMessages({ id: uid('m'), role: 'assistant', content: 'There’s nothing to undo yet. This is still the original version.', at: Date.now(), local: true });
        return false;
      }
      if (cur.origin === 'companion') {
        const { settings: st } = live.current;
        try {
          await companionApi.undo(st.companionUrl, st.companionToken);
          setPreviewNonce((n) => n + 1);
        } catch (e) {
          toast(`The companion could not restore your files: ${e.message}`, 'error', 7000);
          return false;
        }
      }
      tour.cancel();
      store.set({ ready: false });
      setSession((x) => ({ ...x, versions: x.versions.map((v) => (v.id === cur.id ? { ...v, status: 'undone' } : v)), currentVersionId: cur.parentId }));
      const n = s.versions.findIndex((v) => v.id === cur.parentId) + 1;
      if (announce) appendMessages({ id: uid('m'), role: 'assistant', content: `Undone “${cur.summary}”. You’re back on v${n}.`, at: Date.now(), local: true });
      else toast(`Undone “${clip(cur.summary, 40)}”. Back on v${n}.`, 'success');
      return true;
    },
    [appendMessages, store, toast, tour],
  );

  const keep = useCallback(() => {
    const cur = currentOf(live.current.session);
    setSession((x) => ({ ...x, versions: x.versions.map((v) => (v.id === cur.id ? { ...v, status: 'kept' } : v)) }));
    toast(`Kept “${clip(cur.summary, 40)}”.`, 'success', 2600);
  }, [toast]);

  const restore = useCallback(
    (id) => {
      const s = live.current.session;
      if (id === s.currentVersionId) return;
      const target = s.versions.find((v) => v.id === id);
      if (!target) return;
      if (live.current.project.id === 'companion') {
        toast('Your local files change through Claude Code, so earlier versions can’t be restored from here. Use Undo for the latest edit.', 'info', 6000);
        return;
      }
      tour.cancel();
      store.set({ ready: false });
      setSession((x) => ({ ...x, versions: x.versions.map((v) => (v.id === id && v.status === 'undone' ? { ...v, status: 'kept' } : v)), currentVersionId: id }));
      toast(`Showing v${s.versions.indexOf(target) + 1} · ${clip(target.summary, 40)}`, 'success', 2600);
    },
    [store, toast, tour],
  );

  /* ---------- the conversational turn ---------- */
  const runTurnRef = useRef(null);

  const finishTurn = useCallback((id) => {
    if (turnRef.current?.id !== id) return;
    turnRef.current = null;
    setTurn({ phase: 'idle', startedAt: 0 });
    const next = queueRef.current;
    if (next) {
      queueRef.current = null;
      setQueued(null);
      setTimeout(() => runTurnRef.current?.(next.text, next.opts), 50);
    }
  }, []);

  const sendTurn = useCallback(
    async (rawText, opts = {}) => {
      const text = String(rawText || '').trim();
      if (!text) return;
      const L = live.current;
      const reference = opts.reference || captureReference();
      const userMsg = { id: uid('m'), role: 'user', content: text.slice(0, 5000), at: Date.now(), via: opts.via || 'text', ref: refSummary(reference) };

      if (UNDO_RE.test(text)) {
        interrupt({ silent: true });
        appendMessages(userMsg);
        await undo({ announce: true });
        return;
      }
      if (STOP_RE.test(text)) {
        appendMessages(userMsg);
        interrupt();
        return;
      }
      if (L.demo) setDemo(null);
      const chatReady = L.project.id === 'companion' ? L.companion.status === 'connected' : L.health.chat;
      if (!chatReady) {
        appendMessages(userMsg, {
          id: uid('m'),
          role: 'note',
          tone: 'error',
          at: Date.now(),
          content:
            L.project.id === 'companion'
              ? 'The companion is not connected, so Ground cannot reach your project. Open Setup to connect it.'
              : L.health.status === 'error'
                ? `Ground can’t reach the server: ${L.health.message} Your page is unchanged.`
                : 'Ground’s AI is not configured on this server yet (missing provider key). You can still explore, undo, and run the scripted demo.',
        });
        return;
      }
      if (turnRef.current) {
        if (opts.via === 'voice') {
          queueRef.current = { text, opts: { ...opts, reference } };
          setQueued(text);
          return;
        }
        interrupt({ silent: true });
      }

      tour.cancel(false);
      player.stop();
      const controller = new AbortController();
      const id = uid('turn');
      const projectAtStart = L.project.id;
      turnRef.current = { id, controller };
      setTurn({ phase: 'thinking', startedAt: Date.now() });
      appendMessages(userMsg);

      const history = toApiMessages([...L.session.messages, userMsg], L.session.versions);
      const curVersion = currentOf(L.session);
      const selection = reference.selection ? { ...reference.selection, locked: true } : reference.hover ? { ...reference.hover, locked: false } : null;
      const context = {
        selection,
        hover: reference.hover,
        hoverTrail: reference.trail,
        elements: store.elements,
        pageTitle: store.getSnapshot().title || L.project.name,
        html: '',
      };
      const payload = { messages: history, context, mode: L.settings.mode, language: opts.language || L.settings.language };

      try {
        let result;
        if (projectAtStart === 'companion') {
          context.html = (await requestSnapshot()).slice(0, 100000);
          result = await companionApi.chat(L.settings.companionUrl, L.settings.companionToken, payload, controller.signal);
        } else {
          context.html = curVersion.html;
          result = await api.chat(payload, controller.signal);
        }
        if (turnRef.current?.id !== id || live.current.project.id !== projectAtStart) return;
        await handleResult(result, { id, projectAtStart, parent: curVersion, language: payload.language });
      } catch (e) {
        if (isAbort(e) || turnRef.current?.id !== id) return;
        appendMessages({ id: uid('m'), role: 'note', tone: 'error', at: Date.now(), content: e.message || 'Something went wrong. Your page is unchanged.', retry: { text, via: opts.via || 'text' } });
      } finally {
        finishTurn(id);
      }
    },
    // handleResult is defined below and read through a ref to avoid a dependency cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appendMessages, captureReference, finishTurn, interrupt, player, requestSnapshot, store, tour, undo],
  );
  runTurnRef.current = sendTurn;

  const handleResultRef = useRef(null);
  async function handleResult(result, ctx) {
    return handleResultRef.current(result, ctx);
  }

  handleResultRef.current = async (result, { id, projectAtStart, parent, language }) => {
    const action = ['none', 'point', 'clarify', 'edit'].includes(result?.action) ? result.action : 'none';
    const reply = String(result?.reply || '').trim() || 'Done.';
    const changes = Array.isArray(result?.changes) ? result.changes.filter((c) => c && typeof c === 'object').slice(0, 8) : [];
    const rawTargets = Array.isArray(result?.targets) ? result.targets.filter((t) => t && typeof t === 'object').slice(0, 6) : [];
    let versionId = null;
    let editError = '';
    const generation = store.getSnapshot().generation;

    if (action === 'edit') {
      if (projectAtStart === 'companion') {
        const v = {
          id: String(result.versionId || uid('v')),
          html: typeof result.html === 'string' && /<html[\s>]/i.test(result.html) ? result.html.slice(0, 380000) : '',
          summary: clip(result.summary || 'Source updated', 80),
          intent: String(result.intent || ''),
          createdAt: Date.now(),
          parentId: parent.id,
          status: 'pending',
          origin: 'companion',
          changes: changes.map((c) => ({ id: String(c.id || ''), description: String(c.description || '') })),
          sourceChanges: Array.isArray(result.sourceChanges) ? result.sourceChanges.slice(0, 12) : [],
          provider: String(result.provider || 'Claude Code'),
        };
        versionId = v.id;
        commitVersion(v);
        setPreviewNonce((n) => n + 1);
      } else if (typeof result.html === 'string' && result.html.trim()) {
        try {
          const html = prepareDocument(result.html, { sanitize: true });
          const v = {
            id: String(result.versionId || uid('v')),
            html,
            summary: clip(result.summary || 'Design refinement', 80),
            intent: String(result.intent || ''),
            createdAt: Date.now(),
            parentId: parent.id,
            status: 'pending',
            origin: 'ai',
            changes: changes.map((c) => ({ id: String(c.id || ''), description: String(c.description || '') })),
            sourceChanges: [],
            provider: String(result.provider || ''),
          };
          versionId = v.id;
          commitVersion(v);
        } catch (e) {
          editError = `The generated page could not be used (${e.message}). Your current version is unchanged.`;
        }
      } else {
        editError = 'Ground described an edit but no page was returned. Your current version is unchanged.';
      }
    }

    if (versionId) {
      setTurn((t) => ({ ...t, phase: 'applying' }));
      await store.waitForReady(generation, 6000);
    }
    if (turnRef.current?.id !== id) return;

    const elements = store.elements;
    const labelFor = (cid) => rawTargets.find((t) => t.id === cid)?.label;
    const wanted =
      action === 'edit' && versionId
        ? [...changes.map((c) => ({ id: c.id, label: labelFor(c.id) || clip(c.description, 42) })), ...rawTargets]
        : action === 'point' || action === 'clarify'
          ? rawTargets
          : rawTargets.slice(0, 2);
    const targets = resolveTargets(wanted, elements).slice(0, 5);

    const msg = {
      id: uid('m'),
      role: 'assistant',
      content: reply,
      at: Date.now(),
      action: editError ? 'none' : action,
      targets: targets.map((t) => ({ id: t.id, label: clip(t.label, 80) })),
      versionId,
      provider: String(result?.provider || ''),
    };
    appendMessages(msg);
    if (editError) note(editError, 'error');

    const { call: c, settings: st } = live.current;
    const wantVoice = c.active ? !c.speakerMuted : st.readAloud;
    const tone = action === 'clarify' ? 'clarify' : action === 'edit' && versionId ? 'change' : 'point';
    if (targets.length) tour.start(targets, { reply, tone, expectAudio: wantVoice });
    if (wantVoice) {
      // Speech runs outside the turn so the conversation is free while Ground talks (barge-in works).
      speakText(reply, { messageId: msg.id, language, onStart: (d) => tour.syncToAudio(d) }).then((outcome) => {
        if (outcome !== 'ended' && outcome !== 'stopped') tour.audioUnavailable();
      });
    }
  };

  /* ---------- voice call ---------- */
  const transcribeAndSend = useCallback(
    async (blob, filename, reference) => {
      const { health: h, companion: comp, settings: st } = live.current;
      const viaCompanion = !h.voice && comp.status === 'connected' && comp.info?.voice;
      const ctrl = new AbortController();
      transcribeCtrls.current.add(ctrl);
      setTranscribing((n) => n + 1);
      try {
        const r = viaCompanion ? await api.transcribe(blob, filename, ctrl.signal, companionApi.normalizeBase(st.companionUrl), st.companionToken) : await api.transcribe(blob, filename, ctrl.signal);
        const text = String(r?.transcript || '').trim();
        if (!text) {
          toast('I didn’t catch that. Try again a little closer to the mic.', 'info', 3000);
          return;
        }
        if (STOP_RE.test(text)) {
          interrupt();
          return;
        }
        const language = /^hi/i.test(String(r.language_code || '')) ? 'hi-IN' : undefined;
        await runTurnRef.current(text, { via: 'voice', reference, language });
      } catch (e) {
        if (!isAbort(e)) note(`Transcription failed: ${e.message}`, 'error');
      } finally {
        transcribeCtrls.current.delete(ctrl);
        setTranscribing((n) => Math.max(0, n - 1));
      }
    },
    [interrupt, note, toast],
  );

  const startCall = useCallback(async () => {
    const support = voiceSupport();
    if (!support.ok) {
      setCall((c) => ({ ...c, error: support.reason }));
      toast(support.reason, 'error');
      return;
    }
    const { health: h, companion: comp } = live.current;
    if (!h.voice && !(comp.status === 'connected' && comp.info?.voice)) {
      const reason = h.status === 'error' ? 'The voice service is unreachable right now.' : 'Voice is not configured on this server yet.';
      setCall((c) => ({ ...c, error: reason }));
      toast(reason, 'error');
      return;
    }
    if (voiceRef.current) return;
    setCall((c) => ({ ...c, connecting: true, error: '' }));
    const vs = new VoiceSession({
      onState: (state) => setCall((c) => ({ ...c, state })),
      onLevel: (level) => {
        for (const fn of levelListeners.current) fn(level);
      },
      onSpeechStart: (segmentId) => {
        utterRefs.current.set(segmentId, captureReference());
        if (player.playing) {
          player.stop();
          speakCtrlRef.current?.abort();
        }
      },
      onUtterance: (blob, meta) => {
        let reference = utterRefs.current.get(meta.segmentId) || captureReference();
        utterRefs.current.delete(meta.segmentId);
        if (!reference.selection && !reference.hover) {
          const later = captureReference();
          if (later.hover) reference = { ...reference, hover: later.hover };
        }
        transcribeAndSend(blob, meta.filename, reference);
      },
      onError: (e) => {
        toast(micErrorMessage(e), 'error', 7000);
      },
    });
    voiceRef.current = vs;
    try {
      await vs.start({ handsFree: live.current.settings.handsFree });
      vs.setPlayback(player.playing);
      setCall({ active: true, connecting: false, state: vs.state, muted: false, speakerMuted: false, error: '' });
    } catch (e) {
      vs.stop();
      voiceRef.current = null;
      const message = micErrorMessage(e);
      setCall({ active: false, connecting: false, state: 'off', muted: false, speakerMuted: false, error: message });
      toast(message, 'error', 8000);
    }
  }, [captureReference, player, toast, transcribeAndSend]);

  const endCall = useCallback(() => {
    voiceRef.current?.stop();
    voiceRef.current = null;
    utterRefs.current.clear();
    player.stop();
    speakCtrlRef.current?.abort();
    for (const controller of transcribeCtrls.current) controller.abort();
    transcribeCtrls.current.clear();
    setCall((c) => ({ ...c, active: false, connecting: false, state: 'off', muted: false }));
  }, [player]);

  useEffect(() => () => voiceRef.current?.stop(), []);

  const callControls = useMemo(
    () => ({
      start: startCall,
      end: endCall,
      toggleMute: () => {
        const vs = voiceRef.current;
        if (!vs) return;
        const muted = !vs.muted;
        vs.setMuted(muted);
        setCall((c) => ({ ...c, muted }));
      },
      toggleSpeaker: () => {
        const muting = !live.current.call.speakerMuted;
        if (muting) {
          player.stop();
          speakCtrlRef.current?.abort();
        }
        setCall((c) => ({ ...c, speakerMuted: muting }));
      },
      setHandsFree: (on) => {
        updateSettings({ handsFree: on });
        voiceRef.current?.setHandsFree(on);
      },
      talk: () => {
        const vs = voiceRef.current;
        if (!vs) return;
        if (vs.handsFree) {
          if (!vs.finishManual()) toast('Nothing to send yet. Start speaking first.', 'info', 2400);
        } else if (vs.manualActive) {
          if (!vs.finishManual()) toast('That recording was silent, so nothing was sent.', 'info', 2600);
        } else {
          vs.beginManual();
        }
      },
      subscribeLevel: (fn) => {
        levelListeners.current.add(fn);
        return () => levelListeners.current.delete(fn);
      },
    }),
    [endCall, player, startCall, toast, updateSettings],
  );

  /* ---------- projects ---------- */
  const switchProject = useCallback(
    (id) => {
      const next = projectById(id);
      if (!next || id === live.current.project.id) return;
      interrupt({ silent: true });
      setDemo(null);
      saveSession(live.current.session);
      store.reset();
      store.trail.length = 0;
      setSession(loadOrCreate(next));
      setProjectId(id);
      updateSettings({ projectId: id });
      setPanel(null);
    },
    [interrupt, store, updateSettings],
  );

  const resetProject = useCallback(() => {
    setConfirm({
      title: `Reset ${project.name}?`,
      body: 'This clears the conversation and every version for this project on this device. Export first if you want to keep anything.',
      confirmLabel: 'Reset project',
      onConfirm: () => {
        interrupt({ silent: true });
        setDemo(null);
        clearSession(project.id);
        store.reset();
        setSession(freshSession(project));
        toast('Project reset to its original version.', 'success');
      },
    });
  }, [interrupt, project, store, toast]);

  /* ---------- companion ---------- */
  const connectCompanion = useCallback(
    async ({ switchTo = true, quiet = false } = {}) => {
      const st = live.current.settings;
      setCompanion((c) => ({ ...c, status: 'connecting', error: '' }));
      try {
        const info = await companionApi.health(st.companionUrl, st.companionToken);
        if (!info?.ok) throw new Error('The companion did not report a healthy state.');
        if (!info.previewUrl) throw new Error('The companion did not provide a preview URL.');
        setCompanion({ status: 'connected', info, error: '' });
        if (switchTo) switchProject('companion');
        if (!quiet) toast(`Connected to ${typeof info.project === 'string' ? info.project : info.project?.name || 'your project'}.`, 'success');
        return true;
      } catch (e) {
        const message =
          e.status === 401
            ? 'The pairing token was rejected. Copy the token printed in the companion terminal.'
            : e.status === 403
              ? e.message
              : `${e.message} Is the companion running at ${st.companionUrl}?`;
        setCompanion((c) => ({ ...c, status: 'error', error: message }));
        return false;
      }
    },
    [switchProject, toast],
  );

  const disconnectCompanion = useCallback(() => {
    setCompanion({ status: 'disconnected', info: null, error: '' });
    if (live.current.project.id === 'companion') switchProject(SAMPLE_PROJECTS[0].id);
  }, [switchProject]);

  // Real reconnect on load when the last project was the companion; poll while connected.
  useEffect(() => {
    if (projectId === 'companion' && companion.status === 'disconnected') connectCompanion({ switchTo: false, quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (companion.status !== 'connected') return;
    const t = setInterval(async () => {
      const st = live.current.settings;
      try {
        const info = await companionApi.health(st.companionUrl, st.companionToken);
        setCompanion((c) => (c.status === 'connected' ? { ...c, info } : c));
      } catch (e) {
        setCompanion((c) => ({ ...c, status: 'error', error: `Lost the companion connection: ${e.message}` }));
      }
    }, 15000);
    return () => clearInterval(t);
  }, [companion.status]);

  /* ---------- preview source ---------- */
  const srcDoc = useMemo(() => (current.html && !isCompanion ? buildSrcDoc(current.html) : ''), [current.html, isCompanion]);
  const companionSrc = isCompanion && companion.status === 'connected' ? companion.info?.previewUrl : '';
  useEffect(() => {
    try {
      previewOriginRef.current = companionSrc ? new URL(companionSrc).origin : '*';
    } catch {
      previewOriginRef.current = '*';
    }
  }, [companionSrc]);
  useEffect(() => {
    store.set({ ready: false });
  }, [srcDoc, companionSrc, previewNonce, store]);

  /* ---------- selection tools ---------- */
  const selectElement = useCallback((id, reveal = false) => sendToPreview({ type: 'cg:select', id: id || null, reveal }), [sendToPreview]);
  const pointAt = useCallback(
    (targets, tone = 'point') => {
      tour.start(targets, { reply: '', tone, expectAudio: false });
    },
    [tour],
  );

  /* ---------- scripted demo ---------- */
  const startDemo = useCallback(() => {
    setWelcome(false);
    updateSettings({ welcomeSeen: true });
    interrupt({ silent: true });
    if (live.current.project.id !== 'saltmarsh') switchProject('saltmarsh');
    setPanel(null);
    setDemo({ index: -1, playing: true, startedAt: Date.now() });
  }, [interrupt, switchProject, updateSettings]);

  const demoDriver = useMemo(
    () => ({
      say: (role, content, extra = {}) => {
        const msg = { id: uid('m'), role, content, at: Date.now(), scripted: true, via: 'text' };
        if (extra.ref) msg.ref = { id: extra.ref, label: 'Find a place to stay where the days run slow.', kind: 'Heading', tag: 'h1', locked: !!extra.locked };
        if (extra.action) msg.action = extra.action;
        if (extra.targets) msg.targets = extra.targets;
        appendMessages(msg);
      },
      simulateHover: (id, label) => sendToPreview({ type: 'cg:simulate-hover', id, label }),
      select: (id) => selectElement(id),
      point: (targets, tone, reply) => tour.start(targets, { reply, tone, expectAudio: false }),
      applyEdit: (mutate, { summary, reply, changes }) => {
        const s = live.current.session;
        const parent = currentOf(s);
        const html = transformDocument(parent.html, mutate);
        const v = { id: uid('v'), html, summary: `Demo · ${summary}`, intent: '', createdAt: Date.now(), parentId: parent.id, status: 'pending', origin: 'demo', changes, sourceChanges: [], provider: 'Scripted demo' };
        commitVersion(v);
        appendMessages({ id: uid('m'), role: 'assistant', content: reply, at: Date.now(), scripted: true, action: 'edit', versionId: v.id, targets: changes.map((c) => ({ id: c.id, label: clip(c.description, 60) })) });
      },
    }),
    [appendMessages, commitVersion, selectElement, sendToPreview, tour],
  );

  useEffect(() => {
    if (!demo || demo.index < 0) return;
    const step = DEMO_STEPS[demo.index];
    if (!step) return;
    step.run(demoDriver);
    // Runs exactly once per step index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo?.index]);

  useEffect(() => {
    if (!demo) return;
    if (demo.index < 0) {
      // Wait for the sample preview to be ready before the first step.
      if (!bridge.ready) return;
      const t = setTimeout(() => setDemo((d) => (d ? { ...d, index: 0 } : d)), 500);
      return () => clearTimeout(t);
    }
    const step = DEMO_STEPS[demo.index];
    if (!demo.playing || !step || step.final) return;
    const t = setTimeout(() => setDemo((d) => (d && d.index === demo.index ? { ...d, index: d.index + 1 } : d)), step.wait);
    return () => clearTimeout(t);
  }, [demo, bridge.ready]);

  const demoControls = useMemo(
    () => ({
      next: () => setDemo((d) => (d && d.index < DEMO_STEPS.length - 1 ? { ...d, index: d.index + 1 } : d)),
      toggle: () => setDemo((d) => (d ? { ...d, playing: !d.playing } : d)),
      exit: () => {
        setDemo(null);
        sendToPreview({ type: 'cg:simulate-hover', id: null });
        tour.cancel();
      },
    }),
    [sendToPreview, tour],
  );

  /* ---------- keyboard ---------- */
  handleKeyRef.current = ({ key, meta, shift, fromPreview }) => {
    if (key === 'Escape') {
      if (live.current.turn.phase !== 'idle' || player.playing) interrupt();
      else if (store.getSnapshot().selection && !fromPreview) selectElement(null);
      return true;
    }
    if (key === '/' && !meta) {
      composerRef.current?.focus();
      return true;
    }
    if ((key === 'z' || key === 'Z') && meta && !shift) {
      undo();
      return true;
    }
    return false;
  };
  useEffect(() => {
    function onKey(e) {
      if (welcome || confirm) return;
      const t = e.target;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (typing && e.key !== 'Escape') return;
      if (handleKeyRef.current({ key: e.key, meta: e.metaKey || e.ctrlKey, shift: e.shiftKey })) {
        if (e.key !== 'Escape') e.preventDefault();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [welcome, confirm]);

  /* ---------- derived ---------- */
  const busy = turn.phase !== 'idle';
  const pending = current.status === 'pending' ? current : null;
  const versionIndex = session.versions.findIndex((v) => v.id === current.id) + 1;
  const chatAvailable = isCompanion ? companion.status === 'connected' : health.chat;
  const voiceAvailable = health.voice || (companion.status === 'connected' && !!companion.info?.voice);

  const enterStudio = useCallback(() => {
    setWelcome(false);
    updateSettings({ welcomeSeen: true });
  }, [updateSettings]);

  const exportProject = isCompanion ? { ...COMPANION_PROJECT, name: companion.info?.project ? String(companion.info.project) : COMPANION_PROJECT.name } : project;

  return (
    <div className="app">
      <TopBar
        project={exportProject}
        projects={SAMPLE_PROJECTS}
        companion={companion}
        onSwitch={switchProject}
        onConnect={() => setPanel('setup')}
        health={health}
        onRetryHealth={checkHealth}
        versionIndex={versionIndex}
        version={current}
        versionCount={session.versions.length}
        panel={panel}
        onPanel={(p) => setPanel((cur) => (cur === p ? null : p))}
        onDemo={startDemo}
        onHome={() => setWelcome(true)}
        demoActive={!!demo}
      />

      <main className="studio">
        <section className="stage-col" aria-label="Shared preview">
          {demo && <TourBanner step={Math.max(0, demo.index)} total={DEMO_STEPS.length} caption={DEMO_STEPS[Math.max(0, demo.index)]?.caption} playing={demo.playing} controls={demoControls} final={!!DEMO_STEPS[demo.index]?.final} waiting={demo.index < 0} />}
          <PreviewStage
            iframeRef={iframeRef}
            srcDoc={srcDoc}
            companionSrc={companionSrc}
            previewNonce={previewNonce}
            isCompanion={isCompanion}
            companion={companion}
            onOpenSetup={() => setPanel('setup')}
            onReload={() => setPreviewNonce((n) => n + 1)}
            bridge={bridge}
            store={store}
            reviewMode={reviewMode}
            onReviewMode={setReviewMode}
            onSelect={selectElement}
            pointing={pointing}
            hintsVisible={!settings.hintsDismissed && !demo}
            onDismissHints={() => updateSettings({ hintsDismissed: true })}
            projectName={exportProject.name}
          >
            {pending && (
              <ActionBar
                version={pending}
                index={versionIndex}
                onKeep={keep}
                onUndo={() => undo()}
                onRefine={() => {
                  setComposerSeed({ text: 'Refine: ', at: Date.now() });
                }}
                onShowChanges={() => setPanel('source')}
                onTour={() => {
                  const t = resolveTargets(pending.changes.map((c) => ({ id: c.id, label: clip(c.description, 42) })), store.elements);
                  if (t.length) pointAt(t, 'change');
                  else toast('Ground could not find the changed elements on the page.', 'info');
                }}
              />
            )}
            <CallDock
              call={call}
              controls={callControls}
              handsFree={settings.handsFree}
              available={voiceAvailable}
              healthStatus={health.status}
              transcribing={transcribing > 0}
              thinking={busy}
              speaking={speaking}
              queued={queued}
              onInterrupt={() => interrupt()}
            />
          </PreviewStage>
        </section>

        <Conversation
          messages={session.messages}
          versions={session.versions}
          currentVersionId={session.currentVersionId}
          project={exportProject}
          turn={turn}
          transcribing={transcribing > 0}
          speakingMessageId={speakingMessageId}
          chatAvailable={chatAvailable}
          health={health}
          isCompanion={isCompanion}
          companion={companion}
          onSend={(text) => sendTurn(text, { via: 'text' })}
          onRetry={(m) => sendTurn(m.retry.text, { via: m.retry.via })}
          onInterrupt={() => interrupt()}
          onListen={listen}
          voiceAvailable={voiceAvailable}
          onSelectRef={(id) => selectElement(id, true)}
          onPointTargets={(targets, tone) => pointAt(targets, tone)}
          onOpenVersion={(id) => {
            restore(id);
            setPanel('source');
          }}
          onDemo={startDemo}
          onStartCall={startCall}
          onOpenSetup={() => setPanel('setup')}
          onReset={resetProject}
          settings={settings}
          updateSettings={updateSettings}
          bridge={bridge}
          store={store}
          onClearSelection={() => selectElement(null)}
          composerRef={composerRef}
          composerSeed={composerSeed}
          busy={busy}
          callActive={call.active}
          session={session}
        />
      </main>

      {panel === 'source' && <SourceDrawer session={session} project={exportProject} current={current} onClose={() => setPanel(null)} toast={toast} onRestore={restore} />}
      {panel === 'history' && <HistoryPanel session={session} onClose={() => setPanel(null)} onRestore={restore} onUndo={() => undo()} onShowSource={() => setPanel('source')} onReset={resetProject} project={exportProject} toast={toast} />}
      {panel === 'setup' && (
        <SetupPanel
          settings={settings}
          updateSettings={updateSettings}
          companion={companion}
          onConnect={() => connectCompanion({ switchTo: true })}
          onDisconnect={disconnectCompanion}
          onOpenProject={() => switchProject('companion')}
          isCompanion={isCompanion}
          health={health}
          onRetryHealth={checkHealth}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'help' && <HelpPanel onClose={() => setPanel(null)} onDemo={startDemo} onWelcome={() => setWelcome(true)} />}

      {welcome && <Welcome onEnter={enterStudio} onDemo={startDemo} health={health} />}
      {confirm && <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
      <div className="sr-only" aria-live="polite">
        {pointing?.target ? `Ground is pointing at ${describeElement({ kind: pointing.target.kind, label: pointing.target.label })}` : ''}
      </div>
    </div>
  );
}
