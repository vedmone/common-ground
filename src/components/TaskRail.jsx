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
}) {
  const [expanded, setExpanded] = useState(false),
    [selected, setSelected] = useState(null);
  const working = tasks.find((t) => t.state === 'running');
  const queued = tasks.filter((t) => t.state === 'queued');
  const actionable = tasks.filter(
    (t) => !['ready', 'cancelled'].includes(t.state),
  );
  const completed = tasks
    .filter((t) => ['ready', 'cancelled'].includes(t.state))
    .slice(-12)
    .reverse();
  const activeId = selected || working?.id || actionable[0]?.id;
  function row(task) {
    const Icon = ICONS[task.state] || Clock3;
    const open = task.id === activeId;
    const version = versions.findIndex((v) => v.id === task.resultVersionId);
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
            <ol className="task-list">{actionable.map(row)}</ol>
            {completed.length > 0 && (
              <>
                <h3 className="task-section-label">RECENTLY FINISHED</h3>
                <ol className="task-list task-completed">
                  {completed.map(row)}
                </ol>
              </>
            )}
          </>
        )}
        {paused && queued.length > 0 && (
          <div className="task-paused">
            <b>Queued work is saved.</b>
            <p>
              Retry the interrupted task, or continue with your current page.
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
