import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import {
  reviewCommand,
  elementTour,
  changeTour,
  sourceEvidence,
  moveTaskNext,
} from '../src/lib/review.js';
import { changeReceipt } from '../src/lib/changes.js';
import { cleanTasks, nextQueuedTask, taskCommand } from '../src/lib/tasks.js';
import { SpeechQueue } from '../src/lib/speechQueue.js';
import { validateSession } from '../src/lib/storage.js';
import { discuss } from '../server/discuss.mjs';
const defer = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
const flush = () => new Promise((r) => setTimeout(r, 0));
test('natural voice requests choose a read-only page, element, task or change walkthrough', () => {
  for (const s of [
    'Give me a tour',
    'Can you give me a tour of this website?',
    'website ka tour dikhao',
  ])
    assert.equal(reviewCommand(s)?.mode, 'page', s);
  for (const s of [
    'Explain every single element and why it has been done',
    'Explain all elements',
    'Walk me through each element',
    'हर element समझाओ',
    'Har element samjhao aur kyun banaya hai',
    'Saare elements explain karo',
  ])
    assert.equal(reviewCommand(s)?.mode, 'elements', s);
  for (const s of [
    'Explain what all changes have been done',
    'What did you change?',
    'Kya kya change kiya?',
    'Saare changes explain karo',
  ])
    assert.equal(reviewCommand(s)?.mode, 'changes', s);
  assert.deepEqual(reviewCommand('Explain task two'), {
    action: 'start',
    mode: 'changes',
    seq: 2,
  });
  assert.equal(reviewCommand('task २ explain karo')?.seq, 2);
  assert.equal(reviewCommand('Make changes to every element'), null);
  assert.equal(
    reviewCommand('Build a travel company website with tour packages'),
    null,
  );
  for (const [s, action] of [
    ['next', 'next'],
    ['repeat that', 'repeat'],
    ['pause', 'pause'],
    ['continue the tour', 'resume'],
    ['stop tour', 'stop'],
  ])
    assert.equal(reviewCommand(s, true)?.action, action);
});
test('element explanations include meaningful buttons, images and body text, without the old seven-step cutoff', () => {
  const els = Array.from({ length: 15 }, (_, i) => ({
    id: 'p' + i,
    tag: 'p',
    text: 'Paragraph ' + i,
  }));
  els.push(
    { id: 'photo', tag: 'img', text: '' },
    { id: 'cta', tag: 'button', text: 'Start here' },
    { id: 'wrapper', tag: 'div', text: 'wrapper text' },
  );
  const steps = elementTour(els);
  assert.equal(steps.length, 17);
  assert.ok(steps.some((s) => s.id === 'photo'));
  assert.ok(!steps.some((s) => s.id === 'wrapper'));
});
test('change receipts retain all meaningful edits and removals and do not point a removed element at a different one', () => {
  const before = Array.from({ length: 12 }, (_, i) => ({
    id: 'p' + i,
    tag: 'p',
    text: 'Old ' + i,
  }));
  const after = before
    .slice(0, 11)
    .map((e) => ({ ...e, text: e.text.replace('Old', 'New') }));
  const receipt = changeReceipt(before, after);
  assert.equal(receipt.length, 12);
  assert.ok(receipt.at(-1).removed);
  const tour = changeTour({ changes: receipt }, after);
  assert.equal(tour.length, 12);
  assert.ok(tour.at(-1).missing);
  assert.equal(tour.at(-1).id, 'p11');
});
test('before and after evidence contains the exact named element and bounded source facts', () => {
  const win = new Window();
  const old = globalThis.DOMParser;
  globalThis.DOMParser = win.DOMParser;
  try {
    const e = sourceEvidence(
      '<html><body><h1 data-cg-id="heading" style="font-size:64px">Hello</h1><p data-cg-id="copy">Other</p></body></html>',
      'heading',
    );
    assert.equal(e.text, 'Hello');
    assert.equal(e.inlineStyle, 'font-size:64px');
    assert.equal(
      sourceEvidence('<html><body>Nothing</body></html>', 'missing'),
      null,
    );
  } finally {
    globalThis.DOMParser = old;
  }
});
test('doing a queued task next preserves task numbers and survives reload; pausing never interrupts a running task', () => {
  const tasks = [
    { id: 'a', seq: 1, state: 'running', request: 'Build' },
    { id: 'b', seq: 2, state: 'queued', request: 'Color' },
    { id: 'c', seq: 3, state: 'queued', request: 'Image' },
  ];
  const moved = moveTaskNext(tasks, 'c');
  assert.deepEqual(
    moved.map((t) => t.seq),
    [1, 2, 3],
  );
  assert.equal(nextQueuedTask(moved, false, true), null);
  const after = moved.map((t) =>
    t.id === 'a' ? { ...t, state: 'ready', reviewedAt: 42 } : t,
  );
  assert.equal(nextQueuedTask(after, true, true), null);
  assert.equal(nextQueuedTask(after, false, true).id, 'c');
  const restored = cleanTasks(after, []);
  assert.equal(nextQueuedTask(restored, false, true).id, 'c');
  assert.equal(restored[0].reviewedAt, 42);
  const creation = [
    { id: 'create', seq: 1, kind: 'create', state: 'queued', request: 'Build' },
    { ...tasks[2], order: -2 },
  ];
  assert.equal(
    nextQueuedTask(creation, false, false).id,
    'create',
    'page creation remains a prerequisite even after the user reorders edits',
  );
  assert.deepEqual(taskCommand('Pause the queue'), { action: 'pause' });
  assert.deepEqual(taskCommand('Do task 3 next'), { action: 'next', seq: 3 });
});
test('stopping a prefetched tour unblocks an independent answer even if the abandoned request ignores cancellation', async () => {
  const held = defer(),
    played = [];
  const queue = new SpeechQueue({
    async play(a) {
      played.push(a);
      return 'ended';
    },
    stop() {},
  });
  const tour = queue.enqueue(() => held.promise, {
    owner: { kind: 'tour', id: 't' },
  });
  const answer = queue.enqueue(async () => ({ audio: 'answer' }), {
    owner: { kind: 'question', id: 'q' },
  });
  await flush();
  queue.cancelOwner({ kind: 'tour', id: 't' });
  assert.equal(await tour, 'cancelled');
  assert.equal(await answer, 'ended');
  held.resolve({ audio: 'stale tour' });
  await flush();
  assert.deepEqual(played, ['answer']);
});
test('stopping a tour does not stop an already-playing independent answer', async () => {
  const done = defer();
  let stops = 0;
  const queue = new SpeechQueue({
    play() {
      return done.promise;
    },
    stop() {
      stops++;
    },
  });
  const answer = queue.enqueue(async () => ({ audio: 'answer' }), {
    owner: { kind: 'question', id: 'q' },
  });
  const tour = queue.enqueue(async () => ({ audio: 'tour' }), {
    owner: { kind: 'tour', id: 't' },
  });
  await flush();
  queue.cancelOwner({ kind: 'tour', id: 't' });
  assert.equal(stops, 0);
  done.resolve('ended');
  assert.equal(await answer, 'ended');
  assert.equal(await tour, 'cancelled');
});
test('guided explanation receives before/after and request evidence but cannot become a page-writing action', async () => {
  const fetch = globalThis.fetch,
    key = process.env.SARVAM_API_KEY;
  process.env.SARVAM_API_KEY = 'fixture';
  let request,
    calls = 0;
  try {
    globalThis.fetch = async (_url, opts) => {
      calls++;
      request = JSON.parse(opts.body);
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                route: 'task',
                reply: 'I will change the page.',
                targets: [{ id: 'other', label: 'Other' }],
              }),
            },
            finish_reason: 'stop',
          },
        ],
      });
    };
    const result = await discuss({
      messages: [{ role: 'user', content: 'Explain this change and why' }],
      voiceStyle: 'hinglish',
      context: {
        elements: [
          {
            id: 'heading',
            tag: 'h1',
            text: 'New',
            styles: { fontSize: '64px' },
          },
          { id: 'other', tag: 'p', text: 'Other' },
        ],
      },
      review: {
        mode: 'changes',
        focusId: 'heading',
        request: 'Make the headline larger',
        before: { text: 'Old', inlineStyle: 'font-size:32px' },
        after: { text: 'New', inlineStyle: 'font-size:64px' },
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.route, 'answer');
    assert.equal(
      result.voiceStyle,
      'hinglish',
      'a synthetic English tour prompt must not override the human’s mixed language',
    );
    assert.ok(!('html' in result));
    assert.ok(!result.reply.includes('I will change'));
    assert.deepEqual(result.targets, []);
    assert.match(request.messages[0].content, /font-size:32px/);
    assert.match(request.messages[0].content, /likely design benefit/);
    assert.equal(request.reasoning_effort, null);
  } finally {
    globalThis.fetch = fetch;
    if (key === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = key;
  }
});

test('the complete change receipt survives session reload rather than being cut back to twelve highlights', () => {
  const changes = Array.from({ length: 25 }, (_, i) => ({
    id: 'p' + i,
    description: 'Updated paragraph ' + i,
  }));
  const v = {
    id: 'v',
    html: '<!doctype html><html><body><h1>Real page</h1></body></html>',
    createdAt: 1,
    changes,
  };
  const saved = validateSession(
    {
      projectId: 'p',
      versions: [v],
      currentVersionId: 'v',
      messages: [],
      tasks: [],
    },
    'p',
  );
  assert.equal(saved.versions[0].changes.length, 25);
});
