import { useMemo, useState } from 'react';
import { Copy, Download, FileCode2, GitCompareArrows, Eye, EyeOff } from 'lucide-react';
import { Sheet } from './Feedback.jsx';
import { diffLines, hunks, unifiedText } from '../lib/diff.js';
import { stripReviewIds } from '../lib/html.js';
import { copyText, downloadFile, fileSlug, cx } from '../lib/util.js';

function DiffView({ before, after }) {
  const diff = useMemo(() => diffLines(before, after), [before, after]);
  const { hunks: hs, trailing } = useMemo(() => hunks(diff, 3), [diff]);
  if (!diff.added && !diff.removed) return <p className="diff-none">No textual differences.</p>;
  return (
    <div className="diff">
      <div className="diff-stats">
        <span className="add">+{diff.added}</span>
        <span className="del">−{diff.removed}</span>
        <span>lines</span>
      </div>
      <div className="code-scroll">
        <table className="code-table">
          <tbody>
            {hs.map((h, hi) => (
              <HunkRows key={hi} hunk={h} />
            ))}
            {trailing > 0 && (
              <tr className="skip">
                <td colSpan={3}>⋯ {trailing} unchanged lines</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HunkRows({ hunk }) {
  return (
    <>
      {hunk.skippedBefore > 0 && (
        <tr className="skip">
          <td colSpan={3}>⋯ {hunk.skippedBefore} unchanged lines</td>
        </tr>
      )}
      {hunk.lines.map((l, i) => (
        <tr key={i} className={l.type}>
          <td className="ln">{l.type === 'add' ? '' : l.aNo}</td>
          <td className="ln">{l.type === 'del' ? '' : l.bNo}</td>
          <td className="tx">
            <span className="sig">{l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}</span>
            {l.text || ' '}
          </td>
        </tr>
      ))}
    </>
  );
}

function SourceView({ html }) {
  const lines = useMemo(() => html.split('\n'), [html]);
  return (
    <div className="code-scroll">
      <table className="code-table source">
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="ln">{i + 1}</td>
              <td className="tx">{l || ' '}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SourceDrawer({ session, project, current, onClose, toast }) {
  const [tab, setTab] = useState(current.parentId ? 'changes' : 'source');
  const [showIds, setShowIds] = useState(false);
  const index = session.versions.findIndex((v) => v.id === current.id) + 1;
  const parent = session.versions.find((v) => v.id === current.parentId);
  const parentIndex = parent ? session.versions.indexOf(parent) + 1 : 0;
  const clean = useMemo(() => stripReviewIds(current.html || ''), [current.html]);
  const shown = showIds ? current.html || '' : clean;
  const files = current.sourceChanges || [];
  const [fileIdx, setFileIdx] = useState(0);
  const name = `${fileSlug(project.name)}-v${index}`;

  const diffText = () => (parent?.html && current.html ? unifiedText(diffLines(stripReviewIds(parent.html), clean), `v${parentIndex}.html`, `v${index}.html`) : files.map((f) => unifiedText(diffLines(f.before, f.after), f.file, f.file)).join('\n\n'));

  return (
    <Sheet
      wide
      title="Source"
      subtitle={`v${index} · ${current.summary}${parent ? ` — compared with v${parentIndex}` : ''}`}
      onClose={onClose}
      footer={
        <div className="sheet-actions">
          <button type="button" className="btn btn-quiet btn-sm" disabled={!shown} onClick={async () => toast((await copyText(shown)) ? 'Source copied.' : 'Copy failed.', 'success', 2000)}>
            <Copy size={14} aria-hidden="true" /> Copy HTML
          </button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={!parent && !files.length} onClick={() => downloadFile(`${name}.diff`, diffText(), 'text/x-diff')}>
            <GitCompareArrows size={14} aria-hidden="true" /> Download diff
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={!clean} onClick={() => downloadFile(`${name}.html`, clean, 'text/html')}>
            <Download size={14} aria-hidden="true" /> Download .html
          </button>
        </div>
      }
    >
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'changes'} className={cx(tab === 'changes' && 'is-on')} onClick={() => setTab('changes')}>
          <GitCompareArrows size={14} aria-hidden="true" /> Changes
        </button>
        <button type="button" role="tab" aria-selected={tab === 'source'} className={cx(tab === 'source' && 'is-on')} onClick={() => setTab('source')}>
          <FileCode2 size={14} aria-hidden="true" /> Full source
        </button>
        {tab === 'source' && current.html && (
          <button type="button" className="mini-btn labeled push" onClick={() => setShowIds((s) => !s)} aria-pressed={showIds}>
            {showIds ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
            {showIds ? 'Hide review ids' : 'Show review ids'}
          </button>
        )}
      </div>

      {tab === 'changes' &&
        (files.length ? (
          <>
            <div className="file-tabs">
              {files.map((f, i) => (
                <button type="button" key={f.file} className={cx(i === fileIdx && 'is-on')} onClick={() => setFileIdx(i)}>
                  {f.file}
                </button>
              ))}
            </div>
            <DiffView before={files[fileIdx]?.before || ''} after={files[fileIdx]?.after || ''} />
          </>
        ) : parent?.html && current.html ? (
          <>
            {current.changes?.length > 0 && (
              <ul className="change-list">
                {current.changes.map((c, i) => (
                  <li key={i}>
                    <span>{c.description || 'Change'}</span>
                    {c.id && <code>{c.id}</code>}
                  </li>
                ))}
              </ul>
            )}
            <DiffView before={stripReviewIds(parent.html)} after={clean} />
          </>
        ) : (
          <div className="panel-empty">
            <h3>No changes yet</h3>
            <p>This is the original version. When Baat edits the page, the exact before-and-after appears here.</p>
          </div>
        ))}
      {tab === 'source' &&
        (shown ? (
          <SourceView html={shown} />
        ) : (
          <div className="panel-empty">
            <h3>Source lives in your project</h3>
            <p>Connected projects are edited in your real files by Claude Code. File-level diffs appear under Changes after each edit.</p>
          </div>
        ))}
    </Sheet>
  );
}
