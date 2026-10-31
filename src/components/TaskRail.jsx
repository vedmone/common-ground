import { useState, useEffect } from 'react';
import {
  ListChecks,
  Check,
  Loader2,
  Clock3,
  MessageCircle,
  AlertCircle,
  Pause,
  ChevronDown,
  ArrowUpRight,
  X,
  RotateCcw,
  AudioLines,
  ArrowUp,
} from 'lucide-react';
const LABELS = {
  queued: 'Next',
  running: 'Working',
  needs_detail: 'Needs an answer',
  needs_choice: 'Choose a direction',
  ready: 'Done',
  failed: 'Needs another try',
  cancelled: 'Cancelled',
  interrupted: 'Interrupted',
};
const ICONS = {
  queued: Clock3,
  running: Loader2,
  needs_detail: MessageCircle,
  needs_choice: MessageCircle,
  ready: Check,
  failed: AlertCircle,
  cancelled: X,
  interrupted: Pause,
};
function Elapsed({ startedAt }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="task-elapsed">
      {Math.max(0, Math.floor((now - startedAt) / 1000))}s
    </span>
  );
}
export default function TaskRail({
  tasks,
  paused,
  busy,
  turn,
  versions,
  onAction,
  onContinue,
  canContinue = true,
  currentVersionId,
  onPause,
}) {
  const [expanded, setExpanded] = useState(false),
    [selected, setSelected] = useState(null),
    [filter, setFilter] = useState('all');
  const working = tasks.find((t) => t.state === 'running');
  const queued = tasks
    .filter((t) => t.state === 'queued')
    .sort((a, b) => (a.order ?? a.seq) - (b.order ?? b.seq));
  const reviews = tasks.filter((t) => t.state === 'ready' && !t.reviewedAt);
  const waiting = tasks.filter((t) =>
    ['needs_detail', 'needs_choice'].includes(t.state),
  );
  const actionable = tasks
    .filter((t) => !['ready', 'cancelled'].includes(t.state))
    .sort((a, b) => {
      const rank = (t) =>
        ['needs_detail', 'needs_choice'].includes(t.state)
          ? 0
          : t.state === 'running'
            ? 1
            : t.state === 'queued'
              ? 2
              : 3;
      return rank(a) - rank(b) || (a.order ?? a.seq) - (b.order ?? b.seq);
    });
  const completed = tasks
    .filter(
      (t) => (t.state === 'ready' && t.reviewedAt) || t.state === 'cancelled',
    )
    .slice(-12)
    .reverse();
  const activeId =
    selected ||
    working?.id ||
    waiting[0]?.id ||
    actionable[0]?.id ||
    reviews.at(-1)?.id;
  function row(task) {
    const Icon = ICONS[task.state] || Clock3;
    const open = task.id === activeId;
    const version = versions.findIndex((v) => v.id === task.resultVersionId);
    const result = versions[version];
    const position = queued.findIndex((t) => t.id === task.id);
    const retryable = ['create', 'edit', 'compare'].includes(task.kind);
    return (
      <li
        key={task.id}
        data-task-id={task.id}
        data-task-state={task.state}
        className={`task-card state-${task.state} ${open ? 'is-open' : ''}`}
      >
        <button
          className="task-select"
          aria-expanded={open}
          onClick={() => setSelected(open ? 'none' : task.id)}
          title={task.request}
        >
          <span className="task-number">
            {String(task.seq).padStart(2, '0')}
          </span>
          <span className="task-copy">
            <b>{task.title}</b>
            <span className="task-state">
              <Icon
                size={11}
                className={task.state === 'running' ? 'spin' : ''}
              />
              {task.state === 'queued' && paused
                ? 'Waiting'
                : task.state === 'ready' && task.applied === false
                  ? 'Ready to view'
                  : task.state === 'ready'
                    ? task.reviewedAt
                      ? 'Reviewed'
                      : 'Ready for review'
                    : LABELS[task.state]}
              {task.state === 'running' && (
                <Elapsed startedAt={task.startedAt} />
              )}
            </span>
          </span>
        </button>
        {open && (
          <div className="task-details">
            <p>{task.request}</p>
            {task.target?.label && <small>On: {task.target.label}</small>}
            {task.state === 'queued' && (
              <small>
                Position {position + 1} of {queued.length}
                {paused ? ' · queue paused' : ''}
              </small>
            )}
            {task.attempt > 1 && <small>Attempt {task.attempt}</small>}
            {result && (
              <div className="task-receipt">
                <small>
                  {result.id === currentVersionId
                    ? 'ON YOUR PAGE'
                    : 'SAVED RESULT'}{' '}
                  · v{version + 1}
                </small>
                {result.changes?.length > 0 ? (
                  <ul>
                    {result.changes.slice(0, 4).map((c, i) => (
                      <li key={`${c.id}-${i}`}>{c.description || c.id}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{result.summary}</p>
                )}
                {result.changes?.length > 4 && (
                  <small>
                    +{result.changes.length - 4} more in the walkthrough
                  </small>
                )}
              </div>
            )}
            {task.state === 'running' && (
              <small className="task-stage">
                {turn.label || 'Working on your page'}
              </small>
            )}
            {task.question &&
              ['needs_detail', 'needs_choice'].includes(task.state) && (
                <p className="task-question">{task.question}</p>
              )}
            {task.error && ['failed', 'interrupted'].includes(task.state) && (
              <p className="task-error">{task.error}</p>
            )}
            <div className="task-actions">
              {task.state === 'queued' && position > 0 && (
                <button
                  onClick={() => onAction(task, 'next')}
                  aria-label={`Do task ${task.seq} next`}
                >
                  <ArrowUp size={11} />
                  Do next
                </button>
              )}
              {task.state === 'ready' && result && (
                <>
                  <button
                    className="task-primary"
                    disabled={busy && result.id !== currentVersionId}
                    onClick={() => onAction(task, 'explain')}
                    aria-label={`Explain task ${task.seq}`}
                    title={
                      busy && result.id !== currentVersionId
                        ? 'Available after the current task finishes'
                        : 'Hear what changed and why'
                    }
                  >
                    <AudioLines size={12} />
                    Explain changes
                  </button>
                  {!task.reviewedAt && (
                    <button
                      onClick={() => onAction(task, 'reviewed')}
                      aria-label={`Mark task ${task.seq} reviewed`}
                    >
                      <Check size={11} />
                      Mark reviewed
                    </button>
                  )}
                </>
              )}

              {task.state === 'running' && (
                <button
                  onClick={() => onAction(task, 'cancel')}
                  aria-label={`Cancel task ${task.seq}`}
                >
                  Stop task
                </button>
              )}
              {['queued', 'needs_detail', 'needs_choice'].includes(
                task.state,
              ) && (
                <button
                  onClick={() => onAction(task, 'cancel')}
                  aria-label={`Remove task ${task.seq}`}
                >
                  Remove
                </button>
              )}
              {['failed', 'interrupted', 'cancelled'].includes(task.state) &&
                retryable && (
                  <button
                    className="task-primary"
                    onClick={() => onAction(task, 'retry')}
                    aria-label={`Retry task ${task.seq}`}
                  >
                    <RotateCcw size={11} />
                    Retry task
                  </button>
                )}
              {['needs_detail', 'needs_choice'].includes(task.state) && (
                <button
                  className="task-primary"
                  onClick={() => onAction(task, 'answer')}
                  aria-label={`Answer task ${task.seq}`}
                >
                  <MessageCircle size={11} />
                  {task.state === 'needs_choice'
                    ? 'Review options'
                    : 'Answer on call'}
                </button>
              )}
              {task.state === 'ready' && version >= 0 && (
                <button
                  disabled={busy}
                  onClick={() => onAction(task, 'view')}
                  aria-label={`View result for task ${task.seq}`}
                >
                  <ArrowUpRight size={11} />
                  View v{version + 1}
                </button>
              )}
              {task.state === 'ready' && task.url && (
                <a href={task.url} target="_blank" rel="noreferrer">
                  Open result <ArrowUpRight size={11} />
                </a>
              )}
            </div>
          </div>
        )}
      </li>
    );
  }
  return (
    <aside
      className={`task-rail ${expanded ? 'is-expanded' : ''}`}
      aria-label="Page tasks"
    >
      <header className="task-rail-head">
        <div>
          <span className="task-eyebrow">YOUR WORKSPACE</span>
          <h2>
            <ListChecks size={17} />
            Tasks <span>{tasks.length}</span>
          </h2>
        </div>
        <button
          className="task-mobile-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label="Toggle task list"
        >
          <ChevronDown size={16} />
        </button>
      </header>
      <p className="task-summary" aria-live="polite">
        {working
          ? 'One task working'
          : paused && queued.length
            ? 'Queue paused'
            : queued.length
              ? 'Ready for the next change'
              : 'Every change, in one place'}
        {queued.length > 0 && ` · ${queued.length} next`}
      </p>
      <div className="task-filters" role="group" aria-label="Filter tasks">
        {[
          ['all', 'All', tasks.length],
          ['active', 'Active', actionable.length],
          ['review', 'Review', reviews.length],
        ].map(([id, label, count]) => (
          <button
            key={id}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>
      {waiting.length > 0 && (
        <p className="task-attention">
          {waiting.length} task{waiting.length > 1 ? 's need' : ' needs'} your
          input.
        </p>
      )}
      <div className="task-body">
        {!tasks.length ? (
          <div className="task-empty">
            <span>
              <ListChecks size={24} />
            </span>
            <b>Your next idea starts here.</b>
            <p>
              Builds and changes appear as tasks. Questions stay on the call.
            </p>
            <small>Try “make this heading bolder.”</small>
          </div>
        ) : (
          <>
            {filter !== 'review' && (
              <ol className="task-list">{actionable.map(row)}</ol>
            )}
            {filter !== 'active' && reviews.length > 0 && (
              <>
                <h3 className="task-section-label">READY FOR REVIEW</h3>
                <ol className="task-list">{[...reviews].reverse().map(row)}</ol>
              </>
            )}
            {filter === 'active' && !actionable.length && (
              <p className="task-filter-empty">
                No active tasks. Ask for a change on the call.
              </p>
            )}
            {filter === 'review' && !reviews.length && (
              <p className="task-filter-empty">
                All caught up. New results will appear here.
              </p>
            )}
            {filter === 'all' && completed.length > 0 && (
              <>
                <h3 className="task-section-label">RECENTLY FINISHED</h3>
                <ol className="task-list task-completed">
                  {completed.map(row)}
                </ol>
              </>
            )}
          </>
        )}
        {!paused && (working || queued.length > 0) && (
          <button className="task-pause" onClick={onPause}>
            {working ? 'Pause after this task' : 'Pause queue'}
          </button>
        )}
        {paused && queued.length > 0 && (
          <div className="task-paused">
            <b>Queued work is saved.</b>
            <p>
              Your current task can finish. Resume when you’re ready for the
              next change.
            </p>
            <button
              className="btn btn-outline btn-sm"
              onClick={onContinue}
              disabled={busy || !canContinue}
            >
              Continue queue
            </button>
          </div>
        )}
      </div>
      <footer className="task-rail-foot">
        <span className="task-live-dot" />
        The call stays open while tasks run.
      </footer>
    </aside>
  );
}
