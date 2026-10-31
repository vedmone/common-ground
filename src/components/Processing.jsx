import { useEffect, useState } from 'react';
import {
  Loader2,
  Check,
  ChevronRight,
  X,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
const STEPS = [
  ['understanding', 'Understanding'],
  ['building', 'Building'],
  ['validating', 'Checking'],
  ['applying', 'Applying'],
];
export default function Processing({ turn, onStop }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const stage = turn.phase === 'thinking' ? 'understanding' : turn.phase,
    index = Math.max(
      0,
      STEPS.findIndex((s) => s[0] === stage),
    );
  return (
    <div className="processing-panel" role="status">
      <div className="processing-title">
        <Loader2 size={17} className="spin" />
        <b>{turn.label || 'Understanding your request'}</b>
        <time>{Math.max(0, Math.floor((now - turn.startedAt) / 1000))}s</time>
        <button onClick={onStop} aria-label="Stop processing">
          <X size={14} />
        </button>
      </div>
      <div className="processing-steps">
        {STEPS.map(([id, label], i) => (
          <span
            key={id}
            className={i === index ? 'is-current' : i < index ? 'is-done' : ''}
          >
            {i < index ? <Check size={11} /> : <i />}
            {label}
            {i < 3 && <ChevronRight size={11} />}
          </span>
        ))}
      </div>
      {turn.characters > 0 && (
        <p>
          {turn.characters.toLocaleString()} HTML characters generated
          {turn.variantsReady
            ? ` · ${turn.variantsReady}/2 directions ready`
            : ''}
        </p>
      )}
      {turn.reply && <p className="processing-reply">{turn.reply}</p>}
    </div>
  );
}
export function Walkthrough({
  walk,
  onNext,
  onPrevious,
  onToggle,
  onRepeat,
  onStop,
}) {
  const step = walk.targets[walk.index];
  const title =
    walk.mode === 'changes'
      ? 'Change walkthrough'
      : walk.mode === 'elements'
        ? 'Element explanations'
        : 'Page tour';
  return (
    <div className="walkthrough-bar" role="region" aria-label={title}>
      <div className="walkthrough-copy">
        <small>
          {title} · {walk.index + 1} of {walk.targets.length}
          {!walk.playing ? ' · Paused' : ''}
        </small>
        <b>{step.label}</b>
        <p aria-live="polite">
          {walk.error ||
            (walk.loading
              ? 'Preparing a spoken explanation…'
              : walk.narration || step.description)}
        </p>
        <span className="walkthrough-hint">
          Say “next”, “repeat that”, or ask a question. Your page tasks keep
          running.
        </span>
      </div>
      <div className="walkthrough-controls">
        <button
          onClick={onPrevious}
          disabled={walk.index === 0}
          aria-label="Previous tour element"
        >
          Back
        </button>
        <button
          className="icon-btn"
          onClick={onToggle}
          aria-label={walk.playing ? 'Pause tour' : 'Resume tour'}
        >
          {walk.playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button
          className="icon-btn"
          onClick={onRepeat}
          aria-label={walk.error ? 'Retry explanation' : 'Repeat explanation'}
        >
          <RotateCcw size={15} />
        </button>
        <button className="btn btn-primary btn-sm" onClick={onNext}>
          {walk.index === walk.targets.length - 1 ? 'Finish' : 'Next'}
        </button>
        <button className="icon-btn" onClick={onStop} aria-label="Stop tour">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

export function InterruptedWork({ work, onResume }) {
  return (
    <div
      className="processing-panel"
      role="status"
      aria-label="Interrupted build"
    >
      <div className="processing-title">
        <b>
          {work.state === 'failed'
            ? 'Build needs another try'
            : 'Build interrupted'}
        </b>
        <button className="btn btn-primary btn-sm" onClick={onResume}>
          Resume build
        </button>
      </div>
      <p>
        {work.error ||
          'The previous build stopped before it finished. Your original request is saved.'}
      </p>
      <p className="processing-reply" title={work.request}>
        {work.request.length > 240
          ? `${work.request.slice(0, 240)}…`
          : work.request}
      </p>
      {work.target?.label && <p>Selected element: {work.target.label}</p>}
    </div>
  );
}

export function PendingClarification({ work }) {
  return (
    <div
      className="processing-panel"
      role="status"
      aria-label="Waiting for details"
    >
      <div className="processing-title">
        <b>One detail before I build</b>
      </div>
      <p className="processing-reply">{work.question}</p>
      <p>Answer on the call to continue. Your original brief is saved.</p>
    </div>
  );
}
