import { useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff, Phone, Volume2, VolumeX, Square, Send, Loader2, Hand, Radio } from 'lucide-react';
import { cx, clip } from '../lib/util.js';

/** Five bars driven straight from the analyser level: no React render per audio frame. */
function LevelMeter({ subscribe, active }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!active) return;
    const bars = ref.current ? Array.from(ref.current.children) : [];
    let smoothed = 0;
    return subscribe((level) => {
      smoothed = smoothed * 0.6 + level * 0.4;
      bars.forEach((bar, i) => {
        const shape = [0.55, 0.8, 1, 0.8, 0.55][i];
        const h = Math.max(0.14, Math.min(1, smoothed * 1.8 * shape + 0.08 * Math.random()));
        bar.style.transform = `scaleY(${h.toFixed(3)})`;
      });
    });
  }, [subscribe, active]);
  return (
    <span className={cx('meter', active && 'is-active')} ref={ref} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function statusFor({ call, transcribing, thinking, speaking, handsFree }) {
  if (call.connecting) return { label: 'Asking for microphone…', tone: 'wait' };
  if (call.muted) return { label: 'Microphone muted', tone: 'muted' };
  if (call.state === 'hearing') return { label: 'Hearing you…', tone: 'you' };
  if (call.state === 'recording') return { label: 'Recording · tap send when done', tone: 'you' };
  if (transcribing) return { label: 'Transcribing…', tone: 'wait' };
  if (thinking) return { label: 'Ground is thinking…', tone: 'wait' };
  if (speaking) return { label: 'Ground is speaking', tone: 'ground' };
  if (!handsFree) return { label: 'Tap the mic to talk', tone: 'idle' };
  return { label: 'Listening · just talk', tone: 'idle' };
}

export default function CallDock({ call, controls, handsFree, available, healthStatus, transcribing, thinking, speaking, queued, onInterrupt }) {
  const busy = transcribing || thinking || speaking;

  if (!call.active) {
    const reason = !available ? (healthStatus === 'checking' ? 'Checking voice service…' : healthStatus === 'error' ? 'Voice service unreachable' : 'Voice not configured on this server') : call.error;
    return (
      <div className="dock is-idle" role="region" aria-label="Voice call">
        <button type="button" className="dock-start" onClick={controls.start} disabled={!available || call.connecting} aria-describedby={reason ? 'dock-reason' : undefined}>
          {call.connecting ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Phone size={16} aria-hidden="true" />}
          <span>{call.connecting ? 'Connecting…' : 'Start voice call'}</span>
        </button>
        {(thinking || speaking) && (
          <button type="button" className="dock-btn danger" onClick={onInterrupt} aria-label="Interrupt Ground" title="Interrupt (Esc)">
            <Square size={14} />
          </button>
        )}
        {reason ? (
          <span className="dock-reason" id="dock-reason">
            {clip(reason, 90)}
          </span>
        ) : (
          <span className="dock-reason subtle">Talk while you point. Ground answers out loud.</span>
        )}
      </div>
    );
  }

  const status = statusFor({ call, transcribing, thinking, speaking, handsFree });
  const recording = call.state === 'recording';
  return (
    <div className={cx('dock is-live', `tone-${status.tone}`)} role="region" aria-label="Voice call controls">
      <div className="dock-status" aria-live="polite">
        <LevelMeter subscribe={controls.subscribeLevel} active={!call.muted} />
        <span className="dock-label">{status.label}</span>
        {queued && <span className="dock-queued" title={queued}>Next: “{clip(queued, 26)}”</span>}
      </div>
      <div className="dock-controls">
        <div className="seg small" role="radiogroup" aria-label="Turn taking">
          <button type="button" role="radio" aria-checked={handsFree} className={cx(handsFree && 'is-on')} onClick={() => controls.setHandsFree(true)} title="Hands-free: Ground replies when you pause">
            <Radio size={13} aria-hidden="true" />
            <span>Hands-free</span>
          </button>
          <button type="button" role="radio" aria-checked={!handsFree} className={cx(!handsFree && 'is-on')} onClick={() => controls.setHandsFree(false)} title="Tap to talk: start and stop yourself">
            <Hand size={13} aria-hidden="true" />
            <span>Tap</span>
          </button>
        </div>
        {handsFree ? (
          <button type="button" className="dock-btn" onClick={controls.talk} disabled={call.muted || call.state !== 'hearing'} aria-label="Send now (stop listening and send what you said)" title="Send now">
            <Send size={15} />
          </button>
        ) : (
          <button type="button" className={cx('dock-btn talk', recording && 'is-rec')} onClick={controls.talk} disabled={call.muted} aria-label={recording ? 'Stop and send' : 'Start talking'} aria-pressed={recording}>
            {recording ? <Send size={15} /> : <Mic size={16} />}
          </button>
        )}
        <button type="button" className={cx('dock-btn', call.muted && 'is-warn')} onClick={controls.toggleMute} aria-pressed={call.muted} aria-label={call.muted ? 'Unmute microphone' : 'Mute microphone'} title={call.muted ? 'Unmute' : 'Mute'}>
          {call.muted ? <MicOff size={16} /> : <Mic size={16} />}
        </button>
        <button type="button" className={cx('dock-btn', call.speakerMuted && 'is-warn')} onClick={controls.toggleSpeaker} aria-pressed={call.speakerMuted} aria-label={call.speakerMuted ? 'Turn Ground’s voice on' : 'Turn Ground’s voice off'} title={call.speakerMuted ? 'Voice off' : 'Voice on'}>
          {call.speakerMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button type="button" className="dock-btn" onClick={onInterrupt} disabled={!busy} aria-label="Interrupt Ground" title="Interrupt (Esc)">
          <Square size={14} />
        </button>
        <button type="button" className="dock-btn end" onClick={controls.end} aria-label="End call" title="End call">
          <PhoneOff size={16} />
        </button>
      </div>
    </div>
  );
}
