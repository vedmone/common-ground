import { Check, Undo2, PenLine, GitCompareArrows, Navigation } from 'lucide-react';
import { clip } from '../lib/util.js';

export default function ActionBar({ version, index, callActive, onKeep, onUndo, onRefine, onShowChanges, onTour }) {
  const count = version.changes?.length || version.sourceChanges?.length || 0;
  const where = version.origin === 'companion' ? 'Applied to your local files' : version.origin === 'demo' ? 'Scripted demo edit' : 'Live on the page';
  return (
    <div className="action-bar" role="region" aria-label={`Review version ${index}`}>
      <div className="ab-info">
        <span className="ab-badge" aria-hidden="true">
          v{index}
        </span>
        <div className="ab-text">
          <b title={version.summary}>{clip(version.summary, 60)}</b>
          <small>
            {where}
            {count ? ` · ${count} change${count > 1 ? 's' : ''}` : ''}
            {callActive && <span className="ab-say"> · say “keep it” or “undo”</span>}
          </small>
        </div>
      </div>
      <div className="ab-actions">
        {version.changes?.length > 0 && (
          <button type="button" className="btn btn-quiet btn-sm ab-secondary" onClick={onTour} title="Baat points at each change again">
            <Navigation size={14} aria-hidden="true" />
            <span className="hide-sm">Explain</span>
          </button>
        )}
        <button type="button" className="btn btn-quiet btn-sm ab-secondary" onClick={onShowChanges} title="See the exact before/after source">
          <GitCompareArrows size={14} aria-hidden="true" />
          <span className="hide-sm">Diff</span>
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onRefine} title={callActive ? 'Tell Baat what to adjust' : 'Join the call and tell Baat what to adjust'}>
          <PenLine size={14} aria-hidden="true" />
          <span>Refine</span>
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onUndo}>
          <Undo2 size={14} aria-hidden="true" />
          <span>Undo</span>
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onKeep}>
          <Check size={14} aria-hidden="true" />
          <span>Keep</span>
        </button>
      </div>
    </div>
  );
}
