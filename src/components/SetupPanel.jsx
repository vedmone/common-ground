import { useState } from 'react';
import { Plug, Unplug, Loader2, CheckCircle2, AlertTriangle, Copy, RefreshCw, KeyRound } from 'lucide-react';
import { Sheet } from './Feedback.jsx';
import { copyText, cx } from '../lib/util.js';

function Cmd({ children }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="cmd">
      <code>{children}</code>
      <button
        type="button"
        className="mini-btn"
        aria-label="Copy command"
        onClick={async () => {
          setCopied(await copyText(children));
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}

function ServiceRow({ label, ok, detail }) {
  return (
    <li className={cx('svc', ok ? 'is-ok' : 'is-off')}>
      <span className="svc-dot" aria-hidden="true" />
      <b>{label}</b>
      <span>{detail}</span>
    </li>
  );
}

export default function SetupPanel({ settings, updateSettings, companion, onConnect, onDisconnect, onOpenProject, isCompanion, health, onRetryHealth, onClose }) {
  const [showToken, setShowToken] = useState(false);
  const connected = companion.status === 'connected';
  const info = companion.info;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const needsOrigin = origin && !/^http:\/\/(127\.0\.0\.1|localhost):(4319|4320)$/.test(origin);

  return (
    <Sheet title="Setup" subtitle="Services on this server and your local companion" onClose={onClose}>
      <section className="setup-section">
        <div className="setup-head">
          <h3>This server</h3>
          <button type="button" className="mini-btn labeled" onClick={onRetryHealth}>
            <RefreshCw size={12} aria-hidden="true" /> Re-check
          </button>
        </div>
        <ul className="svc-list">
          <ServiceRow label="Reachable" ok={health.status === 'ok'} detail={health.status === 'checking' ? 'Checking…' : health.status === 'ok' ? 'Health check passed' : health.message} />
          <ServiceRow label="Conversation" ok={health.chat} detail={health.chat ? health.provider || 'Available' : 'No AI key configured'} />
          <ServiceRow label="Voice" ok={health.voice} detail={health.voice ? 'Transcription and speech available' : 'Unavailable; text still works'} />
        </ul>
      </section>

      <section className="setup-section">
        <div className="setup-head">
          <h3>Local companion</h3>
          <span className={cx('conn-badge', `is-${companion.status}`)}>
            {companion.status === 'connected' ? 'Connected' : companion.status === 'connecting' ? 'Connecting…' : companion.status === 'error' ? 'Not reachable' : 'Not connected'}
          </span>
        </div>
        <p className="setup-copy">
          Review your real app instead of an example. The companion runs on your machine, proxies your dev server into this studio with the pointer bridge, and asks Claude Code to edit your actual files.
        </p>

        <ol className="setup-steps">
          <li>
            <b>Get the companion</b> once. Download or clone the <a href="https://github.com/vedmone/common-ground" target="_blank" rel="noreferrer">Common Ground source</a>, then install it:
            <Cmd>{'git clone https://github.com/vedmone/common-ground.git\ncd common-ground\nnpm install\nnpm run build'}</Cmd>
            <small>Set SARVAM_API_KEY in the companion terminal for conversation and voice. The hosted studio already has its own voice connection.</small>
          </li>
          <li>
            <b>Start your app’s dev server</b> as usual (for example on port 5173).
          </li>
          <li>
            <b>Run the companion</b> from the Common Ground folder, pointing it at your project:
            <Cmd>npm run companion -- --project ~/code/my-app --preview http://localhost:5173</Cmd>
            <small>Without --preview it serves the project’s index.html directly. Claude Code must be installed and signed in for edits.</small>
          </li>
          {needsOrigin && (
            <li>
              <b>Allow this studio’s address.</b> This page is served from <code>{origin}</code>, so start the companion with:
              <Cmd>{`CG_ALLOWED_ORIGINS=${origin} npm run companion -- --project ~/code/my-app --preview http://localhost:5173`}</Cmd>
            </li>
          )}
          <li>
            <b>Paste the pairing token</b> printed in the companion terminal, then connect.
          </li>
        </ol>

        <div className="form-grid">
          <label className="field">
            <span>Companion address</span>
            <input type="url" value={settings.companionUrl} onChange={(e) => updateSettings({ companionUrl: e.target.value })} spellCheck={false} placeholder="http://127.0.0.1:4319" />
          </label>
          <label className="field">
            <span>
              <KeyRound size={12} aria-hidden="true" /> Pairing token
            </span>
            <div className="field-row">
              <input type={showToken ? 'text' : 'password'} value={settings.companionToken} onChange={(e) => updateSettings({ companionToken: e.target.value.trim() })} spellCheck={false} autoComplete="off" placeholder="Paste the token from the terminal" />
              <button type="button" className="mini-btn labeled" onClick={() => setShowToken((s) => !s)}>
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>
        </div>

        {companion.status === 'error' && (
          <div className="callout bad" role="alert">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{companion.error}</span>
          </div>
        )}

        {connected && info && (
          <div className="callout ok" role="status">
            <CheckCircle2 size={15} aria-hidden="true" />
            <div>
              <b>{String(info.project || 'Local project')}</b>
              {info.projectPath && <small className="mono">{String(info.projectPath)}</small>}
              <small>
                Preview: <span className="mono">{String(info.previewUrl)}</span>
                {info.ready === false ? ' · not ready yet' : ''}
                {info.busy ? ' · an edit is running' : ''}
              </small>
              <small>{info.chat ? `AI: ${info.provider || 'available'}` : 'The companion has no AI key; edits will fail until it is configured.'}</small>
            </div>
          </div>
        )}

        <div className="setup-actions">
          {connected ? (
            <>
              {!isCompanion && (
                <button type="button" className="btn btn-primary btn-sm" onClick={onOpenProject}>
                  Open local project
                </button>
              )}
              <button type="button" className="btn btn-quiet btn-sm" onClick={onConnect}>
                <RefreshCw size={14} aria-hidden="true" /> Re-check
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={onDisconnect}>
                <Unplug size={14} aria-hidden="true" /> Disconnect
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={onConnect} disabled={companion.status === 'connecting' || !settings.companionUrl}>
              {companion.status === 'connecting' ? <Loader2 size={14} className="spin" aria-hidden="true" /> : <Plug size={14} aria-hidden="true" />}
              {companion.status === 'connecting' ? 'Connecting…' : 'Connect'}
            </button>
          )}
        </div>
        <p className="setup-fine">The token is stored only in this browser. Safari may block a secure page from reaching http://127.0.0.1; use Chrome, or open the studio from the companion address itself.</p>
      </section>
    </Sheet>
  );
}
