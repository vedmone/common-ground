import test from 'node:test';
import assert from 'node:assert/strict';
import { readCompletion, partialReply, serveChat } from '../server/stream.mjs';
import { EventEmitter } from 'node:events';
import { readNDJSON } from '../src/lib/api.js';
import { applyPatches, validateChat, chat } from '../server/core.mjs';
import {
  pageTour,
  changedTargets,
  comparisonChoice,
} from '../src/lib/changes.js';
import { blankHTML, loadProjects, saveProjects } from '../src/lib/projects.js';
import { imageType, publicationId } from '../server/publishing.mjs';

const stream = (parts) =>
  new ReadableStream({
    start(c) {
      for (const p of parts)
        c.enqueue(typeof p === 'string' ? new TextEncoder().encode(p) : p);
      c.close();
    },
  });
test('SSE decoding handles packet splits and content only, never reasoning', async () => {
  const encoded = new TextEncoder().encode(
    'data: ' +
      JSON.stringify({
        choices: [
          { delta: { reasoning_content: 'private', content: 'नमस्ते' } },
        ],
      }) +
      '\n\ndata: ' +
      JSON.stringify({
        choices: [{ delta: { content: ' world' }, finish_reason: 'stop' }],
      }) +
      '\n\ndata: [DONE]\n',
  );
  const fragments = [];
  for (let i = 0; i < encoded.length; i += 5)
    fragments.push(encoded.slice(i, i + 5));
  const received = [];
  const r = await readCompletion(new Response(stream(fragments)), (d) =>
    received.push(d),
  );
  assert.equal(r.choices[0].message.content, 'नमस्ते world');
  assert.ok(!received.join('').includes('private'));
});
test('partial spoken JSON replies tolerate unfinished escapes', () => {
  assert.equal(
    partialReply('{"reply":"I am editing this'),
    'I am editing this',
  );
  assert.equal(partialReply('{"reply":"This \\"'), 'This "');
  assert.equal(partialReply('{"reply":"hello \\u09'), 'hello ');
  assert.equal(partialReply('{"reply":"Done","action":"edit"}'), 'Done');
});
test('NDJSON processing exposes progress before result and rejects interrupted or failed streams', async () => {
  const events = [];
  const result = await readNDJSON(
    stream([
      '{"type":"stage","stage":"building"}\n{"type":"re',
      'sult","result":{"html":"ready"}}\n',
    ]),
    (e) => events.push(e.type),
  );
  assert.deepEqual(events, ['stage', 'result']);
  assert.equal(result.html, 'ready');
  await assert.rejects(
    () => readNDJSON(stream(['{"type":"stage"}\n'])),
    /connection ended/,
  );
  await assert.rejects(
    () => readNDJSON(stream(['{"type":"error","error":"Build failed"}\n'])),
    /Build failed/,
  );
});
test('image patches insert at the selected scope and replace sources with circular styling', () => {
  const page = blankHTML('Image test');
  const updated = applyPatches(page, [
    {
      id: 'canvas',
      image: { src: 'https://example.com/photo.jpg', alt: 'Uploaded portrait' },
      styles: {
        'border-radius': '50%',
        'aspect-ratio': '1',
        'object-fit': 'cover',
      },
    },
  ]);
  assert.match(updated, /<img/);
  assert.match(updated, /border-radius: 50%/);
  assert.match(updated, /hero-heading/);
  assert.match(updated, /src="https:\/\/example.com\/photo.jpg"/);
  assert.equal(
    applyPatches(page, [
      { id: 'canvas', image: { src: 'javascript:alert(1)' } },
    ]),
    null,
  );
});
test('comparison commands choose an option only for explicit acceptance', () => {
  assert.equal(comparisonChoice('I prefer B.'), 1);
  assert.equal(comparisonChoice('use option A'), 0);
  assert.equal(comparisonChoice('second one'), 1);
  assert.equal(comparisonChoice('make option B green'), null);
});
test('change tours do not highlight unchanged elements or every wrapper', () => {
  const before = [
    { id: 'hero', tag: 'section', text: 'Hello', styles: {} },
    { id: 'heading', tag: 'h1', text: 'Hello', styles: { color: 'black' } },
    { id: 'cta', tag: 'button', text: 'Join', styles: { color: 'black' } },
  ];
  const after = before.map((e) =>
    e.id === 'cta' ? { ...e, styles: { color: 'green' } } : e,
  );
  assert.deepEqual(
    changedTargets(before, after).map((e) => e.id),
    ['cta'],
  );
  assert.deepEqual(
    pageTour(before).map((e) => e.id),
    ['heading'],
  );
});
test('custom page identity and names survive local storage without executable markup', () => {
  const storage = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => storage.get(k),
      setItem: (k, v) => storage.set(k, v),
    },
  });
  try {
    saveProjects([
      {
        id: 'custom_123',
        name: '<script>hello</script>',
        kind: 'Landing page',
      },
    ]);
    const p = loadProjects();
    assert.equal(p.length, 1);
    assert.ok(p[0].html.includes('&lt;script&gt;'));
    assert.ok(!p[0].html.includes('<script>'));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
test('uploaded image signatures and publication identifiers are bounded', () => {
  assert.equal(imageType(Buffer.from('<script>alert(1)</script>')), null);
  assert.equal(
    imageType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])).mime,
    'image/png',
  );
  assert.ok(publicationId('my-page-98233c8b-0dc5-4704-8b45-3f67fa1be9b8'));
  assert.ok(!publicationId('../../secrets'));
  const valid = validateChat({
    messages: [{ role: 'user', content: 'Add this image here' }],
    context: {
      assets: [
        { url: 'javascript:alert(1)' },
        { url: 'https://example.com/a.png', selected: true },
      ],
    },
  });
  assert.equal(valid.context.assets.length, 1);
});

test('a text change highlights its element instead of every containing section', () => {
  const before = [
    { id: 'section', tag: 'section', text: 'Title Old copy', styles: {} },
    {
      id: 'heading',
      tag: 'h1',
      text: 'Title',
      parentId: 'section',
      styles: {},
    },
    { id: 'copy', tag: 'p', text: 'Old copy', parentId: 'section', styles: {} },
  ];
  const after = before.map((e) =>
    e.id === 'section'
      ? { ...e, text: 'Title New copy' }
      : e.id === 'copy'
        ? { ...e, text: 'New copy' }
        : e,
  );
  assert.deepEqual(
    changedTargets(before, after).map((e) => e.id),
    ['copy'],
  );
});
test('closing the client stream aborts in-flight generation without a success event', async () => {
  const res = new EventEmitter(),
    events = [];
  res.writableEnded = false;
  res.status = () => res;
  res.setHeader = () => res;
  res.write = (s) => events.push(JSON.parse(s));
  res.end = () => {
    res.writableEnded = true;
  };
  let aborted = false;
  const pending = serveChat(
    { headers: { accept: 'application/x-ndjson' }, body: {} },
    res,
    async (_, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new Error('Cancelled'));
          },
          { once: true },
        ),
      ),
  );
  res.emit('close');
  await pending;
  assert.ok(aborted);
  assert.ok(!events.some((e) => e.type === 'result' || e.type === 'error'));
});

test('create-from-scratch always generates a full page even if intent includes small patches', async () => {
  const originalFetch = globalThis.fetch,
    originalKey = process.env.SARVAM_API_KEY;
  let calls = 0;
  process.env.SARVAM_API_KEY = 'test-key';
  const complete =
    '<!doctype html><html><head><title>New studio</title></head><body><h1>A complete new page</h1><section><h2>Workshops</h2><p>Made by hand with real clay.</p></section><section><h2>Visit us</h2><p>Join the next workshop in Jaipur.</p></section></body></html>';
  globalThis.fetch = async (_url, options) => {
    calls++;
    if (calls === 2)
      assert.ok(
        JSON.parse(options.body)
          .messages.at(-1)
          .content.includes('Build a landing page for Clay House in Jaipur.'),
      );
    return Response.json({
      choices: [
        {
          message: {
            content:
              calls === 1
                ? JSON.stringify({
                    action: 'edit',
                    reply: 'I am creating your page.',
                    intent: 'Create a studio landing page',
                    patches: [{ id: 'hero-heading', text: 'Changed title' }],
                  })
                : complete,
          },
          finish_reason: 'stop',
        },
      ],
    });
  };
  try {
    const output = await chat({
      task: 'create',
      messages: [
        {
          role: 'user',
          content: 'Build a landing page for Clay House in Jaipur.',
        },
      ],
      context: {
        html: blankHTML(),
        elements: [{ id: 'hero-heading', tag: 'h1', text: 'Untitled page' }],
      },
    });
    assert.equal(calls, 2);
    assert.ok(output.html.includes('A complete new page'));
    assert.ok(!output.html.includes('A FRESH CANVAS'));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = originalKey;
  }
});
