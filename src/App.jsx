import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Plus,
  Code2,
  Columns2,
  Navigation,
  ImagePlus,
  Globe,
} from 'lucide-react';
import TopBar from './components/TopBar.jsx';
import Welcome from './components/Welcome.jsx';
import PreviewStage from './components/PreviewStage.jsx';
import Conversation from './components/Conversation.jsx';
import VoiceRoom from './components/VoiceRoom.jsx';
import ActionBar from './components/ActionBar.jsx';
import SourceDrawer from './components/SourceDrawer.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';
import SetupPanel from './components/SetupPanel.jsx';
import HelpPanel from './components/HelpPanel.jsx';
import TourBanner from './components/TourBanner.jsx';
import PageEditor from './components/PageEditor.jsx';
import CompareView from './components/CompareView.jsx';
import TaskRail from './components/TaskRail.jsx';
import {
  addTask,
  updateTask,
  taskTitle,
  nextQueuedTask,
  inputLane,
  taskCommand,
} from './lib/tasks.js';
import Processing, {
  Walkthrough,
  InterruptedWork,
  PendingClarification,
} from './components/Processing.jsx';
import AssetsPanel from './components/AssetsPanel.jsx';
import PublishPanel from './components/PublishPanel.jsx';
import { ConfirmDialog, Toasts, Sheet } from './components/Feedback.jsx';
import {
  SAMPLE_PROJECTS,
  COMPANION_PROJECT,
  projectById,
} from './samples/index.js';
import {
  loadSettings,
  saveSettings,
  loadSession,
  saveSession,
  clearSession,
} from './lib/storage.js';
import { api, companionApi, isAbort } from './lib/api.js';
import { prepareDocument, buildSrcDoc, transformDocument } from './lib/html.js';
import { createBridgeStore } from './lib/bridgeStore.js';
import { PointerTour, resolveTargets } from './lib/tour.js';
import { VoiceSession, voiceSupport, micErrorMessage } from './lib/voice.js';
import { SpeechPlayer } from './lib/player.js';
import { SpeechQueue } from './lib/speechQueue.js';
import { conversationLanguage, spokenUI } from './lib/conversationLanguage.js';
import { DEMO_STEPS } from './lib/demo.js';
import {
  uid,
  clip,
  UNDO_RE,
  STOP_RE,
  KEEP_RE,
  commandReply,
  describeElement,
} from './lib/util.js';
import { loadProjects, saveProjects, blankHTML } from './lib/projects.js';
import { changedTargets, pageTour, comparisonChoice } from './lib/changes.js';
import {
  classifyWorkUtterance,
  hasPageContent,
  isCreationRequest,
  continueCreation,
  recoverableBuild,
  workReply,
} from './lib/workConversation.js';

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
  return {
    projectId: project.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    versions: [base],
    messages: [],
    tasks: [],
    queuePaused: false,
    currentVersionId: base.id,
  };
}

function loadOrCreate(project) {
  return loadSession(project.id) || freshSession(project);
}

const currentOf = (s) =>
  s.versions.find((v) => v.id === s.currentVersionId) || s.versions[0];

function refSummary(ref) {
  const el = ref?.selection || ref?.hover;
  if (!el?.id) return null;
  return {
    id: el.id,
    label: el.label || el.text || '',
    kind: el.kind || '',
    tag: el.tag || '',
    locked: !!ref.selection,
  };
}

function toApiMessages(messages, versions) {
  const summaries = new Map(versions.map((v) => [v.id, v]));
  return messages
    .filter(
      (m) =>
        (m.role === 'user' || m.role === 'assistant') &&
        !m.scripted &&
        !m.progress &&
        !m.error &&
        m.content.trim(),
    )
    .slice(-16)
    .map((m) => {
      let content = m.content;
      if (m.role === 'user' && m.ref)
        content += `\n[pointing at ${m.ref.id}${m.ref.label ? ` "${clip(m.ref.label, 50)}"` : ''}${m.ref.locked ? ', locked selection' : ''}]`;
      if (m.role === 'assistant' && m.versionId) {
        const v = summaries.get(m.versionId);
        if (v)
          content += `\n[applied edit: ${v.summary}${v.status === 'undone' ? ' — later undone by the user' : ''}]`;
      }
      return { role: m.role, content };
    });
}

function cleanElement(el) {
  if (!el || typeof el !== 'object' || typeof el.id !== 'string') return null;
  const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const rect =
    el.rect && typeof el.rect === 'object'
      ? {
          x: +el.rect.x || 0,
          y: +el.rect.y || 0,
          width: +el.rect.width || 0,
          height: +el.rect.height || 0,
        }
      : undefined;
  return {
    id: s(el.id, 120),
    tag: s(el.tag, 30),
    kind: s(el.kind, 30),
    label: s(el.label, 120),
    text: s(el.text, 200),
    selector: s(el.selector, 240),
    parentId:
      typeof el.parentId === 'string' ? el.parentId.slice(0, 120) : null,
    childId: typeof el.childId === 'string' ? el.childId.slice(0, 120) : null,
    rect,
    styles: el.styles && typeof el.styles === 'object' ? el.styles : undefined,
  };
}

/* ---------------- app ---------------- */

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const updateSettings = useCallback(
    (patch) => setSettings((s) => ({ ...s, ...patch })),
    [],
  );
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const [welcome, setWelcome] = useState(() => !settings.welcomeSeen);
  const [customProjects, setCustomProjects] = useState(loadProjects);
  const projects = [...customProjects, ...SAMPLE_PROJECTS];
  const findProject = (id) =>
    projects.find((p) => p.id === id) || projectById(id);
  const [health, setHealth] = useState({
    status: 'checking',
    chat: false,
    voice: false,
    provider: '',
  });
  const [projectId, setProjectId] = useState(() =>
    findProject(settings.projectId)
      ? settings.projectId
      : SAMPLE_PROJECTS[0].id,
  );
  const project = findProject(projectId) || SAMPLE_PROJECTS[0];
  const isCompanion = project.id === 'companion';
  const [session, setSession] = useState(() => loadOrCreate(project));
  const [panel, setPanel] = useState(null); // 'source' | 'history' | 'setup' | 'help'
  const [turn, setTurn] = useState({ phase: 'idle', startedAt: 0 });
  const [transcribing, setTranscribing] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [discussion, setDiscussion] = useState({ pending: 0, question: '' });
  const [call, setCall] = useState({
    active: false,
    connecting: false,
    state: 'off',
    muted: false,
    speakerMuted: false,
    error: '',
  });
  const [companion, setCompanion] = useState({
    status: 'disconnected',
    info: null,
    error: '',
  });
  const [previewNonce, setPreviewNonce] = useState(0);
  const [reviewMode, setReviewMode] = useState(true);
  const [pointing, setPointing] = useState(null);
  const [demo, setDemo] = useState(null); // {index, playing}
  const [toasts, setToasts] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [composerSeed, setComposerSeed] = useState(null);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const [detectedLanguage, setDetectedLanguage] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [compareMode, setCompareMode] = useState(false);
  const [editorMode, setEditorMode] = useState('edit');
  const [pendingCreation, setPendingCreation] = useState(null);
  const [walkthrough, setWalkthrough] = useState(null);
  const [assets, setAssets] = useState(() => {
    try {
      const values = JSON.parse(
        localStorage.getItem('commonground:images') || '[]',
      );
      return Array.isArray(values)
        ? values
            .filter(
              (a) =>
                a && typeof a.url === 'string' && a.url.startsWith('https://'),
            )
            .slice(-24)
        : [];
    } catch {
      return [];
    }
  });
  const [selectedAsset, setSelectedAsset] = useState(null);
  useEffect(() => {
    try {
      localStorage.setItem('commonground:images', JSON.stringify(assets));
    } catch {}
  }, [assets]);

  const store = useMemo(() => createBridgeStore(), []);
  const bridge = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const iframeRef = useRef(null);
  const previewOriginRef = useRef('*');
  const player = useMemo(() => new SpeechPlayer(), []);
  const voiceRef = useRef(null);
  const turnRef = useRef(null);
  const speechQueue = useMemo(() => new SpeechQueue(player), [player]);
  const transcribeCtrls = useRef(new Set());
  const utterRefs = useRef(new Map());
  const discussionJobs = useRef(new Map());
  const voiceEpoch = useRef(0);
  const lastVoiceCutAt = useRef(0);
  const speechOwner = useRef(null);
  const alive = useRef(true);
  const snapshotWaiters = useRef(new Map());
  const levelListeners = useRef(new Set());
  const composerRef = useRef(null);
  const blockedToastAt = useRef(0);
  const chooseComparisonRef = useRef(null);
  const taskActionRef = useRef(null);
  const walkRef = useRef(null);
  const progressVoiceAt = useRef(0);
  const toastTimers = useRef(new Set());

  const current = currentOf(session);
  const recoverable = useMemo(() => recoverableBuild(session), [session]);
  const voiceProfile = useMemo(
    () =>
      conversationLanguage(
        session.messages,
        session.voiceStyle || detectedLanguage,
      ),
    [session.messages, session.voiceStyle, detectedLanguage],
  );

  // Latest values for callbacks that outlive a render (voice handlers, timers, async turns).
  const live = useRef(null);
  useLayoutEffect(() => {
    live.current = {
      session,
      settings,
      health,
      project,
      companion,
      call,
      turn,
      reviewMode,
      demo,
      current,
      comparison,
      compareMode,
      walkthrough,
      assets,
      selectedAsset,
      voiceProfile,
      transcribing,
    };
    walkRef.current = walkthrough;
  });

  /* ---------- toasts ---------- */
  const toast = useCallback((message, tone = 'info', ms = 4200) => {
    const id = uid('t');
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    if (ms) {
      const timer = setTimeout(() => {
        toastTimers.current.delete(timer);
        setToasts((t) => t.filter((x) => x.id !== id));
      }, ms);
      toastTimers.current.add(timer);
    }
  }, []);
  const dismissToast = useCallback(
    (id) => setToasts((t) => t.filter((x) => x.id !== id)),
    [],
  );

  /* ---------- preview messaging ---------- */
  const sendToPreview = useCallback((msg) => {
    const w = iframeRef.current?.contentWindow;
    if (w) w.postMessage(msg, previewOriginRef.current || '*');
  }, []);

  const tour = useMemo(
    () =>
      new PointerTour(
        (msg) => sendToPreview(msg),
        (step) => setPointing(step),
      ),
    [sendToPreview],
  );
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      tour.cancel(false);
      player.stop();
      turnRef.current?.controller.abort();
      turnRef.current = null;
      for (const q of discussionJobs.current.values()) q.controller.abort();
      discussionJobs.current.clear();
      speechQueue.cancel();
      for (const timer of toastTimers.current) clearTimeout(timer);
      toastTimers.current.clear();
    };
  }, [tour, player]);
  const stopWalkthrough = useCallback(
    ({ preserveSpeech = false } = {}) => {
      walkRef.current = null;
      setWalkthrough(null);
      tour.cancel();
      if (!preserveSpeech) speechQueue.cancel();
    },
    [player, tour, speechQueue],
  );

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
        toast(
          'Browser storage is full, so the latest versions may not survive a refresh. Export the session to keep a copy.',
          'error',
          8000,
        );
      }
    }, 350);
    return () => clearTimeout(t);
  }, [session, toast]);

  /* ---------- health ---------- */
  const checkHealth = useCallback(async () => {
    setHealth((h) => ({ ...h, status: 'checking' }));
    try {
      const r = await api.health();
      setHealth({
        status: 'ok',
        chat: !!r.chat,
        voice: !!r.voice,
        provider: r.provider || '',
        companionHost: !!r.companion,
        message: r.chat ? '' : 'AI keys are not configured on this server.',
      });
    } catch (e) {
      setHealth({
        status: 'error',
        chat: false,
        voice: false,
        provider: '',
        message: e.message || 'The server is unreachable.',
      });
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
    setSession((s) => ({
      ...s,
      messages: [...s.messages, ...msgs].slice(-240),
    }));
  }, []);
  const patchTask = useCallback(
    (id, patch) =>
      setSession((s) => ({
        ...s,
        tasks: updateTask(s.tasks || [], id, patch),
      })),
    [],
  );
  const patchMessage = useCallback((id, patch) => {
    setSession((s) => ({
      ...s,
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }));
  }, []);
  const note = useCallback(
    (content, tone = 'info', extra = {}) =>
      appendMessages({
        id: uid('m'),
        role: 'note',
        content,
        at: Date.now(),
        tone,
        ...extra,
      }),
    [appendMessages],
  );

  const commitVersion = useCallback(
    (v, { activate = true } = {}) => {
      if (live.current.session.versions.some((x) => x.id === v.id))
        v.id = uid('v');
      if (activate) store.set({ ready: false });
      const manual = !v.taskId && v.origin !== 'demo';
      if (manual) v.taskId = uid('task');
      setSession((s) => {
        const canActivate =
          activate && (!v.parentId || s.currentVersionId === v.parentId);
        return {
          ...s,
          versions: [
            ...s.versions.map((x) =>
              canActivate && x.status === 'pending'
                ? { ...x, status: 'kept' }
                : x,
            ),
            v,
          ],
          currentVersionId: canActivate ? v.id : s.currentVersionId,
          tasks: manual
            ? addTask(s.tasks || [], {
                id: v.taskId,
                seq: Math.max(0, ...(s.tasks || []).map((t) => t.seq)) + 1,
                title: v.summary,
                request: v.intent || v.summary,
                kind: 'manual',
                state: 'ready',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                finishedAt: Date.now(),
                resultVersionId: v.id,
                applied: canActivate,
                attempt: 1,
              })
            : updateTask(s.tasks || [], v.taskId, {
                resultVersionId: v.id,
                applied: canActivate,
              }),
        };
      });
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
      .map((t) => ({
        id: t.id,
        kind: t.kind,
        tag: t.tag,
        label: clip(t.label, 60),
        secondsAgo: Math.round((now - t.at) / 100) / 10,
        dwellMs: t.dwellMs,
      }));
    return {
      selection: snap.selection,
      hover: store.hover,
      trail,
      capturedAt: now,
    };
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
      if (
        !d ||
        typeof d !== 'object' ||
        typeof d.type !== 'string' ||
        !d.type.startsWith('cg:')
      )
        return;
      switch (d.type) {
        case 'cg:ready': {
          const elements = Array.isArray(d.elements)
            ? d.elements.map(cleanElement).filter(Boolean)
            : [];
          store.markReady({
            title: String(d.title || '').slice(0, 200),
            elements,
            count: Number(d.count) || elements.length,
            url: String(d.url || ''),
          });
          sendToPreview({
            type: 'cg:config',
            review: live.current?.reviewMode !== false,
          });
          const sel = store.getSnapshot().selection;
          if (sel) sendToPreview({ type: 'cg:select', id: sel.id });
          break;
        }
        case 'cg:elements':
          store.setElements(
            Array.isArray(d.elements)
              ? d.elements.map(cleanElement).filter(Boolean)
              : [],
          );
          break;
        case 'cg:hover':
          store.recordHover(
            cleanElement(d.element),
            Number(d.at) || Date.now(),
          );
          break;
        case 'cg:select': {
          const el = cleanElement(d.element);
          store.set({ selection: el });
          if (
            el &&
            d.origin === 'user' &&
            !live.current.settings.hintsDismissed
          )
            updateSettings({ hintsDismissed: true });
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
          handleKeyRef.current?.({
            key: d.key,
            meta: !!d.meta,
            shift: !!d.shift,
            fromPreview: true,
          });
          break;
        case 'cg:blocked':
          if (Date.now() - blockedToastAt.current > 6000) {
            blockedToastAt.current = Date.now();
            toast(
              live.current.reviewMode
                ? 'Review mode is on: clicks select elements instead of following links.'
                : 'Navigation is paused inside the preview so your review stays put.',
            );
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
    ({ silent = false, scope = 'all' } = {}) => {
      const active = turnRef.current;
      const hadTurn = !!active;
      if (active?.work) active.work.state = 'cancelled';
      if (active)
        setSession((s) =>
          s.work?.id === active.id
            ? {
                ...s,
                work: { ...s.work, state: 'cancelled', finishedAt: Date.now() },
                tasks: updateTask(s.tasks || [], active.work?.taskId, {
                  state: 'cancelled',
                  finishedAt: Date.now(),
                }),
                queuePaused: true,
              }
            : s,
        );
      turnRef.current?.controller.abort();
      turnRef.current = null;
      const wasSpeaking = player.playing;
      if (scope === 'all') {
        voiceEpoch.current++;
        speechQueue.cancel();
        for (const q of discussionJobs.current.values()) q.controller.abort();
        discussionJobs.current.clear();
        setDiscussion({ pending: 0, question: '' });
        for (const c of transcribeCtrls.current) c.abort();
        transcribeCtrls.current.clear();
        stopWalkthrough();
      } else if (
        speechOwner.current?.kind === 'task' &&
        speechOwner.current.id === active?.id
      )
        player.stop();
      tour.cancel();
      setTurn({ phase: 'idle', startedAt: 0 });
      if (!silent && (hadTurn || wasSpeaking))
        note(
          hadTurn
            ? 'You interrupted Ground. Your latest preview is still available.'
            : 'Stopped Ground’s voice.',
          'info',
        );
    },
    [player, tour, note, stopWalkthrough],
  );

  /* ---------- speech ---------- */
  const speakText = useCallback(
    async (
      text,
      {
        messageId,
        onStart,
        language,
        kind = 'reply',
        isCurrent,
        owner,
        afterQuestions = false,
      } = {},
    ) => {
      const {
        health: h,
        settings: st,
        companion: comp,
        voiceProfile: profile,
      } = live.current;
      const projectAtSpeech = live.current.project.id,
        voiceAtSpeech = voiceEpoch.current;
      const clipOwner =
        owner ||
        (turnRef.current ? { kind: 'task', id: turnRef.current.id } : null);
      const viaCompanion =
        !h.voice && comp.status === 'connected' && comp.info?.voice;
      if (!h.voice && !viaCompanion) return 'unavailable';
      try {
        if (afterQuestions)
          while (discussionJobs.current.size && alive.current)
            await Promise.allSettled(
              [...discussionJobs.current.values()].map((q) => q.done),
            );
        if (
          !alive.current ||
          voiceAtSpeech !== voiceEpoch.current ||
          live.current.project.id !== projectAtSpeech ||
          (afterQuestions &&
            !live.current.call.active &&
            !live.current.settings.readAloud)
        )
          return 'cancelled';
        const result = await speechQueue.enqueue(
          (signal) =>
            viaCompanion
              ? api.speak(
                  text.slice(0, 2000),
                  language || profile.style,
                  signal,
                  companionApi.normalizeBase(st.companionUrl),
                  st.companionToken,
                )
              : api.speak(
                  text.slice(0, 2000),
                  language || profile.style,
                  signal,
                ),
          {
            kind,
            isCurrent,
            beforePlay: async (signal) => {
              while (
                !signal.aborted &&
                alive.current &&
                (['hearing', 'recording'].includes(voiceRef.current?.state) ||
                  live.current.transcribing > 0)
              )
                await new Promise((resolve) => setTimeout(resolve, 60));
            },
            onStart: (duration) => {
              speechOwner.current = clipOwner;
              setSpeakingMessageId(messageId || null);
              onStart?.(duration);
            },
          },
        );
        if (result === 'blocked')
          toast(
            'Your browser blocked audio playback. Press Listen on the reply to hear it.',
            'info',
            6000,
          );
        return result;
      } catch (e) {
        if (isAbort(e)) return 'cancelled';
        toast(`Voice reply unavailable: ${e.message}`, 'error');
        return 'error';
      }
    },
    [player, speechQueue, toast],
  );

  const stopVoice = useCallback(() => {
    lastVoiceCutAt.current = Date.now();
    voiceEpoch.current++;
    speechQueue.cancel();
    for (const q of discussionJobs.current.values()) q.controller.abort();
    discussionJobs.current.clear();
    setDiscussion({ pending: 0, question: '' });
  }, [speechQueue]);
  const stopForeground = useCallback(() => {
    if (player.playing || speechQueue.busy || discussionJobs.current.size)
      stopVoice();
    else if (turnRef.current) interrupt({ scope: 'work' });
  }, [player, speechQueue, stopVoice, interrupt]);
  const listen = useCallback(
    (message) => {
      if (speakingMessageId === message.id) {
        player.stop();
        speechQueue.cancel();
        return;
      }
      speechQueue.cancel();
      speakText(message.content, {
        messageId: message.id,
        language: message.language,
      });
    },
    [player, speakText, speakingMessageId],
  );

  useEffect(() => {
    if (turn.phase === 'idle' || !call.active || call.speakerMuted) return;
    const timer = setInterval(() => {
      const t = live.current.turn,
        c = live.current.call;
      if (
        t.phase !== 'building' ||
        turnRef.current?.speechInterrupted ||
        discussionJobs.current.size > 0 ||
        Date.now() - t.startedAt < 10000 ||
        Date.now() - progressVoiceAt.current < 14000 ||
        player.playing ||
        speechQueue.busy ||
        voiceRef.current?.state === 'hearing' ||
        !c.active ||
        c.speakerMuted
      )
        return;
      const language = live.current.voiceProfile.style;
      if (!['en-IN', 'hi-IN', 'hinglish'].includes(language)) return;
      progressVoiceAt.current = Date.now();
      const content = spokenUI('progress', language);
      appendMessages({
        id: uid('m'),
        role: 'assistant',
        content,
        at: Date.now(),
        language,
        local: true,
        progress: true,
      });
      const progressJobId = turnRef.current?.id;
      speakText(content, {
        language,
        kind: 'progress',
        isCurrent: () =>
          turnRef.current?.id === progressJobId &&
          live.current.turn.phase === 'building',
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [
    turn.phase,
    call.active,
    call.speakerMuted,
    detectedLanguage,
    appendMessages,
    speakText,
    player,
  ]);

  const startWalkthrough = useCallback(
    (
      targets,
      { mode = 'page', language = 'auto', preserveSpeech = false } = {},
    ) => {
      stopWalkthrough({ preserveSpeech });
      if (!targets.length) {
        toast('No visible sections are available for a tour yet.');
        return;
      }
      setWalkthrough({
        id: uid('walk'),
        targets: targets.slice(0, 7),
        index: 0,
        playing: true,
        mode,
        language,
      });
    },
    [stopWalkthrough, toast],
  );
  useEffect(() => {
    const w = walkthrough;
    if (!w || !w.playing) return;
    let valid = true,
      timer;
    const target = w.targets[w.index];
    const content = target.description || target.label;
    tour.start([target], {
      reply: content,
      tone: w.mode === 'changes' ? 'change' : 'point',
      expectAudio: call.active && !call.speakerMuted,
    });
    const msg = {
      id: uid('m'),
      role: 'assistant',
      content,
      language: w.language,
      at: Date.now(),
      targets: [target],
      local: true,
    };
    appendMessages(msg);
    const next = () => {
      if (valid && walkRef.current?.id === w.id)
        timer = setTimeout(
          () =>
            setWalkthrough((x) =>
              x?.id === w.id
                ? x.index + 1 < x.targets.length
                  ? { ...x, index: x.index + 1 }
                  : null
                : x,
            ),
          350,
        );
    };
    if (call.active && !call.speakerMuted)
      speakText(content, {
        messageId: msg.id,
        language: w.language,
        onStart: (d) => tour.syncToAudio(d),
      }).then((outcome) => {
        if (outcome === 'stopped' || outcome === 'cancelled') return;
        next();
      });
    else timer = setTimeout(next, Math.max(2200, content.length * 28));
    return () => {
      valid = false;
      clearTimeout(timer);
    };
  }, [
    walkthrough,
    appendMessages,
    call.active,
    call.speakerMuted,
    speakText,
    tour,
  ]);

  /* ---------- versions: keep / undo / restore ---------- */
  const versionNumber = useCallback(
    (id) => live.current.session.versions.findIndex((v) => v.id === id) + 1,
    [],
  );

  const undo = useCallback(
    async ({ announce = false, language } = {}) => {
      const style = language || live.current.voiceProfile.style;
      const s = live.current.session;
      const cur = currentOf(s);
      if (!cur.parentId) {
        toast('Nothing to undo. You are on the original version.');
        if (announce)
          appendMessages({
            id: uid('m'),
            role: 'assistant',
            content: spokenUI('nothingUndo', style),
            at: Date.now(),
            local: true,
          });
        return false;
      }
      if (cur.origin === 'companion') {
        const { settings: st } = live.current;
        try {
          await companionApi.undo(st.companionUrl, st.companionToken);
          setPreviewNonce((n) => n + 1);
        } catch (e) {
          toast(
            `The companion could not restore your files: ${e.message}`,
            'error',
            7000,
          );
          return false;
        }
      }
      tour.cancel();
      store.set({ ready: false });
      setSession((x) => ({
        ...x,
        versions: x.versions.map((v) =>
          v.id === cur.id ? { ...v, status: 'undone' } : v,
        ),
        currentVersionId: cur.parentId,
      }));
      const n = s.versions.findIndex((v) => v.id === cur.parentId) + 1;
      if (announce)
        appendMessages({
          id: uid('m'),
          role: 'assistant',
          content: commandReply('undo', style),
          language: style,
          at: Date.now(),
          local: true,
        });
      else
        toast(`Undone “${clip(cur.summary, 40)}”. Back on v${n}.`, 'success');
      return true;
    },
    [appendMessages, store, toast, tour],
  );

  const keep = useCallback(
    (versionId) => {
      const cur =
        typeof versionId === 'string'
          ? live.current.session.versions.find((v) => v.id === versionId)
          : currentOf(live.current.session);
      if (!cur) return;
      setSession((x) => ({
        ...x,
        versions: x.versions.map((v) =>
          v.id === cur.id ? { ...v, status: 'kept' } : v,
        ),
      }));
      toast(`Kept “${clip(cur.summary, 40)}”.`, 'success', 2600);
    },
    [toast],
  );

  const restore = useCallback(
    (id) => {
      const s = live.current.session;
      if (id === s.currentVersionId) return;
      const target = s.versions.find((v) => v.id === id);
      if (!target) return;
      if (live.current.project.id === 'companion') {
        toast(
          'Your local files change through Claude Code, so earlier versions can’t be restored from here. Use Undo for the latest edit.',
          'info',
          6000,
        );
        return;
      }
      tour.cancel();
      store.set({ ready: false });
      setSession((x) => ({
        ...x,
        versions: x.versions.map((v) =>
          v.id === id && v.status === 'undone' ? { ...v, status: 'kept' } : v,
        ),
        currentVersionId: id,
      }));
      toast(
        `Showing v${s.versions.indexOf(target) + 1} · ${clip(target.summary, 40)}`,
        'success',
        2600,
      );
    },
    [store, toast, tour],
  );

  /* ---------- the conversational turn ---------- */
  const runTurnRef = useRef(null);

  const finishTurn = useCallback((id) => {
    if (turnRef.current?.id !== id) return;
    turnRef.current = null;
    setTurn({ phase: 'idle', startedAt: 0 });
  }, []);

  const enqueueWork = useCallback(
    (text, opts, reference, profile, userMsg) => {
      const L = live.current,
        existing = (L.session.tasks || []).find((t) => t.id === opts.taskId),
        id = opts.taskId || uid('task');
      const kind =
        existing?.kind ||
        (opts.task === 'create' ||
        (!turnRef.current &&
          !hasPageContent(L.current.html) &&
          isCreationRequest(text))
          ? 'create'
          : (opts.compare ?? L.compareMode)
            ? 'compare'
            : 'edit');
      const request = opts.requestOverride || existing?.request || text;
      setSession((s) => ({
        ...s,
        queuePaused: opts.taskId ? false : s.queuePaused,
        tasks: addTask(s.tasks || [], {
          ...existing,
          id,
          seq:
            existing?.seq ||
            Math.max(0, ...(s.tasks || []).map((t) => t.seq)) + 1,
          title: opts.title || existing?.title || taskTitle(text),
          request,
          kind,
          state: 'queued',
          question: '',
          error: '',
          createdAt: existing?.createdAt || Date.now(),
          updatedAt: Date.now(),
          attempt: existing?.attempt || 0,
          target:
            opts.retarget && (reference.selection || reference.hover)
              ? refSummary(reference)
              : existing?.target || refSummary(reference),
          sourceMessageId: userMsg.id,
          via: opts.via || 'text',
        }),
      }));
      if (opts.messageLogged)
        patchMessage(userMsg.id, { taskId: id, lane: 'work' });
      else appendMessages({ ...userMsg, taskId: id, lane: 'work' });
      return id;
    },
    [appendMessages, patchMessage],
  );

  const resumeWork = useCallback(() => {
    const L = live.current;
    if (turnRef.current) return;
    const task =
      (L.session.tasks || []).find(
        (t) =>
          t.id === L.session.work?.taskId &&
          ['failed', 'interrupted', 'cancelled'].includes(t.state),
      ) ||
      [...(L.session.tasks || [])]
        .reverse()
        .find((t) => ['failed', 'interrupted'].includes(t.state));
    const old = recoverableBuild(L.session);
    if (task)
      runTurnRef.current?.(task.request, {
        taskId: task.id,
        forceWork: true,
        via: 'resume',
        task: task.kind === 'create' ? 'create' : 'edit',
        compare: task.kind === 'compare',
      });
    else if (old)
      runTurnRef.current?.(old.request, {
        forceWork: true,
        task: old.task,
        via: 'resume',
      });
    else setSession((s) => ({ ...s, queuePaused: false }));
  }, []);

  const answerQuestion = useCallback(
    async (text, opts, reference, profile, userMsg) => {
      const L = live.current,
        projectAtStart = L.project.id,
        epoch = voiceEpoch.current,
        controller = new AbortController(),
        qid = uid('question');
      if (turnRef.current) turnRef.current.speechInterrupted = false;
      let resolveDone;
      const done = new Promise((resolve) => (resolveDone = resolve));
      discussionJobs.current.set(qid, { controller, done, question: text });
      setDiscussion({ pending: discussionJobs.current.size, question: text });
      appendMessages({ ...userMsg, lane: 'conversation' });
      try {
        const st = L.settings,
          viaCompanion = !L.health.chat && L.companion.status === 'connected';
        const result = await api.discuss(
          {
            messages: toApiMessages(
              [...L.session.messages, userMsg],
              L.session.versions,
            ),
            context: {
              selection: reference.selection,
              hover: reference.hover,
              elements: store.elements,
              pageTitle: store.getSnapshot().title || L.project.name,
            },
            tasks: (L.session.tasks || []).map(({ seq, title, state }) => ({
              seq,
              title,
              state,
            })),
            language: profile.language,
            voiceStyle: profile.style,
          },
          controller.signal,
          viaCompanion ? companionApi.normalizeBase(st.companionUrl) : '',
          viaCompanion ? st.companionToken : '',
        );
        if (
          controller.signal.aborted ||
          live.current.project.id !== projectAtStart
        )
          return;
        if (result.route === 'task') {
          enqueueWork(
            text,
            {
              ...opts,
              messageLogged: true,
              forceWork: true,
              compare: result.kind === 'compare',
              title: result.summary,
              requestOverride: result.intent
                ? `${text}\nRequested direction: ${result.intent}`
                : text,
            },
            reference,
            profile,
            userMsg,
          );
          const content =
            profile.style === 'hinglish'
              ? 'यह task जोड़ दिया है. बाकी work अपनी जगह चलता रहेगा.'
              : 'Added that as a task. The work continues independently.';
          appendMessages({
            id: uid('m'),
            role: 'assistant',
            content,
            at: Date.now(),
            language: profile.style,
            local: true,
            progress: true,
          });
          if (live.current.call.active && !live.current.call.speakerMuted)
            speakText(content, {
              language: profile.style,
              owner: { kind: 'question', id: qid },
              onStart: (d) => tour.syncToAudio(d),
              isCurrent: () => voiceEpoch.current === epoch,
            });
        } else {
          const mid = uid('m');
          const answerTargets =
            live.current.current.id === L.current.id
              ? resolveTargets(result.targets || [], store.elements)
              : [];
          if (answerTargets.length)
            tour.start(answerTargets, {
              reply: result.reply,
              tone: 'point',
              expectAudio: L.call.active && !L.call.speakerMuted,
            });
          const reply =
            live.current.current.id !== L.current.id
              ? `${profile.style === 'hinglish' ? 'आपने जिस preview पर पूछा था, उसके लिए:' : 'For the preview you were looking at:'} ${result.reply}`
              : result.reply;
          appendMessages({
            id: mid,
            role: 'assistant',
            content: reply,
            at: Date.now(),
            language: result.voiceStyle || profile.style,
            action: result.route === 'clarify' ? 'clarify' : 'none',
            lane: 'conversation',
            local: true,
          });
          if (live.current.call.active && !live.current.call.speakerMuted)
            speakText(reply, {
              messageId: mid,
              language: result.voiceStyle || profile.style,
              owner: { kind: 'question', id: qid },
              isCurrent: () =>
                voiceEpoch.current === epoch &&
                live.current.project.id === projectAtStart,
            });
        }
      } catch (error) {
        if (!isAbort(error) && live.current.project.id === projectAtStart) {
          const content =
            profile.style === 'hinglish'
              ? turnRef.current
                ? 'इस question का जवाब अभी नहीं आ पाया. Page वाला task चलता रहेगा.'
                : 'इस question का जवाब अभी नहीं आ पाया. आपकी page unchanged है.'
              : turnRef.current
                ? 'I couldn’t answer that question. Your page task is still running.'
                : 'I couldn’t answer that question right now. Your page is unchanged.';
          appendMessages({
            id: uid('m'),
            role: 'assistant',
            content,
            at: Date.now(),
            lane: 'conversation',
            language: profile.style,
            local: true,
          });
          if (L.call.active && !L.call.speakerMuted)
            speakText(content, {
              language: profile.style,
              isCurrent: () => voiceEpoch.current === epoch,
            });
        }
      } finally {
        discussionJobs.current.delete(qid);
        resolveDone();
        const pending = [...discussionJobs.current.values()];
        setDiscussion({
          pending: pending.length,
          question: pending.at(-1)?.question || '',
        });
      }
    },
    [appendMessages, enqueueWork, speakText, store],
  );

  const sendTurn = useCallback(
    async (rawText, opts = {}) => {
      const text = String(rawText || '')
        .trim()
        .slice(0, 5000);
      if (!text) return;
      const L = live.current;
      const executingTask = opts.executeTaskId
        ? (L.session.tasks || []).find((t) => t.id === opts.executeTaskId)
        : null;
      if (
        opts.executeTaskId &&
        (!executingTask || executingTask.state !== 'queued')
      )
        return;
      if (walkRef.current) stopWalkthrough();
      const reference = opts.reference || captureReference();
      const userMsg = {
        id: uid('m'),
        role: 'user',
        content: text.slice(0, 5000),
        at: Date.now(),
        via: opts.via || 'text',
        ref: refSummary(reference),
      };
      const profile = executingTask
        ? L.voiceProfile
        : conversationLanguage(
            [...L.session.messages, userMsg],
            L.voiceProfile.style || opts.language || L.settings.language,
          );
      const language = profile.style;
      userMsg.language = language;
      if (!executingTask) {
        setSession((s) => ({ ...s, voiceStyle: language }));
        setDetectedLanguage(language);
      }
      if (!executingTask) {
        const taskControl = taskCommand(text);
        if (taskControl) {
          appendMessages(userMsg);
          if (taskControl.action === 'continue') {
            taskActionRef.current?.(null, 'continue');
            return;
          }
          const target = (L.session.tasks || []).find(
            (t) => t.seq === taskControl.seq,
          );
          if (target) taskActionRef.current?.(target, taskControl.action);
          else {
            const content = `I can’t find task ${taskControl.seq} in this page.`;
            appendMessages({
              id: uid('m'),
              role: 'assistant',
              content,
              at: Date.now(),
              local: true,
            });
            if (L.call.active && !L.call.speakerMuted)
              speakText(content, { language });
          }
          return;
        }
        const active = turnRef.current;
        const conversationalIntent = classifyWorkUtterance(text);
        const recovery = recoverableBuild(L.session);
        const respondAboutWork = (kind) => {
          const content = workReply(kind, {
            active: !!active,
            work: active?.work || recovery || L.session.work,
            turn: active
              ? {
                  phase: active.stage || L.turn.phase,
                  lastProgressAt: active.lastProgressAt,
                  startedAt: active.startedAt,
                }
              : L.turn,
            hasPage:
              hasPageContent(L.current.html) ||
              (L.project.id === 'companion' &&
                L.companion.status === 'connected'),
            language,
          });
          if (active) active.speechInterrupted = false;
          appendMessages(userMsg, {
            id: uid('m'),
            role: 'assistant',
            content,
            at: Date.now(),
            language,
            local: true,
            progress: !!active,
          });
          if (L.call.active && !L.call.speakerMuted)
            speakText(content, {
              language,
              kind: 'status',
              isCurrent: () =>
                active ? turnRef.current?.id === active.id : !turnRef.current,
            });
        };
        const lastConversationReply = [...L.session.messages]
          .reverse()
          .find((m) => m.role === 'assistant' && !m.progress);
        const acknowledgesAProposal =
          L.session.work?.awaitingClarification ||
          lastConversationReply?.action === 'clarify';
        const acceptsAnActualVersion =
          KEEP_RE.test(text) &&
          L.current.status === 'pending' &&
          !acknowledgesAProposal;
        if (
          conversationalIntent === 'status' ||
          (!active &&
            conversationalIntent === 'acknowledge' &&
            !acceptsAnActualVersion &&
            !acknowledgesAProposal) ||
          (!active && conversationalIntent === 'resume' && !recovery) ||
          (active &&
            ['acknowledge', 'resume'].includes(conversationalIntent)) ||
          (!active && recovery && conversationalIntent === 'acknowledge')
        ) {
          respondAboutWork(conversationalIntent);
          return;
        }
        if (conversationalIntent === 'resume' && recovery && !active) {
          appendMessages(userMsg);
          resumeWork();
          return;
        }
        if (conversationalIntent === 'silence') {
          if (active) active.speechInterrupted = true;
          stopVoice();
          appendMessages(userMsg);
          return;
        }
        if (conversationalIntent === 'cancel') {
          appendMessages(userMsg);
          if (
            /^(?:stop|ruko|ruk jao|bas|रुको|बस)[.! ]*$/i.test(text) &&
            (reference.interruptedVoice ||
              player.playing ||
              speechQueue.busy ||
              discussionJobs.current.size ||
              Date.now() - lastVoiceCutAt.current < 8000)
          )
            stopVoice();
          else if (!active) {
            const waiting = (L.session.tasks || []).find((t) =>
              ['needs_detail', 'needs_choice'].includes(t.state),
            );
            if (waiting) taskActionRef.current?.(waiting, 'cancel');
            else interrupt({ scope: 'work' });
          } else interrupt({ scope: 'work' });
          return;
        }
        const pendingDetail = (L.session.tasks || []).find(
          (t) => t.state === 'needs_detail',
        );
        const explicitQuestion =
          /^(?:what|why|which|how|where|when|explain|tell me|kya|kyun|kaun|kaisa|क्यों|क्या|कौन|कैसे)(?:\s|$)/i.test(
            text,
          ) || /[?？]$/.test(text);
        if (
          pendingDetail &&
          !opts.taskId &&
          !explicitQuestion &&
          inputLane(text) !== 'work' &&
          !UNDO_RE.test(text)
        ) {
          enqueueWork(
            text,
            {
              ...opts,
              taskId: pendingDetail.id,
              requestOverride: continueCreation(pendingDetail.request, text),
              retarget: true,
              forceWork: true,
            },
            reference,
            profile,
            userMsg,
          );
          return;
        }
        if (
          /^(?:please )?(?:give me (?:a |the )?tour|tour (?:the |this )?(?:page|website)|walk me through (?:the |this )?(?:page|website)|(?:page|website) ka tour (?:do|dikhao))[.! ]*$/i.test(
            text,
          )
        ) {
          appendMessages({ ...userMsg, lane: 'conversation' });
          startWalkthrough(pageTour(store.elements, language), { language });
          return;
        }
        if (
          /^(?:please )?(?:end (?:the |this )?call|hang up|leave (?:the )?call|call band (?:kar do|karo))[.! ]*$/i.test(
            text,
          )
        ) {
          appendMessages({ ...userMsg, lane: 'conversation' });
          endCall();
          return;
        }
        if (
          !opts.forceWork &&
          !opts.task &&
          !opts.taskId &&
          !UNDO_RE.test(text) &&
          !(L.comparison && comparisonChoice(text) !== null) &&
          !(KEEP_RE.test(text) && L.current.status === 'pending') &&
          inputLane(text) === 'conversation'
        ) {
          answerQuestion(text, opts, reference, profile, userMsg);
          return;
        }
        if (
          KEEP_RE.test(text) &&
          L.current.status === 'pending' &&
          (!acknowledgesAProposal || /^keep\b/i.test(text))
        ) {
          appendMessages({ ...userMsg, taskId: L.current.taskId });
          keep(L.current.id);
          if (active) active.speechInterrupted = false;
          const content = commandReply('keep', language);
          appendMessages({
            id: uid('m'),
            role: 'assistant',
            content,
            at: Date.now(),
            language,
            local: true,
          });
          if (L.call.active && !L.call.speakerMuted)
            speakText(content, { language });
          return;
        }
        if (active && !UNDO_RE.test(text)) {
          active.speechInterrupted = false;
          if (
            (L.session.tasks || []).filter((t) => t.state === 'queued')
              .length >= 8
          ) {
            const content =
              'Eight changes are waiting. Let me finish those before adding another.';
            appendMessages({
              id: uid('m'),
              role: 'assistant',
              content,
              at: Date.now(),
              local: true,
              progress: true,
            });
            return;
          }
          enqueueWork(text, opts, reference, profile, userMsg);
          const content = workReply('revision', { active: true, language });
          appendMessages({
            id: uid('m'),
            role: 'assistant',
            content,
            at: Date.now(),
            language,
            local: true,
            progress: true,
          });
          if (L.call.active && !L.call.speakerMuted)
            speakText(content, { language });
          return;
        }
        if (L.comparison) {
          const choice = comparisonChoice(text);
          if (choice !== null) {
            appendMessages(userMsg);
            await chooseComparisonRef.current?.(choice);
            return;
          }
          if (
            /^(cancel|neither|keep the original|original|undo)[.! ]*$/i.test(
              text,
            )
          ) {
            patchTask(L.comparison.taskId, {
              state: 'cancelled',
              finishedAt: Date.now(),
            });
            setComparison(null);
            appendMessages(userMsg);
            toast('Comparison closed. The original page is still here.');
            return;
          }
        }

        if (UNDO_RE.test(text)) {
          if (!active) interrupt({ silent: true });
          else active.speechInterrupted = false;
          appendMessages(userMsg);
          const didUndo = await undo({ announce: true, language });
          if (L.call.active && !L.call.speakerMuted)
            speakText(
              didUndo
                ? commandReply('undo', language)
                : spokenUI('nothingUndo', language),
              {
                language,
              },
            );
          return;
        }
        const lastReply = [...L.session.messages]
          .reverse()
          .find((m) => m.role === 'assistant');
        if (
          KEEP_RE.test(text) &&
          currentOf(L.session).status === 'pending' &&
          lastReply?.action !== 'clarify'
        ) {
          interrupt({ silent: true });
          appendMessages(userMsg);
          keep();
          const reply = commandReply('keep', language);
          appendMessages({
            id: uid('m'),
            role: 'assistant',
            content: reply,
            at: Date.now(),
            local: true,
          });
          if (L.call.active && !L.call.speakerMuted)
            speakText(reply, { language });
          return;
        }
        if (STOP_RE.test(text)) {
          appendMessages(userMsg);
          interrupt();
          return;
        }
        if (L.demo) setDemo(null);
        const chatReady =
          L.project.id === 'companion'
            ? L.companion.status === 'connected'
            : L.health.chat;
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

        enqueueWork(text, opts, reference, profile, userMsg);
        return;
      }

      tour.cancel(false);
      player.setVolume(1);
      const controller = new AbortController();
      const id = uid('turn');
      const projectAtStart = L.project.id;
      const metric =
        opts.via === 'voice'
          ? {
              id,
              speechEndedAt: opts.speechEndedAt,
              transcribedAt: opts.transcribedAt,
              requestAt: Date.now(),
            }
          : null;

      let earlyReply = '';

      turnRef.current = {
        id,
        controller,
        startedAt: Date.now(),
        stage: 'understanding',
      };
      progressVoiceAt.current = Date.now();
      setTurn({
        phase: 'thinking',
        label: 'Understanding your request',
        startedAt: Date.now(),
        characters: 0,
      });
      const recorded = executingTask?.sourceMessageId;
      const boundary = recorded
        ? L.session.messages.findIndex((m) => m.id === recorded)
        : -1;
      const workMessages =
        boundary >= 0
          ? L.session.messages.slice(0, boundary + 1)
          : [...L.session.messages, userMsg];
      const history = toApiMessages(workMessages, L.session.versions);
      const curVersion = currentOf(L.session);
      const fullCreationRequest = text;
      if (history.length)
        history[history.length - 1] = { ...history.at(-1), content: text };
      const selection = reference.selection
        ? { ...reference.selection, locked: true }
        : reference.hover
          ? { ...reference.hover, locked: false }
          : null;
      const context = {
        selection,
        hover: reference.hover,
        hoverTrail: reference.trail,
        elements: store.elements,
        pageTitle: store.getSnapshot().title || L.project.name,
        html: '',
        assets: L.assets.map((a) => ({
          ...a,
          selected: a.id === L.selectedAsset,
        })),
      };
      const payload = {
        messages: history,
        context,
        mode: L.settings.mode,
        language: profile.language,
        voiceStyle: profile.style,
        compare:
          projectAtStart !== 'companion' && (opts.compare ?? L.compareMode),
        task:
          opts.task || (executingTask?.kind === 'create' ? 'create' : 'edit'),
      };
      const work = {
        id,
        taskId: executingTask?.id,
        request: fullCreationRequest,
        task: payload.task,
        target: refSummary(reference),
        state: 'running',
        startedAt: turnRef.current.startedAt,
        stage: 'understanding',
        followups: (L.session.tasks || [])
          .filter((t) => t.state === 'queued' && t.id !== executingTask?.id)
          .map((t) => t.request),
      };
      turnRef.current.work = work;
      setSession((s) => ({
        ...s,
        work,
        tasks: updateTask(s.tasks || [], executingTask?.id, {
          state: 'running',
          startedAt: Date.now(),
          attempt: (executingTask?.attempt || 0) + 1,
          baseVersionId: curVersion.id,
          runId: id,
          error: '',
        }),
      }));
      const beforeElements = store.elements.map((e) => ({
        ...e,
        styles: { ...e.styles },
      }));

      try {
        let result;
        if (projectAtStart === 'companion') {
          context.html = (await requestSnapshot()).slice(0, 100000);
          result = await companionApi.chat(
            L.settings.companionUrl,
            L.settings.companionToken,
            payload,
            controller.signal,
          );
        } else {
          context.html = curVersion.html;
          let lastProgress = 0;
          result = await api.chat(payload, controller.signal, (event) => {
            if (turnRef.current?.id !== id) return;
            if (event.type === 'reply') {
              if (metric) metric.firstReplyAt ??= Date.now();
              setTurn((t) => ({ ...t, reply: event.text }));
            }
            if (event.type === 'reply_ready') {
              const read =
                live.current.call.active &&
                !live.current.call.speakerMuted &&
                !turnRef.current?.speechInterrupted;
              if (metric) metric.replyReadyAt = Date.now();
              if (read && !earlyReply) {
                earlyReply = event.reply;
                if (metric) metric.ttsRequestedAt = Date.now();
                speakText(event.reply, {
                  language,
                  afterQuestions: true,
                  isCurrent: () => work.state !== 'cancelled',
                  onStart: (duration) => {
                    if (metric && !metric.firstAudioAt) {
                      metric.firstAudioAt = Date.now();
                      if (metric.speechEndedAt)
                        metric.speechEndToAudioMs =
                          metric.firstAudioAt - metric.speechEndedAt;
                      if (live.current.project.id === projectAtStart)
                        setSession((s) => ({
                          ...s,
                          voiceMetrics: [
                            ...(s.voiceMetrics || []),
                            { ...metric },
                          ].slice(-40),
                        }));
                    }
                    tour.syncToAudio(duration);
                  },
                });
              }
            }
            if (event.type === 'stage') {
              turnRef.current.stage = event.stage;
              turnRef.current.lastProgressAt = Date.now();
              setSession((s) =>
                s.work?.id === id
                  ? { ...s, work: { ...s.work, stage: event.stage } }
                  : s,
              );
              setTurn((t) => ({
                ...t,
                phase:
                  event.stage === 'understanding' ? 'thinking' : event.stage,
                label: event.label,
              }));
            }
            if (event.type === 'code' && Date.now() - lastProgress > 120) {
              lastProgress = Date.now();
              turnRef.current.lastProgressAt = Date.now();
              setTurn((t) => ({
                ...t,
                characters: Math.max(t.characters || 0, event.characters),
              }));
            }
            if (event.type === 'variant')
              setTurn((t) => ({
                ...t,
                variantsReady: (t.variantsReady || 0) + 1,
              }));
            if (event.type === 'intent') {
              const targets = resolveTargets(
                event.targets || [],
                store.elements,
              );
              const read =
                live.current.call.active &&
                !live.current.call.speakerMuted &&
                !turnRef.current?.speechInterrupted;
              if (targets.length && !discussionJobs.current.size)
                tour.start(targets, {
                  reply: event.reply,
                  tone: 'point',
                  expectAudio: read,
                });
              if (read && !earlyReply)
                speakText(event.reply, {
                  language,
                  isCurrent: () => work.state !== 'cancelled',
                  onStart: (d) => tour.syncToAudio(d),
                });
            }
          });
        }
        if (
          turnRef.current?.id !== id ||
          live.current.project.id !== projectAtStart
        )
          return;
        const outcome = await handleResult(result, {
          id,
          projectAtStart,
          parent: curVersion,
          language,
          earlyReply,
          taskId: executingTask?.id,
          beforeElements,
        });
        if (turnRef.current?.id === id && turnRef.current.work)
          turnRef.current.work.state =
            outcome?.outcome ||
            (['edit', 'compare'].includes(result.action)
              ? 'ready'
              : 'answered');
        if (turnRef.current?.id === id)
          setSession((s) =>
            s.work?.id === id
              ? {
                  ...s,
                  work: {
                    ...s.work,
                    awaitingClarification: result.action === 'clarify',
                    question:
                      result.action === 'clarify'
                        ? String(result.reply || '').slice(0, 400)
                        : '',
                    state:
                      outcome?.outcome ||
                      (['edit', 'compare'].includes(result.action)
                        ? 'ready'
                        : 'answered'),
                    error: outcome?.error || '',
                    finishedAt: Date.now(),
                  },
                  tasks: ['none', 'point', 'tour'].includes(result.action)
                    ? (s.tasks || []).filter((t) => t.id !== executingTask?.id)
                    : updateTask(s.tasks || [], executingTask?.id, {
                        state:
                          result.action === 'clarify'
                            ? 'needs_detail'
                            : result.action === 'compare'
                              ? 'needs_choice'
                              : outcome?.outcome === 'failed'
                                ? 'failed'
                                : 'ready',
                        kind:
                          result.action === 'compare'
                            ? 'compare'
                            : executingTask?.kind,
                        question:
                          result.action === 'clarify'
                            ? result.reply
                            : result.action === 'compare'
                              ? 'Choose A or B in the preview.'
                              : '',
                        error: outcome?.error || '',
                        resultVersionId: outcome?.versionId || null,
                        applied: outcome?.applied !== false,
                        title: result.summary || executingTask?.title,
                        finishedAt: Date.now(),
                      }),
                  queuePaused:
                    outcome?.outcome === 'failed' ? true : s.queuePaused,
                }
              : s,
          );
      } catch (e) {
        if (isAbort(e) || turnRef.current?.id !== id) return;
        if (turnRef.current.work) turnRef.current.work.state = 'failed';
        setSession((s) =>
          s.work?.id === id
            ? {
                ...s,
                work: {
                  ...s.work,
                  state: 'failed',
                  error: e.message || 'The build failed.',
                  finishedAt: Date.now(),
                },
                tasks: updateTask(s.tasks || [], executingTask?.id, {
                  state: 'failed',
                  error: e.message || 'The build failed.',
                  finishedAt: Date.now(),
                }),
                queuePaused: true,
              }
            : s,
        );
        appendMessages({
          id: uid('m'),
          role: 'note',
          tone: 'error',
          at: Date.now(),
          content: e.message || 'Something went wrong. Your page is unchanged.',
          retry: { text, via: opts.via || 'text' },
        });
        if (live.current.call.active && !live.current.call.speakerMuted)
          speakText(spokenUI('error', language), { language });
      } finally {
        finishTurn(id);
      }
    },
    // handleResult is defined below and read through a ref to avoid a dependency cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      appendMessages,
      captureReference,
      finishTurn,
      interrupt,
      keep,
      player,
      requestSnapshot,
      speakText,
      store,
      tour,
      undo,
      stopWalkthrough,
    ],
  );
  runTurnRef.current = sendTurn;

  useEffect(() => {
    if (turnRef.current || turn.phase !== 'idle' || !bridge.ready) return;
    const task = nextQueuedTask(
      session.tasks || [],
      session.queuePaused,
      hasPageContent(current.html) || isCompanion,
    );
    if (!task) return;
    const timer = setTimeout(() => {
      const fresh = live.current.session.tasks?.find((t) => t.id === task.id);
      if (
        turnRef.current ||
        live.current.project.id !== projectId ||
        !fresh ||
        fresh.state !== 'queued' ||
        live.current.session.queuePaused ||
        !store.getSnapshot().ready
      )
        return;
      const target = task.target
        ? store.elements.find((e) => e.id === task.target.id)
        : null;
      if (task.target && !target) {
        patchTask(task.id, {
          state: 'needs_detail',
          question:
            'The element you pointed at is no longer on this preview. Point to the right element and tell me which one, or remove this task.',
        });
        return;
      }
      runTurnRef.current?.(task.request, {
        executeTaskId: task.id,
        task: task.kind === 'create' ? 'create' : 'edit',
        compare: task.kind === 'compare',
        via: task.via || 'task',
        reference: {
          selection: target && task.target.locked ? target : null,
          hover: target && !task.target.locked ? target : null,
          trail: [],
        },
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [
    session.tasks,
    session.queuePaused,
    bridge.ready,
    turn.phase,
    current.html,
    isCompanion,
    projectId,
    store,
  ]);

  const handleResultRef = useRef(null);
  async function handleResult(result, ctx) {
    return handleResultRef.current(result, ctx);
  }

  handleResultRef.current = async (
    result,
    {
      id,
      projectAtStart,
      parent,
      language,
      earlyReply = '',
      taskId,
      beforeElements = [],
    },
  ) => {
    const action = [
      'none',
      'point',
      'clarify',
      'edit',
      'compare',
      'tour',
      'keep',
      'undo',
      'stop',
      'end_call',
    ].includes(result?.action)
      ? result.action
      : 'none';
    if (action === 'compare') {
      const variants = (result.variants || []).slice(0, 2).map((v) => ({
        ...v,
        html: prepareDocument(v.html, { sanitize: true }),
      }));
      if (variants.length !== 2)
        throw Error(
          'Two complete directions were not returned. Your original page is unchanged.',
        );
      setComparison({
        variants,
        parent,
        beforeElements,
        language,
        taskId,
        targetId: result.targets?.[0]?.id,
      });
      setCompareMode(false);
      const content = spokenUI('compare', language);
      appendMessages({
        id: uid('m'),
        role: 'assistant',
        content,
        at: Date.now(),
        language,
        local: true,
      });
      if (
        live.current.call.active &&
        !live.current.call.speakerMuted &&
        !turnRef.current?.speechInterrupted
      )
        speakText(content, { language });
      return;
    }
    if (action === 'tour') {
      if (turnRef.current?.speechInterrupted) return;
      const targets = resolveTargets(result.targets || [], store.elements).map(
        (t) => ({
          ...t,
          description:
            result.changes?.find((c) => c.id === t.id)?.description || t.label,
        }),
      );
      startWalkthrough(
        targets.length ? targets : pageTour(store.elements, language),
        {
          language,
          preserveSpeech: true,
        },
      );
      return;
    }
    if (action === 'end_call') {
      const readGoodbye =
        live.current.call.active && !live.current.call.speakerMuted;
      endCall();
      const content = String(
        result.reply || 'The call has ended. Your work is still here.',
      );
      appendMessages({
        id: uid('m'),
        role: 'assistant',
        content,
        language,
        at: Date.now(),
        local: true,
      });
      if (readGoodbye) speakText(content, { language });
      return;
    }
    if (['keep', 'undo', 'stop'].includes(action)) {
      if (
        action === 'keep' &&
        currentOf(live.current.session).status === 'pending'
      )
        keep();
      if (action === 'undo' && !(await undo())) return;
      const content = String(result.reply || commandReply(action, language));
      appendMessages({
        id: uid('m'),
        role: 'assistant',
        content,
        at: Date.now(),
        local: true,
      });
      if (
        live.current.call.active &&
        !live.current.call.speakerMuted &&
        content !== earlyReply
      )
        speakText(content, { language });
      return;
    }
    const reply = String(result?.reply || '').trim() || 'Done.';
    const changes = Array.isArray(result?.changes)
      ? result.changes.filter((c) => c && typeof c === 'object').slice(0, 8)
      : [];
    const rawTargets = Array.isArray(result?.targets)
      ? result.targets.filter((t) => t && typeof t === 'object').slice(0, 6)
      : [];
    let versionId = null;
    let applied = live.current.current.id === parent.id;
    let editError = '';
    const generation = store.getSnapshot().generation;

    if (action === 'edit') {
      if (projectAtStart === 'companion') {
        const v = {
          id: String(result.versionId || uid('v')),
          taskId,
          html:
            typeof result.html === 'string' && /<html[\s>]/i.test(result.html)
              ? result.html.slice(0, 380000)
              : '',
          summary: clip(result.summary || 'Source updated', 80),
          intent: String(result.intent || ''),
          createdAt: Date.now(),
          parentId: parent.id,
          status: 'pending',
          origin: 'companion',
          changes: changes.map((c) => ({
            id: String(c.id || ''),
            description: String(c.description || ''),
          })),
          sourceChanges: Array.isArray(result.sourceChanges)
            ? result.sourceChanges.slice(0, 12)
            : [],
          provider: String(result.provider || 'Claude Code'),
        };
        commitVersion(v, { activate: applied });
        versionId = v.id;
        setPreviewNonce((n) => n + 1);
      } else if (typeof result.html === 'string' && result.html.trim()) {
        try {
          const html = prepareDocument(result.html, { sanitize: true });
          const v = {
            id: String(result.versionId || uid('v')),
            taskId,
            html,
            summary: clip(result.summary || 'Design refinement', 80),
            intent: String(result.intent || ''),
            createdAt: Date.now(),
            parentId: parent.id,
            status: 'pending',
            origin: 'ai',
            changes: changes.map((c) => ({
              id: String(c.id || ''),
              description: String(c.description || ''),
            })),
            sourceChanges: [],
            provider: String(result.provider || ''),
          };
          commitVersion(v, { activate: applied });
          versionId = v.id;
        } catch (e) {
          editError = `The generated page could not be used (${e.message}). Your current version is unchanged.`;
        }
      } else {
        editError =
          'Ground described an edit but no page was returned. Your current version is unchanged.';
      }
    }

    if (versionId && applied) {
      if (turnRef.current?.id === id) turnRef.current.stage = 'applying';
      setTurn((t) => ({ ...t, phase: 'applying' }));
      await store.waitForReady(generation, 6000);
    }
    if (turnRef.current?.id !== id) return;

    if (versionId) applied = live.current.current.id === versionId;
    const elements = store.elements;
    const labelFor = (cid) => rawTargets.find((t) => t.id === cid)?.label;
    const wanted =
      action === 'edit' && versionId
        ? [
            ...changes.map((c) => ({
              id: c.id,
              label: labelFor(c.id) || clip(c.description, 42),
            })),
            ...rawTargets,
          ]
        : action === 'point' || action === 'clarify'
          ? rawTargets
          : rawTargets.slice(0, 2);
    const measured =
      versionId && applied
        ? changedTargets(beforeElements, elements, changes, language)
        : [];
    const targets = versionId
      ? measured.length
        ? measured
        : resolveTargets(wanted, elements)
            .filter((t) => t.id !== 'page')
            .slice(0, 4)
      : resolveTargets(wanted, elements).slice(0, 5);
    const taskNumber = (live.current.session.tasks || []).find(
      (t) => t.id === taskId,
    )?.seq;
    const completionLead = taskNumber
      ? language === 'hinglish'
        ? `Task ${taskNumber} ready है.`
        : language === 'hi-IN'
          ? `काम ${taskNumber} तैयार है।`
          : `Task ${taskNumber} is ready.`
      : spokenUI('complete', language);
    const completion = editError
      ? editError
      : versionId && !applied
        ? language === 'hinglish'
          ? 'Result अलग version में save है, क्योंकि बीच में page बदल गया था. Task से उसे review कर सकते हैं.'
          : 'The result is saved as a separate version because the page changed while I was working. View it from the task list.'
        : versionId
          ? `${completionLead} ${targets
              .slice(0, 2)
              .map((t) => t.description || t.label)
              .join('. ')}`
          : reply;
    if (versionId)
      setSession((s) => ({
        ...s,
        versions: s.versions.map((v) =>
          v.id === versionId
            ? {
                ...v,
                changes: targets.map((t) => ({
                  id: t.id,
                  description: t.description || t.label,
                })),
              }
            : v,
        ),
      }));

    const msg = {
      id: uid('m'),
      role: 'assistant',
      content: completion,
      at: Date.now(),
      action: editError ? 'none' : action,
      taskId,
      targets: targets.map((t) => ({ id: t.id, label: clip(t.label, 80) })),
      versionId,
      provider: String(result?.provider || ''),
      language,
    };
    appendMessages(msg);
    if (editError) note(editError, 'error');

    const { call: c, settings: st } = live.current;
    const wantVoice =
      (c.active ? !c.speakerMuted : st.readAloud) &&
      !turnRef.current?.speechInterrupted;
    const tone =
      action === 'clarify'
        ? 'clarify'
        : action === 'edit' && versionId
          ? 'change'
          : 'point';
    if (targets.length && !wantVoice)
      tour.start(targets, { reply: completion, tone, expectAudio: false });
    if (wantVoice && (versionId || completion !== earlyReply)) {
      // Speech runs outside the turn so the conversation is free while Ground talks (barge-in works).
      speakText(completion, {
        messageId: msg.id,
        language,
        kind: 'completion',
        afterQuestions: true,
        owner: { kind: 'task', id },
        onStart: (d) => {
          if (targets.length && applied)
            tour.start(targets, { reply: completion, tone, expectAudio: true });
          tour.syncToAudio(d);
        },
      }).then((outcome) => {
        if (outcome !== 'ended' && outcome !== 'stopped')
          tour.audioUnavailable();
      });
    }
    return {
      outcome: editError ? 'failed' : versionId ? 'ready' : 'answered',
      error: editError,
      versionId,
      applied,
    };
  };

  /* ---------- voice call ---------- */
  const transcribeAndSend = useCallback(
    async (blob, filename, reference, meta = {}) => {
      const { health: h, companion: comp, settings: st } = live.current;
      const viaCompanion =
        !h.voice && comp.status === 'connected' && comp.info?.voice;
      const ctrl = new AbortController();
      transcribeCtrls.current.add(ctrl);
      setTranscribing((n) => n + 1);
      try {
        const r = viaCompanion
          ? await api.transcribe(
              blob,
              filename,
              ctrl.signal,
              companionApi.normalizeBase(st.companionUrl),
              st.companionToken,
            )
          : await api.transcribe(blob, filename, ctrl.signal);
        const text = String(r?.transcript || '').trim();
        if (!text) {
          if (turnRef.current) turnRef.current.speechInterrupted = false;
          toast(
            'I didn’t catch that. Try again a little closer to the mic.',
            'info',
            3000,
          );
          return;
        }
        const detected = String(r.language_code || '');
        const language = /^(en|hi|bn|gu|kn|ml|mr|od|pa|ta|te)-IN$/.test(
          detected,
        )
          ? detected
          : 'auto';
        if (language !== 'auto') setDetectedLanguage(language);
        await runTurnRef.current(text, {
          via: 'voice',
          reference,
          language,
          speechEndedAt: meta.speechEndedAt || meta.endedAt,
          transcribedAt: Date.now(),
        });
      } catch (e) {
        if (!isAbort(e)) {
          if (turnRef.current) turnRef.current.speechInterrupted = false;
          note(`Transcription failed: ${e.message}`, 'error');
        }
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
    let { health: h, companion: comp } = live.current;
    if (h.status === 'checking') {
      try {
        const ready = await api.health();
        h = {
          status: 'ok',
          chat: !!ready.chat,
          voice: !!ready.voice,
          provider: ready.provider || '',
        };
        setHealth(h);
      } catch {
        /* The existing service status supplies the user-facing error below. */
      }
    }
    if (!h.voice && !(comp.status === 'connected' && comp.info?.voice)) {
      const reason =
        h.status === 'error'
          ? 'The voice service is unreachable right now.'
          : 'Voice is not configured on this server yet.';
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
        utterRefs.current.set(segmentId, {
          ...captureReference(),
          interruptedVoice: player.playing || speechQueue.busy,
        });
        player.setVolume(0.2);
      },
      onSpeechConfirmed: (segmentId) => {
        if (
          utterRefs.current.get(segmentId)?.interruptedVoice ||
          player.playing ||
          speechQueue.busy
        )
          lastVoiceCutAt.current = Date.now();
        if (turnRef.current) turnRef.current.speechInterrupted = true;
        if (walkRef.current) stopWalkthrough();
        speechQueue.cancel();
        player.setVolume(1);
      },
      onSpeechDiscarded: () => player.setVolume(1),
      onUtterance: (blob, meta) => {
        let reference =
          utterRefs.current.get(meta.segmentId) || captureReference();
        utterRefs.current.delete(meta.segmentId);
        if (!reference.selection && !reference.hover) {
          const later = captureReference();
          if (later.hover) reference = { ...reference, hover: later.hover };
        }
        player.setVolume(1);
        transcribeAndSend(blob, meta.filename, reference, meta);
      },
      onError: (e) => {
        const message = micErrorMessage(e);
        voiceRef.current?.stop();
        voiceRef.current = null;
        player.stop();
        speechQueue.cancel();
        setCall((c) => ({
          ...c,
          active: false,
          connecting: false,
          state: 'off',
          error: message,
        }));
        toast(message, 'error', 7000);
      },
    });
    voiceRef.current = vs;
    try {
      await vs.start({ handsFree: live.current.settings.handsFree });
      if (voiceRef.current !== vs || vs.closed) return;
      vs.setPlayback(player.playing);
      setCall({
        active: true,
        connecting: false,
        state: vs.state,
        muted: false,
        speakerMuted: false,
        error: '',
      });
      const greeting =
        'Hi, I’m Ground. Point at something and tell me what you’d like to change. Speak in whichever language feels natural.';
      const greetingId = uid('m');
      appendMessages({
        id: greetingId,
        role: 'assistant',
        content: greeting,
        language: 'en-IN',
        at: Date.now(),
        local: true,
      });
      speakText(greeting, { messageId: greetingId, language: 'en-IN' });
    } catch (e) {
      if (voiceRef.current !== vs) return;
      vs.stop();
      voiceRef.current = null;
      const message = micErrorMessage(e);
      setCall({
        active: false,
        connecting: false,
        state: 'off',
        muted: false,
        speakerMuted: false,
        error: message,
      });
      toast(message, 'error', 8000);
    }
  }, [
    appendMessages,
    captureReference,
    player,
    speakText,
    toast,
    transcribeAndSend,
    stopWalkthrough,
  ]);

  const endCall = useCallback(() => {
    stopWalkthrough();
    voiceRef.current?.stop();
    voiceRef.current = null;
    utterRefs.current.clear();
    player.stop();
    speechQueue.cancel();
    for (const controller of transcribeCtrls.current) controller.abort();
    transcribeCtrls.current.clear();
    setCall((c) => ({
      ...c,
      active: false,
      connecting: false,
      state: 'off',
      muted: false,
    }));
  }, [player, stopWalkthrough]);

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
        player.setVolume(1);
        setCall((c) => ({ ...c, muted }));
      },
      toggleSpeaker: () => {
        const muting = !live.current.call.speakerMuted;
        if (muting) {
          player.stop();
          speechQueue.cancel();
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
          if (!vs.finishManual())
            toast('Nothing to send yet. Start speaking first.', 'info', 2400);
        } else if (vs.manualActive) {
          if (!vs.finishManual())
            toast(
              'That recording was silent, so nothing was sent.',
              'info',
              2600,
            );
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
      const next = customProjects.find((p) => p.id === id) || projectById(id);
      if (!next || id === live.current.project.id) return;
      const leaving = live.current.session,
        active = turnRef.current;
      interrupt({ silent: true });
      setDemo(null);
      setComparison(null);
      saveSession(
        active
          ? {
              ...leaving,
              queuePaused: true,
              work: leaving.work
                ? {
                    ...leaving.work,
                    state: 'cancelled',
                    finishedAt: Date.now(),
                  }
                : null,
              tasks: updateTask(leaving.tasks || [], active.work?.taskId, {
                state: 'cancelled',
                finishedAt: Date.now(),
              }),
            }
          : leaving,
      );
      store.reset();
      store.trail.length = 0;
      setSession(loadOrCreate(next));
      setProjectId(id);
      updateSettings({ projectId: id });
      setPanel(null);
    },
    [interrupt, store, updateSettings, customProjects],
  );

  const createPage = ({ name, brief = '', html = '' }) => {
    const clean = html.trim()
      ? prepareDocument(html, { sanitize: true })
      : blankHTML(name || 'Untitled page');
    const leaving = live.current.session,
      active = turnRef.current;
    interrupt({ silent: true });
    saveSession(
      active
        ? {
            ...leaving,
            queuePaused: true,
            work: leaving.work
              ? { ...leaving.work, state: 'cancelled', finishedAt: Date.now() }
              : null,
            tasks: updateTask(leaving.tasks || [], active.work?.taskId, {
              state: 'cancelled',
              finishedAt: Date.now(),
            }),
          }
        : leaving,
    );
    setComparison(null);
    setDemo(null);
    store.reset();
    const next = {
      id: uid('custom'),
      name: (name || 'Untitled page').slice(0, 70),
      kind: 'Your HTML landing page',
      description: 'Created in Common Ground',
      html: clean,
      swatch: ['#f3f1eb', '#46664e', '#6f5cd3'],
      suggestions: ['Describe the page you want to build.'],
    };
    const all = [...customProjects, next].slice(-24);
    setCustomProjects(all);
    saveProjects(all);
    const fresh = freshSession(next);
    setSession(fresh);
    saveSession(fresh);
    setProjectId(next.id);
    setWelcome(false);
    updateSettings({ projectId: next.id, welcomeSeen: true });
    setPanel(null);
    if (brief.trim())
      setPendingCreation({ projectId: next.id, text: brief.trim() });
    else toast('Fresh canvas ready. Describe your landing page on the call.');
  };
  useEffect(() => {
    if (pendingCreation?.projectId !== projectId) return;
    const creation = pendingCreation;
    setPendingCreation(null);
    runTurnRef.current?.(creation.text, { task: 'create', via: 'brief' });
  }, [pendingCreation, projectId]);

  const applyHTML = async (
    source,
    {
      summary = 'HTML edited',
      message = 'Your HTML changes are live. Keep them, undo, or ask me to walk through them.',
      spoken = false,
    } = {},
  ) => {
    const html = prepareDocument(source, { sanitize: true });
    interrupt({ silent: true });
    setComparison(null);
    const parent = live.current.current,
      before = store.elements.slice(),
      generation = store.getSnapshot().generation;
    const v = {
      id: uid('v'),
      html,
      summary,
      intent: 'Manual HTML update',
      createdAt: Date.now(),
      parentId: parent.id,
      status: 'pending',
      origin: 'ai',
      changes: [],
      sourceChanges: [],
      provider: 'You',
    };
    commitVersion(v);
    await store.waitForReady(generation, 6000);
    if (live.current.current.id !== v.id) return;
    const targets = changedTargets(before, store.elements);
    setSession((s) => ({
      ...s,
      versions: s.versions.map((x) =>
        x.id === v.id
          ? {
              ...x,
              changes: targets.map((t) => ({
                id: t.id,
                description: t.description,
              })),
            }
          : x,
      ),
    }));
    appendMessages({
      id: uid('m'),
      role: 'assistant',
      content: message,
      at: Date.now(),
      targets,
      versionId: v.id,
      local: true,
    });
    if (targets.length) tour.start(targets, { reply: message, tone: 'change' });
    if (spoken && live.current.call.active && !live.current.call.speakerMuted)
      speakText(message);
  };
  const insertImage = async (asset) => {
    try {
      const doc = new DOMParser().parseFromString(
        live.current.current.html,
        'text/html',
      );
      const reference = captureReference(),
        id = (reference.selection || reference.hover)?.id;
      const target =
        [...doc.querySelectorAll('[data-cg-id]')].find(
          (e) => e.getAttribute('data-cg-id') === id,
        ) || doc.body;
      let image = target.tagName === 'IMG' ? target : doc.createElement('img');
      image.src = asset.url;
      image.alt = asset.name;
      image.removeAttribute('srcset');
      image.removeAttribute('sizes');
      if (image !== target) {
        image.setAttribute('data-cg-id', uid('image'));
        image.style.cssText =
          'display:block;max-width:100%;width:100%;object-fit:cover;border-radius:12px;';
        if (
          /^(BODY|MAIN|SECTION|DIV|FIGURE|ARTICLE|HEADER|FOOTER)$/.test(
            target.tagName,
          )
        )
          target.append(image);
        else target.after(image);
      }
      setPanel(null);
      await applyHTML('<!doctype html>' + doc.documentElement.outerHTML, {
        summary: target.tagName === 'IMG' ? 'Image replaced' : 'Image added',
        message:
          'The image is in place. Point at it to change its shape, size or styling.',
        spoken: true,
      });
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  chooseComparisonRef.current = async (index, selectedId) => {
    const c = live.current.comparison;
    if (!c) return;
    const choice = c.variants[index];
    if (!choice) return;
    setComparison(null);
    interrupt({ silent: true, scope: 'work' });
    setTurn({
      phase: 'applying',
      startedAt: Date.now(),
      label: 'Loading your chosen direction',
    });
    const generation = store.getSnapshot().generation;
    const v = {
      id: uid('v'),
      taskId: c.taskId,
      html: choice.html,
      summary: choice.name,
      intent: choice.intent,
      createdAt: Date.now(),
      parentId: c.parent.id,
      status: 'kept',
      origin: 'ai',
      changes: choice.changes || [],
      sourceChanges: [],
      provider: 'Ground',
    };
    const activate = live.current.current.id === c.parent.id;
    commitVersion(v, { activate });
    patchTask(c.taskId, {
      state: 'ready',
      resultVersionId: v.id,
      applied: activate,
      title: choice.name,
      finishedAt: Date.now(),
    });
    if (activate) await store.waitForReady(generation, 6000);
    if (activate && live.current.current.id !== v.id) {
      setTurn({ phase: 'idle', startedAt: 0 });
      return;
    }
    const targets = activate
      ? changedTargets(
          c.beforeElements,
          store.elements,
          choice.changes || [],
          c.language,
        )
      : [];
    setSession((s) => ({
      ...s,
      versions: s.versions.map((x) =>
        x.id === v.id
          ? {
              ...x,
              changes: targets.map((t) => ({
                id: t.id,
                description: t.description,
              })),
            }
          : x,
      ),
    }));
    if (selectedId) sendToPreview({ type: 'cg:select', id: selectedId });
    const content = !activate
      ? c.language === 'hinglish'
        ? 'आपका चुना option अलग version में save है. Task से review कर सकते हैं.'
        : 'Your choice is saved as a separate version. View it from the task list.'
      : `${spokenUI('chosen', c.language, { name: choice.name })} ${targets
          .slice(0, 2)
          .map((t) => t.description)
          .join('. ')}`;
    appendMessages({
      id: uid('m'),
      role: 'assistant',
      content,
      at: Date.now(),
      language: c.language,
      targets,
      versionId: v.id,
      local: true,
    });
    if (targets.length)
      tour.start(targets, {
        reply: content,
        tone: 'change',
        expectAudio: live.current.call.active,
      });
    if (live.current.call.active && !live.current.call.speakerMuted)
      speakText(content, {
        language: c.language,
        afterQuestions: true,
        onStart: (d) => tour.syncToAudio(d),
      });
    setTurn({ phase: 'idle', startedAt: 0 });
  };

  taskActionRef.current = (task, action) => {
    if (action === 'continue') {
      const L = live.current,
        first = (L.session.tasks || []).find((t) => t.state === 'queued');
      if (!hasPageContent(L.current.html) && first && first.kind !== 'create') {
        toast('Retry the page build before continuing its changes.');
        return;
      }
      setSession((s) => ({ ...s, queuePaused: false }));
      return;
    }
    if (action === 'cancel') {
      if (turnRef.current?.work?.taskId === task.id)
        interrupt({ silent: true, scope: 'work' });
      else {
        patchTask(task.id, { state: 'cancelled', finishedAt: Date.now() });
        if (live.current.comparison?.taskId === task.id) setComparison(null);
        setSession((s) =>
          s.work?.taskId === task.id
            ? {
                ...s,
                work: {
                  ...s.work,
                  state: 'cancelled',
                  awaitingClarification: false,
                  finishedAt: Date.now(),
                },
              }
            : s,
        );
      }
      return;
    }
    if (action === 'retry') {
      if (!['failed', 'interrupted', 'cancelled'].includes(task.state)) return;
      patchTask(task.id, { state: 'queued', error: '', question: '' });
      setSession((s) => ({ ...s, queuePaused: false }));
      return;
    }
    if (action === 'view' && task.resultVersionId) {
      if (!turnRef.current) restore(task.resultVersionId);
      else
        toast('The result is saved. View it after the current task finishes.');
    }
    if (action === 'answer') {
      if (
        task.state === 'needs_choice' &&
        live.current.comparison?.taskId === task.id
      )
        return;
      const content =
        task.question || 'Tell me the missing detail on the call.';
      if (live.current.call.active)
        speakText(content, { language: live.current.voiceProfile.style });
      else startCall();
    }
  };

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
        const info = await companionApi.health(
          st.companionUrl,
          st.companionToken,
        );
        if (!info?.ok)
          throw new Error('The companion did not report a healthy state.');
        if (!info.previewUrl)
          throw new Error('The companion did not provide a preview URL.');
        setCompanion({ status: 'connected', info, error: '' });
        if (switchTo) switchProject('companion');
        if (!quiet)
          toast(
            `Connected to ${typeof info.project === 'string' ? info.project : info.project?.name || 'your project'}.`,
            'success',
          );
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
    if (live.current.project.id === 'companion')
      switchProject(SAMPLE_PROJECTS[0].id);
  }, [switchProject]);

  // Real reconnect on load when the last project was the companion; poll while connected.
  useEffect(() => {
    if (projectId === 'companion' && companion.status === 'disconnected')
      connectCompanion({ switchTo: false, quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (companion.status !== 'connected') return;
    const t = setInterval(async () => {
      const st = live.current.settings;
      try {
        const info = await companionApi.health(
          st.companionUrl,
          st.companionToken,
        );
        setCompanion((c) => (c.status === 'connected' ? { ...c, info } : c));
      } catch (e) {
        setCompanion((c) => ({
          ...c,
          status: 'error',
          error: `Lost the companion connection: ${e.message}`,
        }));
      }
    }, 15000);
    return () => clearInterval(t);
  }, [companion.status]);

  /* ---------- preview source ---------- */
  const srcDoc = useMemo(
    () => (current.html && !isCompanion ? buildSrcDoc(current.html) : ''),
    [current.html, isCompanion],
  );
  const companionSrc =
    isCompanion && companion.status === 'connected'
      ? companion.info?.previewUrl
      : '';
  useEffect(() => {
    try {
      previewOriginRef.current = companionSrc
        ? new URL(companionSrc).origin
        : '*';
    } catch {
      previewOriginRef.current = '*';
    }
  }, [companionSrc]);
  useEffect(() => {
    store.set({ ready: false });
  }, [srcDoc, companionSrc, previewNonce, current.id, store]);

  /* ---------- selection tools ---------- */
  const selectElement = useCallback(
    (id, reveal = false) =>
      sendToPreview({ type: 'cg:select', id: id || null, reveal }),
    [sendToPreview],
  );
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
        const msg = {
          id: uid('m'),
          role,
          content,
          at: Date.now(),
          scripted: true,
          via: 'text',
        };
        if (extra.ref)
          msg.ref = {
            id: extra.ref,
            label: 'Find a place to stay where the days run slow.',
            kind: 'Heading',
            tag: 'h1',
            locked: !!extra.locked,
          };
        if (extra.action) msg.action = extra.action;
        if (extra.targets) msg.targets = extra.targets;
        appendMessages(msg);
      },
      simulateHover: (id, label) =>
        sendToPreview({ type: 'cg:simulate-hover', id, label }),
      select: (id) => selectElement(id),
      point: (targets, tone, reply) =>
        tour.start(targets, { reply, tone, expectAudio: false }),
      applyEdit: (mutate, { summary, reply, changes }) => {
        const s = live.current.session;
        const parent = currentOf(s);
        const html = transformDocument(parent.html, mutate);
        const v = {
          id: uid('v'),
          html,
          summary: `Demo · ${summary}`,
          intent: '',
          createdAt: Date.now(),
          parentId: parent.id,
          status: 'pending',
          origin: 'demo',
          changes,
          sourceChanges: [],
          provider: 'Scripted demo',
        };
        commitVersion(v);
        appendMessages({
          id: uid('m'),
          role: 'assistant',
          content: reply,
          at: Date.now(),
          scripted: true,
          action: 'edit',
          versionId: v.id,
          targets: changes.map((c) => ({
            id: c.id,
            label: clip(c.description, 60),
          })),
        });
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
      const t = setTimeout(
        () => setDemo((d) => (d ? { ...d, index: 0 } : d)),
        500,
      );
      return () => clearTimeout(t);
    }
    const step = DEMO_STEPS[demo.index];
    if (!demo.playing || !step || step.final) return;
    const t = setTimeout(
      () =>
        setDemo((d) =>
          d && d.index === demo.index ? { ...d, index: d.index + 1 } : d,
        ),
      step.wait,
    );
    return () => clearTimeout(t);
  }, [demo, bridge.ready]);

  const demoControls = useMemo(
    () => ({
      next: () =>
        setDemo((d) =>
          d && d.index < DEMO_STEPS.length - 1
            ? { ...d, index: d.index + 1 }
            : d,
        ),
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
      if (
        live.current.turn.phase !== 'idle' ||
        player.playing ||
        discussionJobs.current.size
      )
        stopForeground();
      else if (store.getSnapshot().selection && !fromPreview)
        selectElement(null);
      return true;
    }
    if (key === '/' && !meta) {
      setPanel('transcript');
      setTimeout(() => composerRef.current?.focus(), 100);
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
      const typing =
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable);
      if (typing && e.key !== 'Escape') return;
      if (
        handleKeyRef.current({
          key: e.key,
          meta: e.metaKey || e.ctrlKey,
          shift: e.shiftKey,
        })
      ) {
        if (e.key !== 'Escape') e.preventDefault();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [welcome, confirm]);

  /* ---------- derived ---------- */
  const busy = turn.phase !== 'idle';
  const pending = current.status === 'pending' ? current : null;
  const versionIndex =
    session.versions.findIndex((v) => v.id === current.id) + 1;
  const chatAvailable = isCompanion
    ? companion.status === 'connected'
    : health.chat;
  const voiceAvailable =
    health.voice ||
    (companion.status === 'connected' && !!companion.info?.voice);

  const enterStudio = useCallback(() => {
    setWelcome(false);
    updateSettings({ welcomeSeen: true });
    startCall();
  }, [startCall, updateSettings]);

  const exportProject = isCompanion
    ? {
        ...COMPANION_PROJECT,
        name: companion.info?.project
          ? String(companion.info.project)
          : COMPANION_PROJECT.name,
      }
    : project;

  return (
    <div className="app">
      <TopBar
        project={exportProject}
        projects={projects}
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
        <TaskRail
          key={project.id}
          tasks={session.tasks || []}
          paused={!!session.queuePaused}
          busy={busy}
          turn={turn}
          versions={session.versions}
          onAction={(task, action) => taskActionRef.current?.(task, action)}
          canContinue={
            hasPageContent(current.html) ||
            isCompanion ||
            (session.tasks || []).find((t) => t.state === 'queued')?.kind ===
              'create'
          }
          onContinue={() => taskActionRef.current?.(null, 'continue')}
        />
        <section className="stage-col" aria-label="Shared preview">
          <div className="workspace-tools">
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setEditorMode('new');
                setPanel('editor');
              }}
            >
              <Plus size={14} />
              New page
            </button>
            <button
              className="btn btn-quiet btn-sm"
              disabled={isCompanion}
              title={
                isCompanion
                  ? 'Create an HTML page to use this editor'
                  : 'Edit or import HTML'
              }
              onClick={() => {
                setEditorMode('edit');
                setPanel('editor');
              }}
            >
              <Code2 size={14} />
              HTML editor
            </button>
            <button
              className="btn btn-quiet btn-sm"
              disabled={isCompanion}
              onClick={() => setPanel('assets')}
            >
              <ImagePlus size={14} />
              Images
            </button>
            <button
              className={`btn btn-quiet btn-sm ${compareMode ? 'is-selected' : ''}`}
              disabled={isCompanion || busy}
              aria-pressed={compareMode}
              onClick={() => setCompareMode((v) => !v)}
              title="Build two alternatives for your next change"
            >
              <Columns2 size={14} />
              Two directions
            </button>
            <button
              className="btn btn-quiet btn-sm"
              disabled={!bridge.ready || busy}
              onClick={() =>
                startWalkthrough(pageTour(store.elements, voiceProfile.style), {
                  language: voiceProfile.style,
                })
              }
            >
              <Navigation size={14} />
              Tour page
            </button>
            <button
              className="btn btn-quiet btn-sm"
              disabled={isCompanion || busy || !!comparison}
              onClick={() => setPanel('publish')}
            >
              <Globe size={14} />
              Publish
            </button>
          </div>
          {!busy &&
            !hasPageContent(current.html) &&
            session.work?.awaitingClarification && (
              <PendingClarification work={session.work} />
            )}
          {!busy && !hasPageContent(current.html) && recoverable && (
            <InterruptedWork work={recoverable} onResume={resumeWork} />
          )}
          {walkthrough && (
            <Walkthrough
              walk={walkthrough}
              onNext={() => {
                player.stop();
                speechQueue.cancel();
                setWalkthrough((w) =>
                  w && w.index + 1 < w.targets.length
                    ? { ...w, index: w.index + 1 }
                    : null,
                );
              }}
              onPrevious={() => {
                player.stop();
                speechQueue.cancel();
                setWalkthrough((w) =>
                  w ? { ...w, index: Math.max(0, w.index - 1) } : w,
                );
              }}
              onToggle={() => {
                player.stop();
                speechQueue.cancel();
                setWalkthrough((w) => (w ? { ...w, playing: !w.playing } : w));
              }}
              onStop={stopWalkthrough}
            />
          )}
          {demo && (
            <TourBanner
              step={Math.max(0, demo.index)}
              total={DEMO_STEPS.length}
              caption={DEMO_STEPS[Math.max(0, demo.index)]?.caption}
              playing={demo.playing}
              controls={demoControls}
              final={!!DEMO_STEPS[demo.index]?.final}
              waiting={demo.index < 0}
            />
          )}
          <PreviewStage
            iframeRef={iframeRef}
            srcDoc={srcDoc}
            companionSrc={companionSrc}
            previewNonce={`${current.id}:${previewNonce}`}
            isCompanion={isCompanion}
            companion={companion}
            onOpenSetup={() => setPanel('setup')}
            onReload={() => setPreviewNonce((n) => n + 1)}
            bridge={bridge}
            store={store}
            reviewMode={reviewMode}
            onReviewMode={setReviewMode}
            onSelect={selectElement}
            hintsVisible={!settings.hintsDismissed && !demo}
            projectName={exportProject.name}
          >
            {pending && !busy && !comparison && (
              <ActionBar
                version={pending}
                index={versionIndex}
                callActive={call.active}
                onKeep={keep}
                onUndo={() => undo()}
                onRefine={() => {
                  if (call.active)
                    toast('Tell Ground what you’d like to refine.');
                  else startCall();
                }}
                onShowChanges={() => setPanel('source')}
                onTour={() => {
                  const t = resolveTargets(
                    pending.changes.map((c) => ({
                      id: c.id,
                      label: clip(c.description, 42),
                    })),
                    store.elements,
                  );
                  if (t.length) pointAt(t, 'change');
                  else
                    toast(
                      'Ground could not find the changed elements on the page.',
                      'info',
                    );
                }}
              />
            )}
          </PreviewStage>
          {busy && (
            <Processing
              turn={turn}
              onStop={() => interrupt({ scope: 'work' })}
            />
          )}
          {comparison && (
            <CompareView
              comparison={comparison}
              onChoose={(index, id) => chooseComparisonRef.current?.(index, id)}
              onCancel={() => {
                patchTask(comparison.taskId, {
                  state: 'cancelled',
                  finishedAt: Date.now(),
                });
                setComparison(null);
                tour.cancel();
                toast('Original page kept.');
              }}
            />
          )}
        </section>

        <VoiceRoom
          call={call}
          controls={callControls}
          handsFree={settings.handsFree}
          queued={
            (session.tasks || [])
              .filter((t) => t.state === 'queued')
              .map((t) => clip(t.title, 60))
              .join(' · ') || null
          }
          discussion={discussion}
          turn={turn}
          transcribing={transcribing > 0}
          speaking={speaking}
          speakingMessageId={speakingMessageId}
          messages={session.messages}
          pointing={pointing}
          bridge={bridge}
          detectedLanguage={voiceProfile.style}
          voiceAvailable={voiceAvailable}
          health={health}
          onTranscript={() => setPanel('transcript')}
          onListen={listen}
          onRetry={(m) => sendTurn(m.retry.text, { via: m.retry.via })}
          onInterrupt={stopForeground}
          onClearSelection={() => selectElement(null)}
          onSelectRef={(id) => selectElement(id, true)}
          onPointTargets={(targets, tone) => pointAt(targets, tone)}
        />
      </main>

      {panel === 'transcript' && (
        <Sheet
          title="Session transcript"
          subtitle="A record of your conversation. Keyboard access is here when you need it."
          onClose={() => setPanel(null)}
        >
          <div className="transcript-sheet">
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
              onInterrupt={stopForeground}
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
          </div>
        </Sheet>
      )}

      {panel === 'source' && (
        <SourceDrawer
          session={session}
          project={exportProject}
          current={current}
          onClose={() => setPanel(null)}
          toast={toast}
          onRestore={restore}
        />
      )}
      {panel === 'editor' && (
        <PageEditor
          key={`${editorMode}-${project.id}`}
          mode={editorMode}
          current={current}
          onClose={() => setPanel(null)}
          onCreate={createPage}
          onApply={applyHTML}
        />
      )}
      {panel === 'assets' && (
        <AssetsPanel
          assets={assets}
          selected={selectedAsset}
          onSelect={setSelectedAsset}
          onUpload={(asset) => {
            setAssets((a) => [...a, asset].slice(-24));
            setSelectedAsset(asset.id);
            toast(
              'Image uploaded. Select a spot and ask Ground to place it.',
              'success',
            );
          }}
          onInsert={insertImage}
          reference={bridge.selection || bridge.hover}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'publish' && (
        <PublishPanel
          key={project.id}
          project={exportProject}
          current={current}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === 'history' && (
        <HistoryPanel
          session={session}
          onClose={() => setPanel(null)}
          onRestore={restore}
          onUndo={() => undo()}
          onShowSource={() => setPanel('source')}
          onReset={resetProject}
          project={exportProject}
          toast={toast}
        />
      )}
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
      {panel === 'help' && (
        <HelpPanel
          onClose={() => setPanel(null)}
          onDemo={startDemo}
          onWelcome={() => setWelcome(true)}
        />
      )}

      {welcome && (
        <Welcome onEnter={enterStudio} onDemo={startDemo} health={health} />
      )}
      {confirm && (
        <ConfirmDialog {...confirm} onClose={() => setConfirm(null)} />
      )}
      <Toasts toasts={toasts} onDismiss={dismissToast} />
      <div className="sr-only" aria-live="polite">
        {pointing?.target
          ? `Ground is pointing at ${describeElement({ kind: pointing.target.kind, label: pointing.target.label })}`
          : ''}
      </div>
    </div>
  );
}
