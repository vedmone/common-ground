import { useState } from 'react';
import { Globe, ExternalLink, Copy } from 'lucide-react';
import { Sheet } from './Feedback.jsx';
import { api } from '../lib/api.js';
import { copyText } from '../lib/util.js';
export default function PublishPanel({ project, current, onClose }) {
  const key = `commonground:publish:${project.id}`;
  const [publication, setPublication] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  });
  const [slug, setSlug] = useState(
    () =>
      project.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40) || 'my-page',
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false);
  const publish = async () => {
    setBusy(true);
    setError('');
    try {
      const identity = publication || {
        id: `${slug.replace(/^-|-$/g, '') || 'my-page'}-${crypto.randomUUID().slice(0, 8)}`,
        secret: [...crypto.getRandomValues(new Uint8Array(32))]
          .map((v) => v.toString(16).padStart(2, '0'))
          .join(''),
      };
      localStorage.setItem(key, JSON.stringify(identity));
      setPublication(identity);
      const result = await api.publish({ ...identity, html: current.html });
      const next = {
        ...identity,
        ...result,
        url: result.url || new URL(result.path, window.location.origin).href,
        versionId: current.id,
      };
      localStorage.setItem(key, JSON.stringify(next));
      setPublication(next);
    } catch (e) {
      setError(
        e.name === 'QuotaExceededError'
          ? 'Browser storage is full. Export or reduce saved versions before publishing so your update key can be saved.'
          : e.message,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      title="Publish your page"
      subtitle="A live link on Vercel, ready to share."
      onClose={onClose}
    >
      <p className="editor-note">
        Publish the page you’re currently viewing. You can keep editing and
        publish again to update the same address.
      </p>
      {!publication?.url && (
        <label className="editor-label">
          Page address
          <input
            disabled={!!publication?.id}
            value={slug}
            onChange={(e) =>
              setSlug(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/g, '')
                  .slice(0, 40),
              )
            }
            maxLength={40}
          />
          <small>
            A unique suffix keeps your address available. Your link will be on
            this site under /project/.
          </small>
        </label>
      )}
      {publication?.url && (
        <div className="publish-status">
          <b>
            {publication.versionId === current.id
              ? 'This version is published.'
              : 'A previous version is live.'}
          </b>
          <p className="publish-link">
            <a href={publication.url} target="_blank" rel="noreferrer">
              {publication.url}
            </a>
          </p>
          <p className="editor-note">
            Published {new Date(publication.publishedAt).toLocaleString()}
          </p>
          <button
            className="btn btn-quiet btn-sm"
            onClick={async () => setCopied(await copyText(publication.url))}
          >
            <Copy size={13} />
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <a
            className="btn btn-quiet btn-sm"
            target="_blank"
            rel="noreferrer"
            href={publication.url}
          >
            <ExternalLink size={13} />
            Open page
          </a>
        </div>
      )}
      <button
        className="btn btn-primary"
        disabled={busy || !current.html}
        onClick={publish}
      >
        <Globe size={14} />
        {busy
          ? 'Publishing…'
          : publication?.url
            ? 'Publish this version'
            : 'Publish page'}
      </button>
      {error && (
        <p role="alert" className="editor-error">
          {error}
        </p>
      )}
      <p className="editor-note">
        Publishing makes the HTML and its images publicly accessible. Keep this
        browser’s data to retain the key for updating your link.
      </p>
    </Sheet>
  );
}
