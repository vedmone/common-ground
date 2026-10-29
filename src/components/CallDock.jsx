import { useEffect, useRef } from 'react';
import { Mic, MicOff, PhoneOff, Phone, Volume2, VolumeX, Square, Send, Loader2, Keyboard } from 'lucide-react';
import { cx, clip } from '../lib/util.js';

/** One honest instruction line for the current microphone / turn state. */
function statusFor({ call, transcribing, thinking, speaking, handsFree, queued }) {
  if (call.muted) return { label: 'Your mic is muted', tone: 'muted' };
  if (call.state === 'hearing') return { label: 'Hearing you…', tone: 'you' };
  if (call.state === 'recording') return { label: 'Recording · tap Send when done', tone: 'you' };
  if (transcribing) return { label: 'Catching what you said…', tone: 'wait' };
  if (thinking) return { label: queued ? 'Ground will take your next point after this' : 'Ground is working on it', tone: 'wait' };
  if (speaking) return { label: 'Ground is talking · just speak to interrupt', tone: 'ground' };
  if (!handsFree) return { label: 'Tap Talk, then speak', tone: 'idle' };
  return { label: 'Just talk · Ground replies when you pause', tone: 'idle' };
}

/** The mic button carries a live level ring, driven straight from the analyser (no React render per frame). */
function useLevelRing(subscribe, active) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!active) {
      el.style.setProperty('--level', '0');
      return;
    }
    let smoothed = 0;
    return subscribe((level) => {
      smoothed = smoothed * 0.6 + level * 0.4;
      el.style.setProperty('--level', Math.min(1, smoothed * 2.2).toFixed(3));
    });
  }, [subscribe, active]);
  return ref;
}

function CtrlButton({ icon: Icon, label, className, iconSize = 18, ...rest }) {
  return (
    <button type="button" className={cx('cc-btn', className)} {...rest}>
      <span className="cc-icon">
        <Icon size={iconSize} aria-hidden="true" />
      </span>
      <span className="cc-text" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

export default function CallControls({ call, controls, handsFree, available, healthStatus, transcribing, thinking, speaking, queued, onInterrupt, onTranscript }) {
  const busy = transcribing || thinking || speaking;
  const micRef = useLevelRing(controls.subscribeLevel, call.active && !call.muted);

  if (!call.active) {
    const reason = !available ? (healthStatus === 'checking' ? 'Checking the voice service…' : healthStatus === 'error' ? 'The voice service is unreachable right now.' : 'Voice isn’t configured on this server.') : call.error;
    return (
      <div className="call-controls is-idle" role="region" aria-label="Join the voice call">
        <div className="cc-join-row">
          <button type="button" className="cc-join" onClick={controls.start} disabled={!available || call.connecting} aria-describedby="cc-join-note">
            {call.connecting ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Phone size={18} aria-hidden="true" />}
            <span>{call.connecting ? 'Joining…' : 'Join call'}</span>
          </button>
          {call.connecting && <button type="button" className="cc-cancel" onClick={controls.end}>Cancel</button>}
          {(thinking || speaking) && (
            <button type="button" className="cc-stop-round" onClick={onInterrupt} aria-label="Stop Ground" title="Stop Ground (Esc)">
              <Square size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="cc-join-foot">
          <span id="cc-join-note" className={cx('cc-note', reason && 'is-problem')} role={reason ? 'status' : undefined}>
            {call.connecting ? 'Allow the microphone when your browser asks.' : reason ? clip(reason, 110) : 'Your mic opens hands-free. Ground says hello first.'}
          </span>
          <button type="button" className="cc-type" onClick={onTranscript}>
            <Keyboard size={13} aria-hidden="true" />
            Type instead
          </button>
        </div>
      </div>
    );
  }

  const status = statusFor({ call, transcribing, thinking, speaking, handsFree, queued });
  const recording = call.state === 'recording';
  return (
    <div className={cx('call-controls is-live', `tone-${status.tone}`)} role="region" aria-label="Call controls">
      <div className="cc-status">
        <span className="cc-status-dot" aria-hidden="true" />
        <span className="cc-label" aria-live="polite">
          {status.label}
        </span>
        <div className="seg tiny cc-mode" role="radiogroup" aria-label="Turn taking">
          <button type="button" role="radio" aria-checked={handsFree} className={cx(handsFree && 'is-on')} onClick={() => controls.setHandsFree(true)} title="Hands-free: Ground replies when you pause">
            Hands-free
          </button>
          <button type="button" role="radio" aria-checked={!handsFree} className={cx(!handsFree && 'is-on')} onClick={() => controls.setHandsFree(false)} title="Tap to talk: you start and stop each turn">
            Tap to talk
          </button>
        </div>
      </div>
      {queued && (
        <p className="cc-queued" title={queued}>
          Up next: “{clip(queued, 48)}”
        </p>
      )}
      <div className="cc-buttons">
        <button
          type="button"
          ref={micRef}
          className={cx('cc-btn cc-mic', call.muted && 'is-off', call.state === 'hearing' && 'is-hearing')}
          onClick={controls.toggleMute}
          aria-pressed={call.muted}
          aria-label={call.muted ? 'Unmute microphone' : 'Mute microphone'}
          title={call.muted ? 'Unmute' : 'Mute'}
        >
          <span className="cc-icon">{call.muted ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}</span>
          <span className="cc-text" aria-hidden="true">
            {call.muted ? 'Unmute' : 'Mute'}
          </span>
        </button>
        {handsFree ? (
          <CtrlButton icon={Send} iconSize={16} label="Send now" onClick={controls.talk} disabled={call.muted || call.state !== 'hearing'} aria-label="Send now: stop listening and send what you said" title="Send what you said without waiting for a pause" />
        ) : (
          <CtrlButton
            icon={recording ? Send : Mic}
            iconSize={recording ? 16 : 18}
            label={recording ? 'Send' : 'Talk'}
            className={cx('cc-talk', recording && 'is-rec')}
            onClick={controls.talk}
            disabled={call.muted}
            aria-pressed={recording}
            aria-label={recording ? 'Stop recording and send' : 'Start talking'}
          />
        )}
        <CtrlButton
          icon={call.speakerMuted ? VolumeX : Volume2}
          label={call.speakerMuted ? 'Voice off' : 'Voice on'}
          className={cx(call.speakerMuted && 'is-off')}
          onClick={controls.toggleSpeaker}
          aria-pressed={call.speakerMuted}
          aria-label={call.speakerMuted ? 'Turn Ground’s voice back on' : 'Turn Ground’s voice off (captions only)'}
          title={call.speakerMuted ? 'Ground’s voice is off — captions only' : 'Ground’s voice is on'}
        />
        <CtrlButton icon={Square} iconSize={14} label="Stop" className="cc-stop" onClick={onInterrupt} disabled={!busy} aria-label="Stop Ground" title="Stop Ground (Esc)" />
        <CtrlButton icon={PhoneOff} label="Leave" className="cc-end" onClick={controls.end} aria-label="Leave the call" title="Leave the call" />
      </div>
    </div>
  );
}
