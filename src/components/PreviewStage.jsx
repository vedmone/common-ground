import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpToLine, ArrowDownToLine, X, MousePointer2, Hand, Monitor, Tablet, Smartphone, RotateCw, Search, Lock, Loader2, Plug, AlertTriangle } from 'lucide-react';
import { cx, clip } from '../lib/util.js';
import { CursorGlyph } from './Logo.jsx';

const VIEWPORTS = [
  { id: 'desktop', label: 'Desktop', icon: Monitor, width: null },
  { id: 'tablet', label: 'Tablet', icon: Tablet, width: 820 },
  { id: 'mobile', label: 'Mobile', icon: Smartphone, width: 390 },
];

/** The iframe never re-renders unless its source changes. */
const Frame = memo(function Frame({ iframeRef, srcDoc, src, nonce, title }) {
  if (src) {
    return <iframe key={`${src}#${nonce}`} ref={iframeRef} className="preview-frame" title={title} src={src} sandbox="allow-scripts allow-same-origin allow-forms" referrerPolicy="no-referrer" />;
  }
  return <iframe key={`doc#${nonce}`} ref={iframeRef} className="preview-frame" title={title} srcDoc={srcDoc} sandbox="allow-scripts" referrerPolicy="no-referrer" />;
});

function ElementFinder({ store, onSelect, onClose }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const rootRef = useRef(null);
  useEffect(() => {
    inputRef.current?.focus();
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [onClose]);
  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = store.elements.filter((e) => e.text || /^(section|header|nav|footer|main|form|img|svg|figure|article)$/.test(e.tag));
    return (needle ? list.filter((e) => `${e.kind} ${e.text} ${e.id} ${e.tag}`.toLowerCase().includes(needle)) : list).slice(0, 60);
  }, [q, store.elements]);
  return (
    <div className="finder" ref={rootRef} role="dialog" aria-label="Find an element">
      <div className="finder-search">
        <Search size={14} aria-hidden="true" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find an element by text or type"
          aria-label="Search elements"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && items[0]) {
              onSelect(items[0].id);
              onClose();
            }
          }}
        />
      </div>
      <ul className="finder-list">
        {items.length === 0 && <li className="finder-empty">No matching elements.</li>}
        {items.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => {
                onSelect(e.id);
                onClose();
              }}
            >
              <span className="finder-kind">{e.kind || e.tag}</span>
              <span className="finder-text">{clip(e.text || e.id, 60)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SelectionBar({ bridge, store, onSelect }) {
  const [finder, setFinder] = useState(false);
  const sel = bridge.selection;
  const hover = bridge.hover;
  return (
    <div className="selection-bar">
      {sel ? (
        <div className="sel-chip" role="status">
          <Lock size={12} aria-hidden="true" />
          <span className="sel-kind">{sel.kind || sel.tag}</span>
          <span className="sel-label">{clip(sel.label || sel.text || sel.id, 38)}</span>
          <span className="sel-tools">
            <button type="button" className="mini-btn" disabled={!sel.parentId} onClick={() => onSelect(sel.parentId)} title="Select parent element" aria-label="Select parent element">
              <ArrowUpToLine size={13} />
            </button>
            <button type="button" className="mini-btn" disabled={!sel.childId} onClick={() => onSelect(sel.childId)} title="Select first child element" aria-label="Select first child element">
              <ArrowDownToLine size={13} />
            </button>
            <button type="button" className="mini-btn" onClick={() => onSelect(null)} title="Clear selection (Esc)" aria-label="Clear selection">
              <X size={13} />
            </button>
          </span>
        </div>
      ) : (
        <div className="sel-hint" aria-live="off">
          {hover ? (
            <>
              <CursorGlyph who="you" size={11} />
              <span>
                Pointing at <b>{hover.kind}</b> {clip(hover.label, 30)}
              </span>
            </>
          ) : (
            <span>Hover to point · click to lock a selection</span>
          )}
        </div>
      )}
      <div className="finder-wrap">
        <button type="button" className={cx('mini-btn labeled', finder && 'is-on')} onClick={() => setFinder((f) => !f)} disabled={!bridge.ready} aria-expanded={finder}>
          <Search size={13} aria-hidden="true" />
          <span>Find</span>
        </button>
        {finder && <ElementFinder store={store} onSelect={(id) => onSelect(id, true)} onClose={() => setFinder(false)} />}
      </div>
    </div>
  );
}

export default function PreviewStage({
  iframeRef,
  srcDoc,
  companionSrc,
  previewNonce,
  isCompanion,
  companion,
  onOpenSetup,
  onReload,
  bridge,
  store,
  reviewMode,
  onReviewMode,
  onSelect,
  pointing,
  hintsVisible,
  onDismissHints,
  projectName,
  children,
}) {
  const [viewport, setViewport] = useState('desktop');
  const vp = VIEWPORTS.find((v) => v.id === viewport);
  const showFrame = isCompanion ? !!companionSrc : !!srcDoc;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (bridge.ready || !showFrame) return;
    const t = setTimeout(() => setSlow(true), isCompanion ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [bridge.ready, showFrame, isCompanion, srcDoc, companionSrc, previewNonce]);

  return (
    <div className="stage">
      <div className="stage-toolbar">
        <div className="stage-title">
          <span className={cx('live-dot', bridge.ready && 'is-live')} aria-hidden="true" />
          <span className="stage-name">{bridge.title || projectName}</span>
          {bridge.ready && <span className="stage-count">{bridge.count} elements mapped</span>}
        </div>
        <div className="stage-controls">
          <div className="seg" role="radiogroup" aria-label="Pointer mode">
            <button type="button" role="radio" aria-checked={reviewMode} className={cx(reviewMode && 'is-on')} onClick={() => onReviewMode(true)} title="Review: clicks select elements">
              <MousePointer2 size={13} aria-hidden="true" />
              <span>Review</span>
            </button>
            <button type="button" role="radio" aria-checked={!reviewMode} className={cx(!reviewMode && 'is-on')} onClick={() => onReviewMode(false)} title="Interact: use the page normally">
              <Hand size={13} aria-hidden="true" />
              <span>Interact</span>
            </button>
          </div>
          <div className="seg icons" role="radiogroup" aria-label="Viewport width">
            {VIEWPORTS.map((v) => (
              <button type="button" role="radio" aria-checked={viewport === v.id} key={v.id} className={cx(viewport === v.id && 'is-on')} onClick={() => setViewport(v.id)} title={v.label} aria-label={v.label}>
                <v.icon size={14} />
              </button>
            ))}
          </div>
          <button type="button" className="mini-btn" onClick={onReload} title="Reload preview" aria-label="Reload preview">
            <RotateCw size={14} />
          </button>
        </div>
      </div>

      <SelectionBar bridge={bridge} store={store} onSelect={onSelect} />

      <div className={cx('stage-canvas', vp.width && 'is-framed')}>
        <div className="frame-shell" style={vp.width ? { width: vp.width } : undefined}>
          {showFrame ? (
            <Frame iframeRef={iframeRef} srcDoc={srcDoc} src={companionSrc} nonce={previewNonce} title={`Preview of ${projectName}`} />
          ) : isCompanion ? (
            <CompanionEmpty companion={companion} onOpenSetup={onOpenSetup} />
          ) : (
            <div className="frame-empty">This version has no page source.</div>
          )}
          {showFrame && !bridge.ready && (
            <div className="frame-loading" role="status">
              <Loader2 size={16} className="spin" aria-hidden="true" />
              <span>{slow ? (isCompanion ? 'Still waiting for the preview bridge. Is your dev server running?' : 'Still loading the preview…') : 'Mapping the page…'}</span>
            </div>
          )}
          {pointing?.target && (
            <div className="pointing-chip" aria-hidden="true">
              <CursorGlyph who="ground" size={11} />
              Ground {pointing.tone === 'clarify' ? 'is checking' : pointing.tone === 'change' ? 'changed' : 'is pointing at'} <b>{clip(pointing.target.label, 34)}</b>
              {pointing.total > 1 && (
                <span className="pointing-count">
                  {pointing.index + 1}/{pointing.total}
                </span>
              )}
            </div>
          )}
        </div>
        {hintsVisible && showFrame && bridge.ready && (
          <div className="stage-hints" role="note">
            <span>
              <CursorGlyph who="you" size={12} /> Hover to point
            </span>
            <span>Click to lock</span>
            <span>
              <kbd>Esc</kbd> to clear
            </span>
            <span>
              <kbd>/</kbd> to type
            </span>
            <button type="button" className="mini-btn" onClick={onDismissHints} aria-label="Dismiss hints">
              <X size={12} />
            </button>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function CompanionEmpty({ companion, onOpenSetup }) {
  const error = companion.status === 'error';
  return (
    <div className="frame-empty companion-empty">
      <div className="empty-icon">{error ? <AlertTriangle size={22} /> : <Plug size={22} />}</div>
      <h3>{companion.status === 'connecting' ? 'Connecting to your companion…' : error ? 'The companion is not reachable' : 'Your project is not connected'}</h3>
      <p>{error ? companion.error : 'Run the Common Ground companion next to your project, then pair this studio with the token it prints. Nothing is shown here until a real connection is confirmed.'}</p>
      <button type="button" className="btn btn-primary" onClick={onOpenSetup}>
        Open setup
      </button>
    </div>
  );
}
