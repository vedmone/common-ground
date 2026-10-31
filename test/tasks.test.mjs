import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanTasks,
  addTask,
  updateTask,
  nextQueuedTask,
  inputLane,
  isInformationalQuestion,
  taskCommand,
} from '../src/lib/tasks.js';
import { validateSession } from '../src/lib/storage.js';
import { discuss } from '../server/discuss.mjs';
const versions = [
  {
    id: 'base',
    html: '<!doctype html><html><head><title>Page</title></head><body>A real page with content.</body></html>',
    createdAt: 1,
  },
  { id: 'v1' },
];
const row = (id, seq, state = 'queued', kind = 'edit') => ({
  id,
  seq,
  state,
  kind,
  request: 'Make the heading green',
  title: 'Heading color',
  createdAt: 1,
  attempt: 0,
});

test('one task ledger schedules in order and blocks writes for running work or missing choices', () => {
  const tasks = [row('b', 2), row('a', 1, 'running', 'create')];
  assert.equal(nextQueuedTask(tasks, false, true), null);
  const completed = updateTask(tasks, 'a', {
    state: 'ready',
    resultVersionId: 'v1',
  });
  assert.equal(nextQueuedTask(completed, false, true).id, 'b');
  assert.equal(nextQueuedTask(completed, true, true), null);
  assert.equal(
    nextQueuedTask([row('a', 1, 'needs_detail'), row('b', 2)], false, true),
    null,
  );
  assert.equal(
    nextQueuedTask(
      [row('a', 1, 'needs_choice', 'compare'), row('b', 2)],
      false,
      true,
    ),
    null,
  );
  assert.equal(
    nextQueuedTask(
      [row('a', 1, 'cancelled', 'create'), row('b', 2)],
      false,
      false,
    ),
    null,
  );
});
test('retry updates the same task identity and reload retains queued targets while interrupting active work', () => {
  let tasks = [
    { ...row('a', 1, 'failed'), attempt: 1 },
    {
      ...row('b', 2),
      target: {
        id: 'cta',
        label: 'Book a workshop',
        tag: 'button',
        locked: true,
      },
    },
  ];
  tasks = addTask(tasks, { ...tasks[0], state: 'queued' });
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].id, 'a');
  const restored = cleanTasks(
    [{ ...tasks[0], state: 'running' }, tasks[1]],
    versions,
  );
  assert.equal(restored[0].state, 'interrupted');
  assert.equal(restored[1].target.id, 'cta');
  assert.equal(restored[1].state, 'queued');
  const dedup = cleanTasks(
    [tasks[0], { ...tasks[0], state: 'ready', resultVersionId: 'v1' }],
    versions,
  );
  assert.equal(dedup.length, 1);
  assert.equal(dedup[0].resultVersionId, 'v1');
});
test('legacy failed work migrates to a paused ledger with all follow-ups', () => {
  const work = {
    id: 'old',
    state: 'failed',
    request: 'Create a workshop landing page.',
    task: 'create',
    startedAt: 1,
    followups: ['Make the heading green', 'Add a footer'],
  };
  const session = validateSession(
    {
      projectId: 'p',
      versions: [versions[0]],
      messages: [],
      currentVersionId: 'base',
      work,
    },
    'p',
  );
  assert.equal(session.tasks.length, 3);
  assert.equal(session.tasks[0].state, 'failed');
  assert.ok(session.queuePaused);
  assert.equal(session.tasks[2].state, 'queued');
});
test('work commands, informational questions and numbered task controls stay distinct', () => {
  for (const s of [
    'Which font is this?',
    'Why does this look warm?',
    'Can you explain the spacing?',
    'Ye font kyun use kiya?',
  ])
    assert.equal(inputLane(s), 'conversation', s);
  for (const s of [
    'Make the heading green.',
    'Can you add an image?',
    'Give this button two directions.',
    'Isko circular kar do',
  ])
    assert.equal(inputLane(s), 'work', s);
  assert.ok(isInformationalQuestion('Why is this color here?'));
  assert.equal(isInformationalQuestion('Make this blue.'), false);
  assert.deepEqual(taskCommand('cancel task 2'), { action: 'cancel', seq: 2 });
  assert.deepEqual(taskCommand('task 3 retry karo'), {
    action: 'retry',
    seq: 3,
  });
  assert.deepEqual(taskCommand('continue the queue'), { action: 'continue' });
});
test('read-only discussion answers with provided styles and never calls the HTML generator', async () => {
  const original = globalThis.fetch,
    key = process.env.SARVAM_API_KEY;
  process.env.SARVAM_API_KEY = 'test-key';
  let calls = 0,
    request;
  try {
    globalThis.fetch = async (_url, opts) => {
      calls++;
      request = JSON.parse(opts.body);
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                route: 'answer',
                reply:
                  'The heading uses Georgia, which gives it an editorial feel.',
                targets: [{ id: 'heading', label: 'Main headline' }],
              }),
            },
            finish_reason: 'stop',
          },
        ],
      });
    };
    const result = await discuss({
      messages: [{ role: 'user', content: 'Which font is this?' }],
      context: {
        elements: [
          {
            id: 'heading',
            tag: 'h1',
            text: 'Made by hand',
            styles: { 'font-family': 'Georgia, serif' },
          },
        ],
        selection: { id: 'heading', tag: 'h1' },
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.route, 'answer');
    assert.match(result.reply, /Georgia/);
    assert.ok(!('html' in result));
    assert.match(request.messages[0].content, /INDEPENDENT READ-ONLY/);
    assert.match(request.messages[0].content, /Georgia/);
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = key;
  }
});
test('a model cannot turn an informational question into a page-writing task', async () => {
  const original = globalThis.fetch,
    key = process.env.SARVAM_API_KEY;
  process.env.SARVAM_API_KEY = 'test-key';
  try {
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                route: 'task',
                reply: 'I will change that now.',
                intent: 'Change the page',
              }),
            },
            finish_reason: 'stop',
          },
        ],
      });
    const result = await discuss({
      messages: [{ role: 'user', content: 'Why did you choose this font?' }],
      context: { elements: [] },
    });
    assert.notEqual(result.route, 'task');
    assert.ok(!result.reply.includes('I will change'));
    assert.ok(!('html' in result));
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = key;
  }
});
