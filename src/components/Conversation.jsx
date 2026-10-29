import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Square, Volume2, VolumeX, Lock, Mic, RotateCcw, MoreHorizontal, Download, Trash2, PlayCircle, Phone, GitCommitHorizontal, Plug, Loader2, X, Sparkles } from 'lucide-react';
import { cx, clip, timeLabel, downloadFile, fileSlug } from '../lib/util.js';
import { exportJSON, exportMarkdown } from '../lib/export.js';
import { CursorGlyph } from './Logo.jsx';

function Presence({ turn, transcribing, callActive, speaking }) {
  let state = 'idle';
  let label = 'Ready when you are';
  if (transcribing) {
    state = 'listening';
    label = 'Transcribing what you said';
  } else if (turn.phase === 'thinking') {
    state = 'thinking';
    label = 'Thinking';
  } else if (turn.phase === 'applying') {
    state = 'thinking';
    label = 'Applying the change';
  } else if (speaking) {
    state = 'speaking';
    label = 'Speaking';
  } else if (callActive) {
    state = 'listening';
    label = 'On the call · listening';
  }
  return (
    <div className={cx('presence', `is-${state}`)}>
      <span className="presence-avatar" aria-hidden="true">
        <span className="presence-ring" />
        G
      </span>
      <div className="presence-text">
        <b>Ground</b>
        <span aria-live="polite">{label}</span>
      </div>
    </div>
  );
}

function SessionMenu({ session, project, onReset }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return (
    <div className="session-menu" ref={ref}>
      <button type="button" className="icon-btn" aria-label="Session options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div className="menu right" role="menu">
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              downloadFile(`${fileSlug(project.name)}-session-${stamp}.md`, exportMarkdown(session, project), 'text/markdown');
              setOpen(false);
            }}
          >
            <span className="menu-icon">
              <Download size={15} />
            </span>
            <span className="menu-text">
              <b>Export as Markdown</b>
              <small>Transcript, references and diffs</small>
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              downloadFile(`${fileSlug(project.name)}-session-${stamp}.json`, exportJSON(session, project), 'application/json');
              setOpen(false);
            }}
          >
            <span className="menu-icon">
              <Download size={15} />
            </span>
            <span className="menu-text">
              <b>Export as JSON</b>
              <small>Structured, with accepted source</small>
            </span>
          </button>
          <div className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="menu-item danger"
            onClick={() => {
              setOpen(false);
              onReset();
            }}
          >
            <span className="menu-icon">
              <Trash2 size={15} />
            </span>
            <span className="menu-text">
              <b>Reset project…</b>
              <small>Clear conversation and versions</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

const Message = memo(function Message({ m, versionLabel, versionStatus, speakingMessageId, voiceAvailable, onListen, onSelectRef, onPointTargets, onOpenVersion, onRetry }) {
  if (m.role === 'note') {
    return (
      <li className={cx('msg note', m.tone && `tone-${m.tone}`)}>
        <p>{m.content}</p>
        {m.retry && (
          <button type="button" className="link-btn" onClick={() => onRetry(m)}>
            <RotateCcw size={12} aria-hidden="true" /> Try again
          </button>
        )}
      </li>
    );
  }
  const mine = m.role === 'user';
  const tone = m.action === 'clarify' ? 'clarify' : m.action === 'edit' ? 'change' : 'point';
  return (
    <li className={cx('msg', mine ? 'you' : 'ground')}>
      <div className="msg-meta">
        <span className="msg-who">{mine ? 'You' : 'Ground'}</span>
        {m.via === 'voice' && (
          <span className="msg-via" title="Spoken">
            <Mic size={11} aria-label="spoken" />
          </span>
        )}
        {m.scripted && <span className="msg-tag">Scripted demo</span>}
        {m.local && <span className="msg-tag">Local</span>}
        <time className="msg-time">{timeLabel(m.at)}</time>
      </div>
      <div className="msg-bubble">
        <p>{m.content}</p>
      </div>
      {mine && m.ref && (
        <button type="button" className="ref-chip you" onClick={() => onSelectRef(m.ref.id)} title="Select this element again">
          {m.ref.locked ? <Lock size={11} aria-hidden="true" /> : <CursorGlyph who="you" size={10} />}
          <span>{m.ref.kind || m.ref.tag || 'Element'}</span>
          <em>{clip(m.ref.label || m.ref.id, 34)}</em>
        </button>
      )}
      {!mine && m.targets?.length > 0 && (
        <div className="target-row">
          {m.action === 'clarify' && <span className="target-lead">Which one?</span>}
          {m.targets.map((t) => (
            <button
              type="button"
              key={t.id}
              className="ref-chip ground"
              onClick={() => {
                if (m.action === 'clarify') onSelectRef(t.id);
                onPointTargets([t], tone);
              }}
              title={m.action === 'clarify' ? 'Select this one' : 'Point at this again'}
            >
              <CursorGlyph who="ground" size={10} />
              <em>{clip(t.label || t.id, 36)}</em>
            </button>
          ))}
          {m.targets.length > 1 && m.action !== 'clarify' && (
            <button type="button" className="link-btn" onClick={() => onPointTargets(m.targets, tone)}>
              Replay
            </button>
          )}
        </div>
      )}
      {!mine && m.versionId && versionLabel && (
        <button type="button" className={cx('version-card', `is-${versionStatus}`)} onClick={() => onOpenVersion(m.versionId)}>
          <GitCommitHorizontal size={14} aria-hidden="true" />
          <span>
            <b>{versionLabel}</b>
            <small>{versionStatus === 'undone' ? 'Undone' : versionStatus === 'pending' ? 'Waiting for your review' : 'Kept'} · view changes</small>
          </span>
        </button>
      )}
      {!mine && voiceAvailable && !m.scripted && (
        <button type="button" className="link-btn listen" onClick={() => onListen(m)} aria-label={speakingMessageId === m.id ? 'Stop reading aloud' : 'Read this reply aloud'}>
          {speakingMessageId === m.id ? <VolumeX size={12} aria-hidden="true" /> : <Volume2 size={12} aria-hidden="true" />}
          {speakingMessageId === m.id ? 'Stop' : 'Listen'}
        </button>
      )}
      {!mine && m.provider && <span className="msg-provider">{m.provider}</span>}
    </li>
  );
});

function EmptyState({ project, chatAvailable, health, isCompanion, companion, onDemo, onStartCall, onOpenSetup, onSuggest, voiceAvailable }) {
  return (
    <div className="empty">
      <div className="empty-art" aria-hidden="true">
        <span className="ea-card" />
        <span className="ea-outline" />
        <span className="ea-cursor you">
          <CursorGlyph who="you" size={14} />
        </span>
        <span className="ea-cursor ground">
          <CursorGlyph who="ground" size={14} />
        </span>
      </div>
      <h3>Start by pointing at something</h3>
      <p>Hover the preview while you talk or type. Click to lock an element so “this” always means exactly that.</p>
      {!chatAvailable && !isCompanion && (
        <div className="callout warn" role="note">
          {health.status === 'checking' ? 'Checking which AI services this server offers…' : health.status === 'error' ? `The server is unreachable: ${health.message}` : 'This server has no AI provider key configured, so Ground can’t reply yet. The scripted demo and local undo still work.'}
        </div>
      )}
      {isCompanion && companion.status !== 'connected' && (
        <div className="callout warn" role="note">
          Not connected to your local companion.{' '}
          <button type="button" className="link-btn" onClick={onOpenSetup}>
            <Plug size={12} aria-hidden="true" /> Open setup
          </button>
        </div>
      )}
      <ul className="suggestions" aria-label="Try saying">
        {project.suggestions.map((s) => (
          <li key={s}>
            <button type="button" onClick={() => onSuggest(s.replace(/^.*?[“"]|[”"]\.?$/g, ''))}>
              <Sparkles size={13} aria-hidden="true" />
              <span>{s}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="empty-actions">
        <button type="button" className="btn btn-outline btn-sm" onClick={onStartCall} disabled={!voiceAvailable}>
          <Phone size={14} aria-hidden="true" /> Start a voice call
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onDemo}>
          <PlayCircle size={14} aria-hidden="true" /> Watch the scripted demo
        </button>
      </div>
    </div>
  );
}

function ReferentChip({ bridge, onClear }) {
  const sel = bridge.selection;
  const hov = bridge.hover;
  if (sel) {
    return (
      <div className="referent locked">
        <Lock size={11} aria-hidden="true" />
        <span>
          Talking about <b>{sel.kind || sel.tag}</b> {clip(sel.label || sel.text, 30)}
        </span>
        <button type="button" className="mini-btn" onClick={onClear} aria-label="Clear selection">
          <X size={11} />
        </button>
      </div>
    );
  }
  if (hov) {
    return (
      <div className="referent">
        <CursorGlyph who="you" size={10} />
        <span>
          Last pointed at <b>{hov.kind || hov.tag}</b> {clip(hov.label, 30)}
        </span>
      </div>
    );
  }
  return <div className="referent empty-ref">No reference yet. Hover the preview to point.</div>;
}

function Composer({ onSend, onInterrupt, busy, chatAvailable, bridge, onClearSelection, composerRef, composerSeed, settings, updateSettings }) {
  const [text, setText] = useState('');
  const local = useRef(null);
  const ref = composerRef || local;

  useEffect(() => {
    if (!composerSeed) return;
    setText(composerSeed.text);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [composerSeed, ref]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text, ref]);

  const isUndo = /^\s*(undo|revert|go back|wapas)/i.test(text);
  const canSend = text.trim() && (chatAvailable || isUndo);

  const submit = () => {
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy && !text.trim()) onInterrupt();
        else submit();
      }}
    >
      <ReferentChip bridge={bridge} onClear={onClearSelection} />
      <div className="composer-box">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={chatAvailable ? 'Tell Ground what to change… (try “make this warmer”)' : 'Ground is unavailable. Type “undo” to revert locally.'}
          aria-label="Message Ground"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) submit();
            }
          }}
        />
        {busy && !text.trim() ? (
          <button type="submit" className="send-btn stop" aria-label="Stop Ground">
            <Square size={13} />
          </button>
        ) : (
          <button type="submit" className="send-btn" disabled={!canSend} aria-label={busy ? 'Interrupt and send' : 'Send'}>
            <ArrowUp size={16} />
          </button>
        )}
      </div>
      <div className="composer-foot">
        <div className="seg tiny" role="radiogroup" aria-label="Intent">
          <button type="button" role="radio" aria-checked={settings.mode === 'discuss'} className={cx(settings.mode === 'discuss' && 'is-on')} onClick={() => updateSettings({ mode: 'discuss' })} title="Ground discusses first and edits when the request is clear">
            Discuss
          </button>
          <button type="button" role="radio" aria-checked={settings.mode === 'edit'} className={cx(settings.mode === 'edit' && 'is-on')} onClick={() => updateSettings({ mode: 'edit' })} title="Ground implements clear requests straight away">
            Edit
          </button>
        </div>
        <div className="seg tiny" role="radiogroup" aria-label="Language">
          <button type="button" role="radio" aria-checked={settings.language === 'en-IN'} className={cx(settings.language === 'en-IN' && 'is-on')} onClick={() => updateSettings({ language: 'en-IN' })}>
            English
          </button>
          <button type="button" role="radio" aria-checked={settings.language === 'hi-IN'} className={cx(settings.language === 'hi-IN' && 'is-on')} onClick={() => updateSettings({ language: 'hi-IN' })}>
            हिंदी / Hinglish
          </button>
        </div>
        <label className="toggle-inline" title="Read replies aloud when you are not on a call">
          <input type="checkbox" checked={settings.readAloud} onChange={(e) => updateSettings({ readAloud: e.target.checked })} />
          <span>Read aloud</span>
        </label>
      </div>
    </form>
  );
}

function Thinking({ turn, transcribing }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (turn.phase === 'idle') return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - turn.startedAt) / 1000)), 1000);
    return () => {
      clearInterval(t);
      setElapsed(0);
    };
  }, [turn.phase, turn.startedAt]);
  if (turn.phase === 'idle' && !transcribing) return null;
  const label = transcribing && turn.phase === 'idle' ? 'Transcribing your voice…' : turn.phase === 'applying' ? 'Loading the new version into the preview…' : elapsed > 8 ? `Still working (${elapsed}s). Page edits can take up to a minute.` : 'Ground is thinking…';
  return (
    <li className="msg ground thinking" aria-live="polite">
      <div className="msg-bubble">
        <span className="dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>{label}</span>
      </div>
    </li>
  );
}

export default function Conversation(props) {
  const { messages, versions, turn, transcribing, speakingMessageId, chatAvailable, health, isCompanion, companion, project, onSend, onRetry, onInterrupt, onListen, voiceAvailable, onSelectRef, onPointTargets, onOpenVersion, onDemo, onStartCall, onOpenSetup, onReset, settings, updateSettings, bridge, onClearSelection, composerRef, composerSeed, busy, callActive, session } = props;
  const listRef = useRef(null);
  const [seed, setSeed] = useState(null);
  const effectiveSeed = seed && (!composerSeed || seed.at > composerSeed.at) ? seed : composerSeed;
  const versionInfo = new Map(versions.map((v, i) => [v.id, { label: `v${i + 1} · ${v.summary}`, status: v.status }]));

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: messages.length ? el.scrollHeight : 0, behavior: messages.length > 1 ? 'smooth' : 'auto' });
  }, [messages.length, turn.phase, transcribing]);

  return (
    <aside className="convo" aria-label="Conversation with Ground">
      <header className="convo-head">
        <Presence turn={turn} transcribing={transcribing} callActive={callActive} speaking={!!speakingMessageId} />
        <SessionMenu session={session} project={project} onReset={onReset} />
      </header>
      <div className="convo-scroll" ref={listRef}>
        {messages.length === 0 ? (
          <EmptyState
            project={project}
            chatAvailable={chatAvailable}
            health={health}
            isCompanion={isCompanion}
            companion={companion}
            onDemo={onDemo}
            onStartCall={onStartCall}
            onOpenSetup={onOpenSetup}
            voiceAvailable={voiceAvailable}
            onSuggest={(text) => setSeed({ text, at: Date.now() })}
          />
        ) : (
          <ol className="msgs">
            {messages.map((m) => (
              <Message
                key={m.id}
                m={m}
                versionLabel={m.versionId ? versionInfo.get(m.versionId)?.label : ''}
                versionStatus={m.versionId ? versionInfo.get(m.versionId)?.status : ''}
                speakingMessageId={speakingMessageId === m.id ? m.id : null}
                voiceAvailable={voiceAvailable}
                onListen={onListen}
                onSelectRef={onSelectRef}
                onPointTargets={onPointTargets}
                onOpenVersion={onOpenVersion}
                onRetry={onRetry}
              />
            ))}
            <Thinking turn={turn} transcribing={transcribing} />
          </ol>
        )}
        {messages.length === 0 && (turn.phase !== 'idle' || transcribing) && (
          <p className="empty-busy">
            <Loader2 size={13} className="spin" aria-hidden="true" /> Working…
          </p>
        )}
      </div>
      <Composer
        onSend={onSend}
        onInterrupt={onInterrupt}
        busy={busy}
        chatAvailable={chatAvailable}
        bridge={bridge}
        onClearSelection={onClearSelection}
        composerRef={composerRef}
        composerSeed={effectiveSeed}
        settings={settings}
        updateSettings={updateSettings}
      />
    </aside>
  );
}
