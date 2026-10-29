import { useEffect, useRef } from 'react';
import { X, CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { cx } from '../lib/util.js';

export function Toasts({ toasts, onDismiss }) {
  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => (
        <div key={t.id} className={cx('toast', `tone-${t.tone}`)} role={t.tone === 'error' ? 'alert' : 'status'}>
          {t.tone === 'success' ? <CheckCircle2 size={15} aria-hidden="true" /> : t.tone === 'error' ? <AlertCircle size={15} aria-hidden="true" /> : <Info size={15} aria-hidden="true" />}
          <span>{t.message}</span>
          <button type="button" className="mini-btn" onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog({ title, body, confirmLabel = 'Confirm', onConfirm, onClose }) {
  const cancelRef = useRef(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body">
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-body">{body}</p>
        <div className="dialog-actions">
          <button type="button" ref={cancelRef} className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Right-side sheet used by Source, History, Setup and Help. */
export function Sheet({ title, subtitle, onClose, children, wide, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [onClose]);
  return (
    <aside className={cx('sheet', wide && 'is-wide')} role="dialog" aria-modal="false" aria-labelledby="sheet-title" tabIndex={-1} ref={ref}>
      <header className="sheet-head">
        <div>
          <h2 id="sheet-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel">
          <X size={17} />
        </button>
      </header>
      <div className="sheet-body">{children}</div>
      {footer && <footer className="sheet-foot">{footer}</footer>}
    </aside>
  );
}
