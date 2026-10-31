import { useEffect, useRef, useState } from 'react';
import {
  Navigation,
  ChevronDown,
  Layers,
  GitCompareArrows,
} from 'lucide-react';
export default function ReviewMenu({ disabled, hasChanges, onReview }) {
  const [open, setOpen] = useState(false),
    ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const down = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const key = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  const choose = (mode) => {
    setOpen(false);
    onReview(mode);
  };
  return (
    <div className="review-menu" ref={ref}>
      <button
        className="btn btn-quiet btn-sm"
        disabled={disabled}
        onClick={() => choose('page')}
      >
        <Navigation size={14} />
        Tour page
      </button>
      <button
        className="icon-btn review-more"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-label="More walkthroughs"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu review-options" role="menu">
          <button role="menuitem" onClick={() => choose('elements')}>
            <Layers size={15} />
            <span>
              <b>Explain every element</b>
              <small>What it does, how it looks, and why</small>
            </span>
          </button>
          <button
            role="menuitem"
            disabled={!hasChanges}
            onClick={() => choose('changes')}
          >
            <GitCompareArrows size={15} />
            <span>
              <b>Explain latest changes</b>
              <small>Walk through this version’s change receipt</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
