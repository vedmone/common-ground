import { useEffect, useRef, useState } from 'react';
import { Languages, MessageSquareText, Volume2, VolumeX, Lock, X, RotateCcw, MicOff, Mic } from 'lucide-react';
import CallControls from './CallDock.jsx';
import { CursorGlyph } from './Logo.jsx';
import { cx, clip } from '../lib/util.js';

const LANGUAGE_NAMES = { hinglish: 'Hindi + English', 'en-IN': 'English', 'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'gu-IN': 'Gujarati', 'kn-IN': 'Kannada', 'ml-IN': 'Malayalam', 'mr-IN': 'Marathi', 'od-IN': 'Odia', 'pa-IN': 'Punjabi', 'ta-IN': 'Tamil', 'te-IN': 'Telugu' };

/* ---------- small live pieces (each owns its own timer so the room doesn't re-render every second) ---------- */

function useSince(start, active) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active, start]);
  return active && start ? Math.max(0, Math.floor((now - start) / 1000)) : 0;
}

/** Mounted only while the call is live, so its start is the moment the call connected. */
function CallClock() {
  const [start] = useState(() => Date.now());
  const s = useSince(start, true);
  return (
    <time className="room-clock" aria-label={`On the call for ${Math.floor(s / 60)} minutes ${s % 60} seconds`}>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}
    </time>
  );
}

function Elapsed({ since }) {
  const s = useSince(since, !!since);
  return s >= 8 ? <span className="cap-elapsed">{s}s</span> : null;
}

/** Live mic bars for the self-view, driven from the analyser without React renders. */
function MicBars({ subscribe, active }) {
  const ref = useRef(null);
  useEffect(() => {
    const bars = ref.current ? Array.from(ref.current.children) : [];
    if (!active) {
      bars.forEach((b) => (b.style.transform = ''));
      return;
    }
    let smoothed = 0;
    return subscribe((level) => {
      smoothed = smoothed * 0.55 + level * 0.45;
      bars.forEach((bar, i) => {
        const shape = [0.6, 1, 0.75][i];
        bar.style.transform = `scaleY(${Math.max(0.18, Math.min(1, smoothed * 2.4 * shape)).toFixed(3)})`;
      });
    });
  }, [subscribe, active]);
  return (
    <span className={cx('mic-bars', active && 'is-active')} ref={ref} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

/* ---------- participants ---------- */

function groundState({ call, turn, transcribing, speaking, voiceAvailable, healthStatus }) {
  if (call.connecting) return { key: 'connecting', label: 'Joining the call…' };
  if (turn.phase === 'applying') return { key: 'thinking', label: 'Applying the change to the page' };
  if (turn.phase !== 'idle') return { key: 'thinking', label: turn.label || 'Thinking it through' };
  if (speaking) return { key: 'speaking', label: 'Speaking' };
  if (transcribing) return { key: 'listening', label: 'Listening closely' };
  if (call.active) return { key: 'listening', label: call.speakerMuted ? 'Listening · voice off, captions on' : 'Listening' };
  if (!voiceAvailable) return { key: 'away', label: healthStatus === 'checking' ? 'Connecting…' : 'Voice unavailable' };
  return { key: 'ready', label: 'Ready when you are' };
}

function GroundTile({ state, pointing }) {
  const tone = pointing?.tone;
  return (
    <div className={cx('tile-ground', `is-${state.key}`)}>
      <div className="g-avatar" aria-hidden="true">
        <span className="g-ring" />
        <span className="g-face">G</span>
      </div>
      <div className="g-text">
        <div className="g-name">
          <b>Ground</b>
          {state.key === 'speaking' && (
            <span className="g-eq" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
        <p className="g-state" role="status">
          {state.label}
        </p>
        {pointing?.target && (
          <p className="g-attn">
            <CursorGlyph who="ground" size={10} />
            <span>
              {tone === 'clarify' ? 'Asking about' : tone === 'change' ? 'Showing' : 'Pointing at'} <b>{clip(pointing.target.label, 46)}</b>
            </span>
            {pointing.total > 1 && (
              <span className="g-count">
                {pointing.index + 1}/{pointing.total}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function SelfView({ call, handsFree, controls, reference, locked, onClearSelection }) {
  const state = !call.active ? 'Not in the call' : call.muted ? 'Muted' : call.state === 'hearing' ? 'Speaking' : call.state === 'recording' ? 'Recording' : handsFree ? 'Mic on' : 'Tap to talk';
  return (
    <div className={cx('tile-you', call.active && 'is-live', call.state === 'hearing' && 'is-hearing', call.muted && 'is-muted')}>
      <span className="y-avatar" aria-hidden="true">
        {call.active && !call.muted ? <MicBars subscribe={controls.subscribeLevel} active /> : call.muted ? <MicOff size={13} /> : <Mic size={13} />}
      </span>
      <span className="y-who">
        <b>You</b>
        <small>{state}</small>
      </span>
      {reference ? (
        <span className={cx('y-ref', locked && 'is-locked')} title={locked ? 'Locked selection' : 'Where you are pointing'}>
          {locked ? <Lock size={11} aria-hidden="true" /> : <CursorGlyph who="you" size={10} />}
          <span className="y-ref-kind">{reference.kind || reference.tag}</span>
          <span className="y-ref-label">{clip(reference.label || reference.text || '', 40)}</span>
          {locked && (
            <button type="button" onClick={onClearSelection} aria-label="Clear locked selection" title="Clear selection (Esc)">
              <X size={11} />
            </button>
          )}
        </span>
      ) : (
        <span className="y-ref is-empty">Point at the page</span>
      )}
    </div>
  );
}

/* ---------- captions ---------- */

function captionItems(messages) {
  let lastUser = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUser = i;
      break;
    }
  }
  const after = messages.slice(lastUser + 1).filter((m) => m.role === 'assistant' || m.role === 'note');
  return [...(lastUser >= 0 ? [messages[lastUser]] : []), ...after.slice(-3)];
}

const EXAMPLES = ['“Isme vibe nahi aa rahi.”', '“Can this feel a bit warmer?”', '“Not that one — the button below.”'];

function Captions({ messages, turn, transcribing, call, voiceAvailable, speakingMessageId, onListen, onRetry, onPointTargets, onSelectRef }) {
  const items = captionItems(messages);
  const scrollRef = useRef(null);
  const last = items[items.length - 1];
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [last?.id, last?.content, transcribing, turn.phase]);

  if (!items.length && !transcribing && turn.phase === 'idle') {
    return (
      <div className="captions is-empty" ref={scrollRef}>
        <p className="cap-invite">
          Point at something.
          <br />
          Tell me what feels off.
        </p>
        <p className="cap-invite-sub">You don’t need the perfect words. Speak the way you would to a colleague. Your language is detected automatically.</p>
        <ul className="cap-examples" aria-label="Things you could say">
          {EXAMPLES.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="captions" ref={scrollRef} aria-live="polite" aria-label="Live captions">
      {items.map((m) => {
        if (m.role === 'user') {
          return (
            <div key={m.id} className="cap cap-you">
              <span className="cap-who">You{m.via === 'text' && <small> · typed</small>}</span>
              <p>{m.content}</p>
              {m.ref && (
                <button type="button" className="cap-ref you" onClick={() => onSelectRef(m.ref.id)} title="Select this element again">
                  {m.ref.locked ? <Lock size={10} aria-hidden="true" /> : <CursorGlyph who="you" size={9} />}
                  {m.ref.kind || m.ref.tag || 'Element'} · {clip(m.ref.label || m.ref.id, 30)}
                </button>
              )}
            </div>
          );
        }
        if (m.role === 'note') {
          return (
            <div key={m.id} className={cx('cap cap-note', m.tone === 'error' && 'is-error')} role={m.tone === 'error' ? 'alert' : undefined}>
              <p>{m.content}</p>
              {m.tone === 'error' && <small>Your latest preview is still available.</small>}
              {m.retry && (
                <button type="button" className="cap-retry" onClick={() => onRetry(m)}>
                  <RotateCcw size={12} aria-hidden="true" /> Try again
                </button>
              )}
            </div>
          );
        }
        const tone = m.action === 'clarify' ? 'clarify' : m.action === 'edit' ? 'change' : 'point';
        const playing = speakingMessageId === m.id;
        return (
          <div key={m.id} className={cx('cap cap-ground', m.action === 'clarify' && 'is-clarify')}>
            <span className="cap-who">
              Ground
              {m.scripted && <small className="cap-tag">Guided demo · scripted</small>}
              {voiceAvailable && !m.scripted && (
                <button type="button" className="cap-listen" onClick={() => onListen(m)} aria-label={playing ? 'Stop reading this reply' : 'Hear this reply again'} title={playing ? 'Stop' : 'Hear it again'}>
                  {playing ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>
              )}
            </span>
            <p>{m.content}</p>
            {m.targets?.length > 0 && (
              <div className="cap-targets">
                {m.action === 'clarify' && <span className="cap-lead">Which one?</span>}
                {m.targets.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className="cap-ref ground"
                    onClick={() => {
                      if (m.action === 'clarify') onSelectRef(t.id);
                      onPointTargets([t], tone);
                    }}
                    title={m.action === 'clarify' ? 'Lock this one' : 'Show me again'}
                  >
                    <CursorGlyph who="ground" size={9} />
                    {clip(t.label || t.id, 34)}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {transcribing && (
        <div className="cap cap-you is-pending">
          <span className="cap-who">You</span>
          <p className="cap-wait">
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Catching what you said
          </p>
        </div>
      )}
      {turn.phase !== 'idle' && (
        <div className="cap cap-ground is-pending">
          <span className="cap-who">Ground</span>
          <p className="cap-wait">
            <span className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {turn.label || (turn.phase === 'applying' ? 'Loading the new version into the page' : 'Thinking')}
            <Elapsed since={turn.startedAt} />
          </p>
          {turn.reply&&<p className="live-reply">{turn.reply}</p>}
        </div>
      )}
      {!call.active && items.length > 0 && turn.phase === 'idle' && !transcribing && <p className="cap-paused">Captions from your last exchange. Join the call to keep talking.</p>}
    </div>
  );
}

/* ---------- the room ---------- */

export default function VoiceRoom({
  call,
  controls,
  handsFree,
  queued,
  turn,
  transcribing,
  speaking,
  speakingMessageId,
  messages,
  pointing,
  bridge,
  detectedLanguage,
  voiceAvailable,
  health,
  onTranscript,
  onListen,
  onRetry,
  onInterrupt,
  onClearSelection,
  onSelectRef,
  onPointTargets,
}) {
  const thinking = turn.phase !== 'idle';
  const gState = groundState({ call, turn, transcribing, speaking, voiceAvailable, healthStatus: health.status });
  const reference = bridge.selection || bridge.hover;
  const language = detectedLanguage ? LANGUAGE_NAMES[detectedLanguage] || detectedLanguage : '';
  const live = call.active;

  return (
    <aside className={cx('voice-room', live && 'is-live')} aria-label="Voice call with Ground">
      <header className="room-head">
        <span className={cx('room-live', live && 'is-on')}>
          <span className="room-live-dot" aria-hidden="true" />
          {live ? (
            <>
              On call <CallClock />
            </>
          ) : call.connecting ? (
            'Connecting…'
          ) : (
            'Review call'
          )}
        </span>
        <span className="lang-chip" title="Ground follows the way you speak, including Hindi-English mix. Short commands keep your conversation’s language.">
          <Languages size={13} aria-hidden="true" />
          <span>{language || 'Your language'}</span>
          <small>{language ? 'detected' : 'auto'}</small>
        </span>
        <button type="button" className="room-transcript" onClick={onTranscript} aria-label="Open the full transcript and keyboard input" title="Transcript & keyboard ( / )">
          <MessageSquareText size={15} aria-hidden="true" />
          <span>Transcript</span>
        </button>
      </header>

      <div className="room-people">
        <GroundTile state={gState} pointing={pointing} />
        <SelfView call={call} handsFree={handsFree} controls={controls} reference={reference} locked={!!bridge.selection} onClearSelection={onClearSelection} />
      </div>

      <Captions
        messages={messages}
        turn={turn}
        transcribing={transcribing}
        call={call}
        voiceAvailable={voiceAvailable}
        speakingMessageId={speakingMessageId}
        onListen={onListen}
        onRetry={onRetry}
        onPointTargets={onPointTargets}
        onSelectRef={onSelectRef}
      />

      <CallControls
        call={call}
        controls={controls}
        handsFree={handsFree}
        available={voiceAvailable}
        healthStatus={health.status}
        transcribing={transcribing}
        thinking={thinking}
        speaking={speaking}
        queued={queued}
        onInterrupt={onInterrupt}
        onTranscript={onTranscript}
      />
    </aside>
  );
}
