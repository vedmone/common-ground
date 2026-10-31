import { useState, useEffect } from 'react';
import { Code2, Sparkles, FilePlus2, Upload } from 'lucide-react';
import { Sheet } from './Feedback.jsx';
export default function PageEditor({
  mode,
  current,
  onClose,
  onCreate,
  onApply,
}) {
  const [tab, setTab] = useState(mode === 'new' ? 'brief' : 'html');
  const [name, setName] = useState('Untitled page'),
    [brief, setBrief] = useState(''),
    [source, setSource] = useState(mode === 'new' ? '' : current.html || ''),
    [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (mode !== 'new') setSource(current.html || '');
  }, [mode, current.id, current.html]);
  const submit = async () => {
    setSaving(true);
    try {
      if (mode === 'new')
        await onCreate({
          name,
          brief: tab === 'brief' ? brief : '',
          html: tab === 'html' ? source : '',
        });
      else await onApply(source);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet
      wide
      title={mode === 'new' ? 'Create a landing page' : 'HTML editor'}
      subtitle="Build on the call, start from a brief, or write the HTML yourself."
      onClose={onClose}
      footer={
        <div className="sheet-actions">
          <button className="btn btn-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={saving}
            onClick={submit}
          >
            {saving ? (
              'Applying…'
            ) : mode === 'new' ? (
              brief.trim() && tab === 'brief' ? (
                <>
                  <Sparkles size={14} />
                  Build landing page
                </>
              ) : (
                <>
                  <FilePlus2 size={14} />
                  Create page
                </>
              )
            ) : (
              <>
                <Code2 size={14} />
                Apply HTML
              </>
            )}
          </button>
        </div>
      }
    >
      {mode === 'new' && (
        <label className="editor-label">
          Page name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={70}
          />
        </label>
      )}
      <div className="tabs">
        <button
          className={tab === 'brief' ? 'is-on' : ''}
          onClick={() => setTab('brief')}
          disabled={mode !== 'new'}
        >
          <Sparkles size={14} />
          Describe the page
        </button>
        <button
          className={tab === 'html' ? 'is-on' : ''}
          onClick={() => setTab('html')}
        >
          <Code2 size={14} />
          HTML source
        </button>
      </div>
      {tab === 'brief' ? (
        <>
          <label className="editor-label">
            What are we making?
            <textarea
              className="page-brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              maxLength={5000}
              placeholder="A landing page for a pottery studio in Jaipur. Warm terracotta, editorial typography, workshop bookings, testimonials, and a simple final call to action."
            />
          </label>
          <p className="editor-note">
            Leave the brief empty for a fresh canvas, then describe the page to
            Ground on your voice call.
          </p>
        </>
      ) : (
        <>
          <label className="editor-label">
            Self-contained HTML and CSS
            <textarea
              spellCheck={false}
              className="html-editor"
              aria-label="HTML source editor"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              maxLength={180000}
            />
          </label>
          <label className="btn btn-quiet btn-sm editor-upload">
            <Upload size={13} />
            Import an HTML file
            <input
              type="file"
              accept=".html,.htm,text/html"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 180000) {
                  setError('Choose an HTML document under 180 KB.');
                  return;
                }
                setSource(await file.text());
                setError('');
              }}
            />
          </label>
          <p className="editor-note">
            Scripts and embedded frames are removed from preview documents.
            Applying HTML creates an undoable version.
          </p>
        </>
      )}
      {error && (
        <p className="editor-error" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}
