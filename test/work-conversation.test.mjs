import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyWorkUtterance,
  isCreationRequest,
  continueCreation,
  recoverableBuild,
  workReply,
  cleanWork,
} from '../src/lib/workConversation.js';
import { conversationLanguage } from '../src/lib/conversationLanguage.js';
import { blankHTML } from '../src/lib/projects.js';
import { validateSession } from '../src/lib/storage.js';
import { chat } from '../server/core.mjs';

test('human status and waiting phrases are separate from edits, cancellation and stopping voice', () => {
  for (const text of [
    'kitna time lagega?',
    'और कितना टाइम लगेगा?',
    'kya ho raha hai?',
    'How much time is remaining?',
    'what is happening?',
    'Any progress?',
    'Are you still working?',
    'What happened to the bubble?',
    'The preview is just blank HTML.',
  ])
    assert.equal(classifyWorkUtterance(text), 'status', text);
  for (const text of [
    "Okay, I'll wait.",
    'take your time',
    'haan theek hai',
    'okay',
    'main wait karunga',
  ])
    assert.equal(classifyWorkUtterance(text), 'acknowledge', text);
  for (const text of [
    'stop talking',
    'wait',
    'hold on',
    'keep building but stop talking',
  ])
    assert.equal(classifyWorkUtterance(text), 'silence', text);
  for (const text of [
    'Stop building.',
    'cancel this build',
    'रुको',
    'nahi, ruko.',
  ])
    assert.equal(classifyWorkUtterance(text), 'cancel', text);
  for (const text of [
    'Make the heading blue.',
    'Add a timer showing how much time is left.',
    'What font is this?',
  ])
    assert.equal(classifyWorkUtterance(text), 'revision', text);
  assert.equal(classifyWorkUtterance('Resume build'), 'resume');
  assert.equal(
    conversationLanguage([{ role: 'user', content: 'kitna time lagega?' }])
      .style,
    'hinglish',
  );
});
test('status speech reflects the real phase, elapsed time, and interrupted or ready state', () => {
  const build = workReply('status', {
    active: true,
    work: { startedAt: 1000 },
    turn: { phase: 'building' },
    language: 'hinglish',
    now: 21000,
  });
  assert.match(build, /20 seconds/);
  assert.match(build, /Exact remaining time/);
  assert.ok(!/few seconds|कुछ सेकंड/.test(build));
  assert.match(
    workReply('status', {
      active: true,
      turn: { phase: 'understanding' },
      language: 'en-IN',
    }),
    /understanding/,
  );
  assert.match(
    workReply('status', {
      active: true,
      turn: { phase: 'validating' },
      language: 'en-IN',
    }),
    /checking and applying/,
  );
  assert.match(
    workReply('status', {
      active: true,
      turn: { phase: 'building', lastProgressAt: 1000 },
      now: 41000,
      language: 'en-IN',
    }),
    /waiting for the builder/,
  );
  assert.match(
    workReply('status', {
      active: false,
      work: { state: 'failed' },
      language: 'en-IN',
    }),
    /interrupted/,
  );
  assert.match(
    workReply('status', {
      active: false,
      work: { state: 'ready' },
      hasPage: true,
      language: 'en-IN',
    }),
    /preview is ready/,
  );
});
test('an interrupted create request and its follow-ups survive session storage validation', () => {
  const work = {
    id: 'request-1',
    task: 'create',
    request: 'Build a pottery landing page.',
    state: 'failed',
    startedAt: 1000,
    target: {
      id: 'cta',
      label: 'Book a workshop',
      tag: 'button',
      locked: true,
    },
    followups: ['Make the headline green.', 'Add an image.'],
  };
  const session = validateSession(
    {
      projectId: 'custom_test',
      versions: [
        {
          id: 'base',
          html: blankHTML(),
          summary: 'Original',
          status: 'base',
          createdAt: 1000,
        },
      ],
      messages: [],
      currentVersionId: 'base',
      work,
    },
    'custom_test',
  );
  assert.equal(session.work.task, 'create');
  assert.equal(session.work.request, work.request);
  assert.deepEqual(session.work.followups, work.followups);
  assert.equal(session.work.target.id, 'cta');
  assert.equal(recoverableBuild(session).id, 'request-1');
  assert.equal(cleanWork({ ...work, request: '' }), null);
});
test('older blank-canvas sessions recover the creation brief instead of the later status question', () => {
  const original = 'Create a pottery studio landing page.';
  const session = {
    versions: [{ id: 'base', html: blankHTML() }],
    currentVersionId: 'base',
    messages: [
      { id: 'm1', role: 'user', content: original, at: 1000 },
      { id: 'm2', role: 'user', content: 'kitna time lagega?', at: 2000 },
      { id: 'm3', role: 'user', content: "Okay I'll wait", at: 3000 },
    ],
  };
  const recovered = recoverableBuild(session);
  assert.equal(recovered.request, original);
  assert.equal(recovered.task, 'create');
  assert.equal(
    recoverableBuild({
      ...session,
      work: {
        id: 'discussion',
        request: original,
        task: 'create',
        state: 'answered',
      },
    }),
    null,
  );
});
test('an explicit create request cannot silently finish as a conversational acknowledgment without HTML', async () => {
  const originalFetch = globalThis.fetch,
    key = process.env.SARVAM_API_KEY;
  process.env.SARVAM_API_KEY = 'test-key';
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return Response.json({
        choices: [
          {
            message: {
              content:
                calls === 1
                  ? JSON.stringify({
                      action: 'none',
                      reply: 'Preview bana raha hoon.',
                      intent: 'Create the workshop page',
                    })
                  : '<!doctype html><html><head><title>Workshop</title></head><body><h1>A complete workshop page</h1><section><h2>Classes</h2></section><section><h2>Visit</h2></section></body></html>',
            },
            finish_reason: 'stop',
          },
        ],
      });
    };
    const result = await chat({
      task: 'create',
      messages: [{ role: 'user', content: 'Create a workshop landing page.' }],
      context: { html: blankHTML(), elements: [] },
    });
    assert.equal(result.action, 'edit');
    assert.ok(result.html.includes('A complete workshop page'));
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = key;
  }
});

test('an AI-created page cannot report success while returning the untouched blank canvas', async () => {
  const originalFetch = globalThis.fetch,
    key = process.env.SARVAM_API_KEY;
  process.env.SARVAM_API_KEY = 'test-key';
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return Response.json({
        choices: [
          {
            message: {
              content:
                calls === 1
                  ? JSON.stringify({
                      action: 'edit',
                      reply: 'Creating your page.',
                      intent: 'Create a workshop landing page',
                    })
                  : blankHTML(),
            },
            finish_reason: 'stop',
          },
        ],
      });
    };
    await assert.rejects(
      () =>
        chat({
          task: 'create',
          messages: [
            { role: 'user', content: 'Create a workshop landing page.' },
          ],
          context: { html: blankHTML(), elements: [] },
        }),
      /blank|empty/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (key === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = key;
  }
});

test('creation intent survives short clarification answers without treating ordinary questions as builds', () => {
  assert.ok(isCreationRequest('Create something.'));
  assert.ok(isCreationRequest('Can you build a pottery landing page?'));
  assert.equal(isCreationRequest('What is a website?'), false);
  assert.equal(isCreationRequest('Make the button blue.'), false);
  const continued = continueCreation(
    'Create a terracotta pottery landing page.',
    'The name is Clay House.',
  );
  assert.ok(continued.includes('terracotta'));
  assert.ok(continued.includes('Clay House'));
  assert.ok(
    continueCreation('a'.repeat(5000), 'b'.repeat(5000)).length <= 5000,
  );
});
