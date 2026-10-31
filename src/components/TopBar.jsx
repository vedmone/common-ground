import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Code2, History, HelpCircle, Plug, PlayCircle, RefreshCw, Laptop } from 'lucide-react';
import { LogoMark } from './Logo.jsx';
import { cx } from '../lib/util.js';

function StatusPill({ health, companion, onRetry }) {
  let tone = 'ok';
  let label = 'Voice ready';
  let detail = 'Conversation, listening and spoken replies are available.';
  if (health.status === 'checking') {
    tone = 'wait';
    label = 'Checking services';
    detail = 'Asking the server what is available…';
  } else if (health.status === 'error') {
    tone = 'bad';
    label = 'Server offline';
    detail = health.message;
  } else if (!health.chat) {
    tone = companion.status === 'connected' ? 'ok' : 'warn';
    label = companion.status === 'connected' ? 'Companion only' : 'AI not configured';
    detail = companion.status === 'connected' ? 'Using your local companion for AI.' : health.message || 'The server has no AI key.';
  } else if (!health.voice) {
    tone = 'warn';
    label = 'Text only';
    detail = 'Voice is unavailable on this server.';
  }
  return (
    <button type="button" className={cx('status-pill', `tone-${tone}`)} onClick={onRetry} title={`${detail} Click to re-check.`} aria-label={`${label}. ${detail} Re-check services.`}>
      <span className="status-dot" aria-hidden="true" />
      <span className="status-label">{label}</span>
      {health.status !== 'checking' && tone !== 'ok' && <RefreshCw size={12} aria-hidden="true" />}
    </button>
  );
}

function ProjectMenu({ project, projects, companion, onSwitch, onConnect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const connected = companion.status === 'connected';
  return (
    <div className="project-menu" ref={ref}>
      <button type="button" className="project-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="swatch" aria-hidden="true">
          {project.swatch.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </span>
        <span className="project-name">{project.name}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-label">Your pages &amp; examples</div>
          {projects.map((p) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={p.id === project.id}
              key={p.id}
              className={cx('menu-item', p.id === project.id && 'is-active')}
              onClick={() => {
                setOpen(false);
                onSwitch(p.id);
              }}
            >
              <span className="swatch" aria-hidden="true">
                {p.swatch.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              <span className="menu-text">
                <b>{p.name}</b>
                <small>{p.kind}</small>
              </span>
              {p.id === project.id && <Check size={14} aria-hidden="true" />}
            </button>
          ))}
          <div className="menu-sep" />
          {connected ? (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={project.id === 'companion'}
              className={cx('menu-item', project.id === 'companion' && 'is-active')}
              onClick={() => {
                setOpen(false);
                onSwitch('companion');
              }}
            >
              <span className="menu-icon">
                <Laptop size={15} />
              </span>
              <span className="menu-text">
                <b>{String(companion.info?.project || 'Local project')}</b>
                <small>Connected · via companion</small>
              </span>
              {project.id === 'companion' && <Check size={14} aria-hidden="true" />}
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              onConnect();
            }}
          >
            <span className="menu-icon">
              <Plug size={15} />
            </span>
            <span className="menu-text">
              <b>{connected ? 'Companion settings' : 'Connect your project'}</b>
              <small>{connected ? companion.info?.previewUrl : 'Local companion + Claude Code'}</small>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function TopBar({ project, projects, companion, onSwitch, onConnect, health, onRetryHealth, versionIndex, version, versionCount, panel, onPanel, onDemo, onHome, demoActive }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="brand" onClick={onHome} aria-label="Baatelier — show welcome">
          <LogoMark />
          <span>Baatelier</span>
        </button>
        <span className="topbar-divider" aria-hidden="true" />
        <ProjectMenu project={project} projects={projects} companion={companion} onSwitch={onSwitch} onConnect={onConnect} />
        <button type="button" className={cx('version-chip', `is-${version.status}`)} onClick={() => onPanel('history')} title="Version history" aria-label={`Version ${versionIndex} of ${versionCount}: ${version.summary}, ${version.status}. Open history.`}>
          <span className="v-num">v{versionIndex}</span>
          <span className="v-sum">{version.summary}</span>
          {version.status === 'pending' && <span className="v-flag">Review</span>}
        </button>
      </div>
      <nav className="topbar-right" aria-label="Studio">
        <StatusPill health={health} companion={companion} onRetry={onRetryHealth} />
        <button type="button" className={cx('ghost-btn', demoActive && 'is-on')} onClick={onDemo} title="Scripted demonstration — no AI calls">
          <PlayCircle size={16} aria-hidden="true" />
          <span className="hide-sm">Guided demo</span>
        </button>
        <button type="button" className={cx('icon-btn', panel === 'history' && 'is-on')} onClick={() => onPanel('history')} aria-label="Version history" title="Version history">
          <History size={17} />
        </button>
        <button type="button" className={cx('icon-btn', panel === 'source' && 'is-on')} onClick={() => onPanel('source')} aria-label="Source and changes" title="Source and changes">
          <Code2 size={17} />
        </button>
        <button type="button" className={cx('icon-btn', panel === 'setup' && 'is-on', companion.status === 'connected' && 'has-dot')} onClick={() => onPanel('setup')} aria-label="Setup and local companion" title="Setup and local companion">
          <Plug size={17} />
        </button>
        <button type="button" className={cx('icon-btn', panel === 'help' && 'is-on')} onClick={() => onPanel('help')} aria-label="Help" title="Help">
          <HelpCircle size={17} />
        </button>
      </nav>
    </header>
  );
}
