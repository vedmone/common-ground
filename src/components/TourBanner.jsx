import { Pause, Play, SkipForward, X } from 'lucide-react';

export default function TourBanner({ step, total, caption, playing, controls, final, waiting }) {
  return (
    <div className="tour-banner" role="status" aria-live="polite">
      <span className="tour-tag">Scripted demonstration</span>
      <span className="tour-step">
        {waiting ? 'Loading' : `Step ${step + 1} of ${total}`}
      </span>
      <p className="tour-caption">{waiting ? 'Opening Saltmarsh Stays…' : caption}</p>
      <div className="tour-actions">
        {!final && (
          <>
            <button type="button" className="mini-btn" onClick={controls.toggle} aria-label={playing ? 'Pause demonstration' : 'Play demonstration'}>
              {playing ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button type="button" className="mini-btn" onClick={controls.next} aria-label="Next step" disabled={waiting}>
              <SkipForward size={13} />
            </button>
          </>
        )}
        <button type="button" className="mini-btn labeled" onClick={controls.exit}>
          {final ? 'Done' : <X size={13} aria-label="Exit demonstration" />}
        </button>
      </div>
    </div>
  );
}
