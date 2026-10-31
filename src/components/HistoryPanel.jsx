import { Undo2, RotateCcw, Code2, Download, Trash2 } from 'lucide-react';
import { Sheet } from './Feedback.jsx';
import { cx, relativeTime, downloadFile, fileSlug } from '../lib/util.js';
import { exportJSON, exportMarkdown } from '../lib/export.js';

const STATUS = { base: 'Original', pending: 'In review', kept: 'Kept', undone: 'Undone' };

export default function HistoryPanel({ session, onClose, onRestore, onUndo, onShowSource, onReset, project }) {
  const current = session.versions.find((v) => v.id === session.currentVersionId);
  const list = session.versions.map((v, i) => ({ v, n: i + 1 })).reverse();
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <Sheet
      title="Version history"
      subtitle={`${session.versions.length} version${session.versions.length === 1 ? '' : 's'} saved on this device`}
      onClose={onClose}
      footer={
        <div className="sheet-actions">
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => downloadFile(`${fileSlug(project.name)}-session-${stamp}.md`, exportMarkdown(session, project), 'text/markdown')}>
            <Download size={14} aria-hidden="true" /> Markdown
          </button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => downloadFile(`${fileSlug(project.name)}-session-${stamp}.json`, exportJSON(session, project), 'application/json')}>
            <Download size={14} aria-hidden="true" /> JSON
          </button>
          <button type="button" className="btn btn-quiet btn-sm danger-text" onClick={onReset}>
            <Trash2 size={14} aria-hidden="true" /> Reset
          </button>
        </div>
      }
    >
      <div className="history-top">
        <button type="button" className="btn btn-outline btn-sm" onClick={onUndo} disabled={!current?.parentId}>
          <Undo2 size={14} aria-hidden="true" /> Undo current version
        </button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={onShowSource}>
          <Code2 size={14} aria-hidden="true" /> View changes
        </button>
      </div>
      <ol className="timeline">
        {list.map(({ v, n }) => {
          const isCurrent = v.id === session.currentVersionId;
          return (
            <li key={v.id} className={cx('tl-item', `is-${v.status}`, isCurrent && 'is-current')}>
              <span className="tl-dot" aria-hidden="true" />
              <div className="tl-body">
                <div className="tl-head">
                  <b>v{n}</b>
                  <span className="tl-sum">{v.summary}</span>
                </div>
                <div className="tl-meta">
                  <span className={cx('tl-status', `s-${v.status}`)}>{STATUS[v.status]}</span>
                  <span>{v.origin === 'demo' ? 'Scripted demo' : v.origin === 'companion' ? 'Claude Code' : v.origin === 'sample' ? 'Example' : v.provider || 'Baat'}</span>
                  <span>{relativeTime(v.createdAt)}</span>
                </div>
                {v.changes?.length > 0 && (
                  <ul className="tl-changes">
                    {v.changes.slice(0, 3).map((c, i) => (
                      <li key={i}>{c.description}</li>
                    ))}
                  </ul>
                )}
              </div>
              {isCurrent ? (
                <span className="tl-current">Showing</span>
              ) : (
                <button type="button" className="mini-btn labeled" onClick={() => onRestore(v.id)} aria-label={`Show version ${n}`}>
                  <RotateCcw size={12} aria-hidden="true" /> Show
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}
