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

/** What "this" currently means: the locked selection, else the live hover, else how to point. */
function Referent({ bridge, onSelect, reviewMode, hintsVisible }) {
  const sel = bridge.selection;
  const hover = bridge.hover;
  if (sel) {
    return (
      <div className="sel-chip" role="status">
        <Lock size={12} aria-hidden="true" />
        <span className="sel-who">You · locked</span>
        <span className="sel-kind">{sel.kind || sel.tag}</span>
        <span className="sel-label">{clip(sel.label || sel.text || sel.id, 40)}</span>
        <span className="sel-tools">
          <button type="button" className="mini-btn" disabled={!sel.parentId} onClick={() => onSelect(sel.parentId)} title="Widen to the parent element" aria-label="Select parent element">
            <ArrowUpToLine size={13} />
          </button>
          <button type="button" className="mini-btn" disabled={!sel.childId} onClick={() => onSelect(sel.childId)} title="Narrow to the first child element" aria-label="Select first child element">
            <ArrowDownToLine size={13} />
          </button>
          <button type="button" className="mini-btn" onClick={() => onSelect(null)} title="Clear selection (Esc)" aria-label="Clear selection">
            <X size={13} />
          </button>
        </span>
      </div>
    );
  }
  if (hover && reviewMode) {
    return (
      <div className="sel-hover" aria-live="off">
        <CursorGlyph who="you" size={11} />
        <span className="sel-who">You</span>
        <span className="sel-kind">{hover.kind || hover.tag}</span>
        <span className="sel-label">{clip(hover.label || hover.text, 40)}</span>
        <span className="sel-cue">click to lock</span>
      </div>
    );
  }
  if (!reviewMode) return <div className="sel-hint">Interact mode · the page behaves normally. Switch to Review to point.</div>;
  return (
    <div className="sel-hint">
      <CursorGlyph who="you" size={11} />
      <span>
        Hover to point · click to lock{hintsVisible ? <> · <kbd>Esc</kbd> clears</> : null}
      </span>
    </div>
  );
}

function Finder({ bridge, store, onSelect }) {
  const [finder, setFinder] = useState(false);
  return (
    <div className="finder-wrap">
      <button type="button" className={cx('mini-btn labeled', finder && 'is-on')} onClick={() => setFinder((f) => !f)} disabled={!bridge.ready} aria-expanded={finder} title="Find an element by name" aria-label="Find an element">
        <Search size={13} aria-hidden="true" />
        <span className="hide-xs">Find</span>
      </button>
      {finder && <ElementFinder store={store} onSelect={(id) => onSelect(id, true)} onClose={() => setFinder(false)} />}
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
  hintsVisible,
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
        <div className="stage-referent" title={bridge.ready ? `${bridge.title || projectName} · ${bridge.count} elements mapped` : undefined}>
          <span className={cx('live-dot', bridge.ready && 'is-live')} aria-hidden="true" />
          <Referent bridge={bridge} onSelect={onSelect} reviewMode={reviewMode} hintsVisible={hintsVisible} />
        </div>
        <div className="stage-controls">
          <Finder bridge={bridge} store={store} onSelect={onSelect} />
          <div className="seg" role="radiogroup" aria-label="Pointer mode">
            <button type="button" role="radio" aria-checked={reviewMode} className={cx(reviewMode && 'is-on')} onClick={() => onReviewMode(true)} title="Review: hover points, click locks an element" aria-label="Review">
              <MousePointer2 size={13} aria-hidden="true" />
              <span className="seg-text">Review</span>
            </button>
            <button type="button" role="radio" aria-checked={!reviewMode} className={cx(!reviewMode && 'is-on')} onClick={() => onReviewMode(false)} title="Interact: use the page normally" aria-label="Interact">
              <Hand size={13} aria-hidden="true" />
              <span className="seg-text">Interact</span>
            </button>
          </div>
          <div className="seg icons stage-viewports" role="radiogroup" aria-label="Viewport width">
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
        </div>
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
