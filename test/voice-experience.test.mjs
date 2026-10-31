import test from 'node:test';
import assert from 'node:assert/strict';
import {
  conversationLanguage,
  spokenUI,
} from '../src/lib/conversationLanguage.js';
import { SpeechQueue } from '../src/lib/speechQueue.js';
import { VoiceSession } from '../src/lib/voice.js';
import { KEEP_RE, STOP_RE, commandReply } from '../src/lib/util.js';
import { pageTour, changedTargets } from '../src/lib/changes.js';
import { completedReply } from '../server/stream.mjs';
import { chat, speak, transcribe } from '../server/core.mjs';
const user = (content) => ({ role: 'user', content });
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

test('spoken mix follows substantive user words and survives short commands and pointing annotations', () => {
  for (const text of [
    'Is button mein vibe nahi aa rahi, thoda premium karo.',
    'इस button को थोड़ा premium और cleaner करो.',
  ]) {
    const history = [
      user(text),
      {
        role: 'assistant',
        content: 'An English reply must not decide the user style.',
      },
    ];
    for (const short of [
      'yes',
      'keep it',
      'undo',
      'option B',
      'Haan, theek hai.',
    ]) {
      assert.equal(
        conversationLanguage([...history, user(short)], 'en-IN').style,
        'hinglish',
        short,
      );
    }
    assert.equal(
      conversationLanguage(
        [
          ...history,
          user('Please make this section much more spacious and clean.'),
        ],
        'hi-IN',
      ).style,
      'en-IN',
    );
  }
  assert.equal(
    conversationLanguage([user('इसका रंग थोड़ा हल्का कर दो।')], 'hi-IN').style,
    'hi-IN',
  );
  assert.equal(
    conversationLanguage(
      [
        user(
          'Make this button green.\n[pointing at cta "यह बटन", locked selection]',
        ),
      ],
      'hi-IN',
    ).style,
    'en-IN',
  );
  assert.equal(
    conversationLanguage([user('આ બટન મોટું કરો')], 'gu-IN').style,
    'gu-IN',
  );
  assert.equal(
    conversationLanguage([user('Please reply in Hinglish.')]).style,
    'hinglish',
  );
});

test('Hinglish commands, confirmations and actual page tours stay mixed rather than English-only', () => {
  for (const text of [
    'Rakho.',
    'Haan, theek hai!',
    'rakh lo',
    'sahi hai',
    'ठीक है।',
  ])
    assert.ok(KEEP_RE.test(text), text);
  for (const text of ['nahi, ruko.', 'नहीं रुको।', 'cancel karo!'])
    assert.ok(STOP_RE.test(text), text);
  for (const text of [
    commandReply('keep', 'hinglish'),
    spokenUI('compare', 'hinglish'),
    spokenUI('chosen', 'hinglish', { name: 'Forest' }),
    spokenUI('progress', 'hinglish'),
  ]) {
    assert.match(text, /[\u0900-\u097f]/);
    assert.match(text, /[A-Za-z]{3}/);
  }
  const after = [
    {
      id: 'cta',
      tag: 'button',
      text: 'Book a workshop',
      styles: { 'background-color': 'green' },
    },
  ];
  const before = [{ ...after[0], styles: { 'background-color': 'white' } }];
  assert.match(
    changedTargets(before, after, [], 'hinglish')[0].description,
    /color update/,
  );
  assert.match(
    pageTour(
      [{ id: 'headline', tag: 'h1', text: 'Made by hand' }],
      'hinglish',
    )[0].description,
    /main headline/,
  );
});

test('a spoken reply is ready only after its closing quote, including escaped quotes', () => {
  assert.equal(completedReply('{"reply":"हाँ, this button'), null);
  assert.equal(completedReply('{"reply":"Use the \\"round\\" style'), null);
  assert.equal(
    completedReply('{"reply":"Use the \\"round\\" style.","action":'),
    'Use the "round" style.',
  );
});

test('completion audio waits for the explanation while its speech is prefetched', async () => {
  const playing = [],
    finishes = [];
  const player = {
    play: (audio) => {
      playing.push(audio);
      const d = deferred();
      finishes.push(d.resolve);
      return d.promise;
    },
    stop() {
      finishes.at(-1)?.('stopped');
    },
  };
  const queue = new SpeechQueue(player);
  let preparedCompletion = false;
  const first = queue.enqueue(async () => ({ audio: 'explanation' }));
  const second = queue.enqueue(async () => {
    preparedCompletion = true;
    return { audio: 'completion' };
  });
  await flush();
  assert.ok(preparedCompletion);
  assert.deepEqual(playing, ['explanation']);
  assert.equal(
    await queue.enqueue(async () => ({ audio: 'stale progress' }), {
      kind: 'progress',
    }),
    'skipped',
  );
  finishes[0]('ended');
  assert.equal(await first, 'ended');
  await flush();
  assert.deepEqual(playing, ['explanation', 'completion']);
  finishes[1]('ended');
  assert.equal(await second, 'ended');
  await flush();
  assert.equal(queue.busy, false);
});

test('barge-in cancels pending and playing audio; a stale response cannot speak over a new turn', async () => {
  const stale = deferred(),
    played = [];
  const player = {
    async play(audio) {
      played.push(audio);
      return 'ended';
    },
    stop() {},
  };
  const queue = new SpeechQueue(player);
  let signal;
  const old = queue.enqueue((s) => {
    signal = s;
    return stale.promise;
  });
  await flush();
  queue.cancel();
  assert.ok(signal.aborted);
  assert.equal(await old, 'cancelled');
  assert.equal(
    await queue.enqueue(async () => ({ audio: 'new reply' })),
    'ended',
  );
  stale.resolve({ audio: 'old reply' });
  await flush();
  assert.deepEqual(played, ['new reply']);
});

test('brief sound only ducks playback; sustained speech confirms the interruption once', () => {
  function session() {
    const seen = [];
    const v = new VoiceSession({
      onSpeechStart: () => seen.push('duck'),
      onSpeechConfirmed: () => seen.push('interrupt'),
      onSpeechDiscarded: () => seen.push('resume'),
    });
    let amplitude = 0;
    v.analyser = { getFloatTimeDomainData: (buf) => buf.fill(amplitude) };
    v.buf = new Float32Array(32);
    v.segment = { id: 's1', startedAt: Date.now() };
    v.discardSegment = () => {
      v.segment = null;
    };
    v.openSegment = () => {
      v.segment = { id: 'next', startedAt: Date.now() };
    };
    v.closeSegment = () => {
      seen.push('utterance');
      v.resetVad();
      v.openSegment();
    };
    return {
      v,
      seen,
      frames(n, value) {
        amplitude = value;
        for (let i = 0; i < n; i++) v.tick();
      },
    };
  }
  const short = session();
  short.frames(3, 0.3);
  short.frames(14, 0);
  assert.deepEqual(short.seen, ['duck', 'resume']);
  const long = session();
  long.frames(10, 0.3);
  assert.deepEqual(long.seen, ['duck', 'interrupt']);
  long.frames(14, 0);
  assert.deepEqual(long.seen, ['duck', 'interrupt', 'utterance']);
});

test('the server emits audible reply readiness before the completed edit decision', async () => {
  const original = globalThis.fetch,
    key = process.env.SARVAM_API_KEY;
  process.env.SARVAM_API_KEY = 'test-key';
  const events = [];
  let captured;
  try {
    globalThis.fetch = async (_url, options) => {
      captured = JSON.parse(options.body);
      const enc = new TextEncoder();
      const prefix = '{"reply":"हाँ, इसी button को green कर देता हूँ.",';
      const suffix =
        '"action":"edit","intent":"Make the button green","patches":[{"id":"cta","styles":{"background-color":"green"}}]}';
      return new Response(
        new ReadableStream({
          start(c) {
            for (const text of [prefix, suffix])
              c.enqueue(
                enc.encode(
                  'data: ' +
                    JSON.stringify({
                      choices: [{ delta: { content: text } }],
                    }) +
                    '\n\n',
                ),
              );
            c.enqueue(
              enc.encode(
                'data: ' +
                  JSON.stringify({
                    choices: [{ delta: {}, finish_reason: 'stop' }],
                  }) +
                  '\n\n',
              ),
            );
            c.close();
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    };
    const result = await chat(
      {
        language: 'en-IN',
        messages: [user('Is button ko green karo, thoda clean lagega.')],
        context: {
          html: '<!doctype html><html><head><title>Example</title></head><body><button data-cg-id="cta">Book a workshop</button><p>Keep this content unchanged.</p></body></html>',
          elements: [{ id: 'cta', tag: 'button', text: 'Book a workshop' }],
        },
      },
      { emit: (e) => events.push(e) },
    );
    assert.equal(result.voiceStyle, 'hinglish');
    assert.match(
      captured.messages[1].content,
      /natural conversational Hinglish/,
    );
    assert.ok(
      events.findIndex((e) => e.type === 'reply_ready') <
        events.findIndex((e) => e.type === 'intent'),
    );
    assert.equal(events.filter((e) => e.type === 'reply_ready').length, 1);
    assert.equal(
      events.find((e) => e.type === 'reply_ready').language,
      'hi-IN',
    );
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = key;
  }
});

test('speech keeps Hindi-English text intact, returns MP3, and recognition preserves code mixing', async () => {
  const original = globalThis.fetch,
    key = process.env.SARVAM_API_KEY;
  process.env.SARVAM_API_KEY = 'test-key';
  try {
    const text = 'हाँ, इस button की spacing और corners update कर देता हूँ.';
    globalThis.fetch = async (url, options) => {
      if (url.endsWith('/text-to-speech')) {
        const body = JSON.parse(options.body);
        assert.equal(body.text, text);
        assert.equal(body.language_code, 'hi-IN');
        assert.equal(body.output_audio_codec, 'mp3');
        return Response.json({ audios: ['test-audio'] });
      }
      assert.equal(options.body.get('mode'), 'codemix');
      assert.equal(options.body.get('language_code'), 'unknown');
      return Response.json({ transcript: text, language_code: 'hi-IN' });
    };
    assert.equal(
      (await speak({ text, language: 'hinglish' })).mimeType,
      'audio/mpeg',
    );
    assert.equal(
      (
        await transcribe({
          buffer: Buffer.from('sample'),
          mimetype: 'audio/mpeg',
          originalname: 'sample.mp3',
        })
      ).transcript,
      text,
    );
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.SARVAM_API_KEY;
    else process.env.SARVAM_API_KEY = key;
  }
});

test('an outdated in-flight status clip is skipped when the build completes before its audio is ready', async () => {
  const status = deferred(),
    played = [];
  let active = true;
  const queue = new SpeechQueue({
    async play(audio) {
      played.push(audio);
      return 'ended';
    },
    stop() {},
  });
  const staleStatus = queue.enqueue(() => status.promise, {
    kind: 'status',
    isCurrent: () => active,
  });
  await flush();
  active = false;
  const completed = queue.enqueue(async () => ({
    audio: 'Your page is ready.',
  }));
  status.resolve({ audio: 'I am still building the page.' });
  assert.equal(await staleStatus, 'skipped');
  assert.equal(await completed, 'ended');
  assert.deepEqual(played, ['Your page is ready.']);
});

test('prepared speech waits for the human to finish and cancellation during that wait cannot play stale audio', async () => {
  const played = [],
    pause = deferred();
  const queue = new SpeechQueue({
    async play(audio) {
      played.push(audio);
      return 'ended';
    },
    stop() {},
  });
  const answer = queue.enqueue(async () => ({ audio: 'answer' }), {
    beforePlay: () => pause.promise,
  });
  await flush();
  assert.deepEqual(played, []);
  pause.resolve();
  assert.equal(await answer, 'ended');
  assert.deepEqual(played, ['answer']);
  const secondPause = deferred();
  const stale = queue.enqueue(async () => ({ audio: 'cancelled' }), {
    beforePlay: () => secondPause.promise,
  });
  await flush();
  queue.cancel();
  secondPause.resolve();
  assert.equal(await stale, 'cancelled');
  await flush();
  assert.deepEqual(played, ['answer']);
});
