// Client-state integration in an inert DOM. This does not replace live-browser visual or microphone QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

test(
  'voice tasks keep running through questions, stops, choices, retries and changing the visible version',
  { timeout: 30000 },
  async () => {
    const window = new Window({
      url: 'http://127.0.0.1:4320',
      settings: {
        enableJavaScriptEvaluation: false,
        disableJavaScriptFileLoading: true,
        enableCSSFileLoading: false,
        enableImageFileLoading: false,
      },
    });
    const globals = [
      'window',
      'document',
      'navigator',
      'HTMLElement',
      'HTMLIFrameElement',
      'Element',
      'Node',
      'DOMParser',
      'MutationObserver',
      'getComputedStyle',
      'localStorage',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'Audio',
      'MediaRecorder',
    ];
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      configurable: true,
    });
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({}) },
      configurable: true,
    });
    window.MediaRecorder = class {
      static isTypeSupported() {
        return true;
      }
    };
    window.Audio = class {
      duration = 0.1;
      play() {
        queueMicrotask(() => {
          this.onplaying?.();
          queueMicrotask(() => this.onended?.());
        });
        return Promise.resolve();
      }
      pause() {}
    };
    const previous = new Map(
      globals.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
    );
    const previousFetch = globalThis.fetch;
    for (const key of globals)
      Object.defineProperty(globalThis, key, {
        configurable: true,
        writable: true,
        value:
          typeof window[key] === 'function' &&
          [
            'getComputedStyle',
            'requestAnimationFrame',
            'cancelAnimationFrame',
          ].includes(key)
            ? window[key].bind(window)
            : window[key],
      });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.setItem(
      'commonground:v1:settings',
      JSON.stringify({ welcomeSeen: true }),
    );
    const asset = {
      id: 'image-fixture',
      url: 'https://example.com/photo.png',
      name: 'Studio photograph',
    };
    window.localStorage.setItem('commonground:images', JSON.stringify([asset]));
    const page =
      '<!doctype html><html><head><title>Clay House</title></head><body><nav data-cg-id="nav">Clay House · Workshops</nav><main data-cg-id="main"><h1 data-cg-id="hero-heading">Made slowly, by hand.</h1><section data-cg-id="workshops"><h2 data-cg-id="workshop-heading">Our workshops</h2><p data-cg-id="copy">Meet the clay and make something yours.</p><button data-cg-id="cta">Book a workshop</button></section></main><footer data-cg-id="footer">Visit Jaipur</footer></body></html>';
    const questionCalls = [],
      pendingQuestions = [];
    const calls = [],
      speech = [],
      builds = [],
      delayedEdits = [];
    let transcript = '',
      voiceInstance,
      pauseReady = false,
      holdSpeech = false;
    const heldSpeech = [];
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).endsWith('/api/health'))
        return Response.json({
          ok: true,
          chat: true,
          voice: true,
          provider: 'Fixture',
        });
      if (String(url).endsWith('/api/discuss')) {
        const body = JSON.parse(options.body);
        questionCalls.push({ body, signal: options.signal });
        if (body.messages.at(-1).content === 'Why this color?')
          return new Promise((resolve) =>
            pendingQuestions.push(() =>
              resolve(
                Response.json({
                  route: 'answer',
                  reply: 'Terracotta gives the studio a warm, handmade feel.',
                  voiceStyle: 'en-IN',
                }),
              ),
            ),
          );
        return Response.json({
          route: 'answer',
          reply: 'इस page में serif heading एक handmade feel देता है.',
          voiceStyle: 'hinglish',
        });
      }
      if (String(url).endsWith('/api/transcribe'))
        return Response.json({ transcript, language_code: 'hi-IN' });
      const body = options.body ? JSON.parse(options.body) : {};
      if (String(url).endsWith('/api/speak')) {
        speech.push(body.text);
        if (holdSpeech)
          return new Promise((resolve) =>
            heldSpeech.push(() =>
              resolve(Response.json({ audio: 'AAAA', mimeType: 'audio/mpeg' })),
            ),
          );
        return Response.json({ audio: 'AAAA', mimeType: 'audio/mpeg' });
      }
      if (String(url).endsWith('/api/chat')) {
        calls.push(body);
        if (body.task === 'create') {
          const build = {
            body,
            signal: options.signal,
            aborted: false,
            closed: false,
          };
          builds.push(build);
          const stream = new ReadableStream({
            start(controller) {
              build.clarify = () => {
                build.closed = true;
                controller.enqueue(
                  new TextEncoder().encode(
                    JSON.stringify({
                      type: 'result',
                      result: {
                        action: 'clarify',
                        reply: 'What is the studio called?',
                        targets: [],
                      },
                    }) + '\n',
                  ),
                );
                controller.close();
              };
              build.fail = () => {
                build.closed = true;
                controller.error(new Error('The builder did not respond.'));
              };
              build.finish = (html = page) => {
                build.closed = true;
                controller.enqueue(
                  new TextEncoder().encode(
                    JSON.stringify({
                      type: 'result',
                      result: {
                        action: 'edit',
                        reply: 'Your page is ready.',
                        html,
                        summary: 'Created workshop page',
                        changes: [
                          {
                            id: 'hero-heading',
                            description: 'Added the headline',
                          },
                        ],
                      },
                    }) + '\n',
                  ),
                );
                controller.close();
              };
              controller.enqueue(
                new TextEncoder().encode(
                  JSON.stringify({
                    type: 'stage',
                    stage: 'building',
                    label: 'Creating your landing page',
                  }) + '\n',
                ),
              );
              options.signal.addEventListener(
                'abort',
                () => {
                  build.aborted = true;
                  if (!build.closed)
                    controller.error(new DOMException('Aborted', 'AbortError'));
                },
                { once: true },
              );
            },
          });
          return new Response(stream, {
            headers: { 'content-type': 'application/x-ndjson' },
          });
        }
        if (body.messages.at(-1).content === 'Make the heading blue slowly.') {
          return new Promise((resolve) =>
            delayedEdits.push(() =>
              resolve(
                Response.json({
                  action: 'edit',
                  reply: 'Heading is blue.',
                  summary: 'Blue heading',
                  html: body.context.html.replace(
                    '<h1 ',
                    '<h1 style="color:blue" ',
                  ),
                  changes: [
                    {
                      id: 'hero-heading',
                      description: 'Made the heading blue',
                    },
                  ],
                }),
              ),
            ),
          );
        }
        if (
          body.compare ||
          body.messages.at(-1).content.includes('two directions')
        )
          return Response.json({
            action: 'compare',
            reply: 'Choose a direction.',
            variants: [
              {
                id: 'a',
                name: 'Warm',
                html: body.context.html.replace(
                  '<h1 ',
                  '<h1 style="color:red" ',
                ),
                changes: [],
              },
              {
                id: 'b',
                name: 'Cool',
                html: body.context.html.replace(
                  '<h1 ',
                  '<h1 style="color:blue" ',
                ),
                changes: [],
              },
            ],
          });
        let updated = body.context.html;
        if (body.messages.at(-1).content.includes('A real workshop page'))
          updated = updated.replace(
            'Made slowly, by hand.',
            'A real workshop page',
          );
        if (body.messages.at(-1).content.includes('Open every Sunday'))
          updated = updated.replace(
            '</footer>',
            '<p data-cg-id="sunday">Open every Sunday</p></footer>',
          );
        if (body.messages.at(-1).content.includes('Make the headline green'))
          updated = updated.replace('<h1 ', '<h1 style="color:green" ');
        return Response.json({
          action: 'edit',
          versionId: 'shared-fixture-version',
          reply: 'Applying your queued change.',
          html: updated,
          summary: 'Queued change',
          changes: [
            {
              id: 'hero-heading',
              description: 'Updated the requested element',
            },
          ],
        });
      }
      throw Error('Unexpected fixture request: ' + url);
    };
    const server = await createServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
      },
      appType: 'custom',
    });
    let cleanup, observer, readyTimer;
    try {
      const React = await import('react');
      const {
        render,
        fireEvent,
        waitFor,
        cleanup: clean,
        act,
      } = await import('@testing-library/react');
      cleanup = clean;
      const { VoiceSession } = await server.ssrLoadModule('/src/lib/voice.js');
      VoiceSession.prototype.start = async function () {
        voiceInstance = this;
      };
      VoiceSession.prototype.stop = function () {
        this.closed = true;
      };
      const { default: App } = await server.ssrLoadModule('/src/App.jsx');
      const seen = new WeakMap();
      const announce = () => {
        if (pauseReady) return;
        for (const frame of document.querySelectorAll('iframe')) {
          const html = frame.getAttribute('srcdoc');
          if (!html || seen.get(frame) === html || !frame.contentWindow)
            continue;
          seen.set(frame, html);
          const doc = new window.DOMParser().parseFromString(html, 'text/html');
          const elements = [...doc.querySelectorAll('[data-cg-id]')].map(
            (el) => ({
              id: el.getAttribute('data-cg-id'),
              tag: el.tagName.toLowerCase(),
              kind: el.tagName.toLowerCase(),
              text: (el.textContent || el.getAttribute('alt') || '').slice(
                0,
                180,
              ),
              styles: { inline: el.getAttribute('style') || '' },
            }),
          );
          window.dispatchEvent(
            new window.MessageEvent('message', {
              source: frame.contentWindow,
              data: {
                type: 'cg:ready',
                title: doc.title,
                elements,
                count: elements.length,
              },
            }),
          );
        }
      };
      observer = new window.MutationObserver(() => {
        clearTimeout(readyTimer);
        readyTimer = setTimeout(() => act(() => announce()), 10);
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['srcdoc'],
      });
      const ui = render(React.createElement(App));
      const source = () =>
        document
          .querySelector('iframe[title^="Preview of"]')
          ?.getAttribute('srcdoc') || '';
      await waitFor(() =>
        assert.ok(!ui.getByRole('button', { name: 'Tour page' }).disabled),
      );
      fireEvent.click(ui.getByRole('button', { name: 'Join call' }));
      await waitFor(() => assert.ok(voiceInstance));
      await waitFor(() =>
        assert.ok(ui.getByRole('button', { name: 'Leave the call' })),
      );
      fireEvent.click(ui.getByRole('button', { name: 'New page' }));
      fireEvent.change(ui.getByRole('textbox', { name: 'Page name' }), {
        target: { value: 'My pottery page' },
      });
      fireEvent.change(
        ui.getByRole('textbox', { name: 'What are we making?' }),
        {
          target: {
            value:
              'Create a pottery studio landing page with three workshop sections.',
          },
        },
      );
      fireEvent.click(ui.getByRole('button', { name: 'Build landing page' }));
      await waitFor(() => assert.equal(builds.length, 1));
      assert.ok(ui.getByRole('button', { name: 'Stop processing' }));
      async function say(text, expectSpeech = true) {
        const count = speech.length;
        transcript = text;
        await act(async () => {
          voiceInstance.h.onSpeechStart?.('fixture');
          voiceInstance.h.onSpeechConfirmed?.('fixture');
          voiceInstance.h.onUtterance(new Blob(['fixture']), {
            segmentId: 'fixture',
            filename: 'speech.webm',
            endedAt: Date.now(),
          });
        });
        if (expectSpeech)
          await waitFor(() =>
            assert.ok(
              speech.length > count,
              `Expected spoken reply to: ${text}`,
            ),
          );
      }
      await say('kitna time lagega?');
      assert.equal(
        builds[0].aborted,
        false,
        'asking how long must not abort page generation',
      );
      assert.equal(
        calls.length,
        1,
        'status must not launch a replacement edit against the blank canvas',
      );
      assert.ok(
        ui.getByRole('button', { name: 'Stop processing' }),
        'the progress indicator stays mounted',
      );
      await say("Okay, I'll wait.");
      assert.equal(builds[0].aborted, false);
      assert.equal(calls.length, 1);
      await say('Which font are you using?');
      assert.equal(questionCalls.length, 1);
      assert.equal(
        calls.length,
        1,
        'a separate question never enters the writer',
      );
      assert.equal(builds[0].aborted, false);
      assert.equal(document.querySelectorAll('.task-card').length, 1);
      await say('Make the headline read A real workshop page.');
      await say('Add a footer note called Open every Sunday.');
      assert.equal(
        calls.length,
        1,
        'follow-up edits wait for the complete initial page',
      );
      assert.equal(builds[0].aborted, false);
      await say('what is happening?');
      assert.equal(calls.length, 1);
      await act(async () => builds[0].finish());
      await waitFor(() => assert.ok(source().includes('A real workshop page')));
      await waitFor(() =>
        assert.ok(!ui.queryByRole('button', { name: 'Stop processing' })),
      );
      await waitFor(() => assert.ok(source().includes('Open every Sunday')));
      assert.equal(calls.length, 3);
      assert.equal(
        document.querySelectorAll('.task-card').length,
        3,
        'each work request has one task card',
      );
      assert.ok(calls[1].context.html.includes('Made slowly, by hand.'));
      assert.ok(calls[2].context.html.includes('A real workshop page'));
      assert.ok(
        calls
          .slice(1)
          .every(
            (c) =>
              c.task === 'edit' && !c.context.html.includes('A FRESH CANVAS'),
          ),
      );
      await waitFor(() =>
        assert.ok(
          [...document.querySelectorAll('.task-card')].every(
            (c) => c.dataset.taskState === 'ready',
          ),
        ),
      );
      const firstCard = [...document.querySelectorAll('.task-card')].find(
        (c) => c.querySelector('.task-number').textContent.trim() === '01',
      );
      fireEvent.click(firstCard.querySelector('.task-select'));
      fireEvent.click(
        ui.getByRole('button', { name: 'View result for task 1' }),
      );
      await waitFor(() =>
        assert.ok(
          source().includes('Made slowly, by hand.') &&
            !source().includes('A real workshop page'),
        ),
      );
      const lastCard = [...document.querySelectorAll('.task-card')].find(
        (c) => c.querySelector('.task-number').textContent.trim() === '03',
      );
      fireEvent.click(lastCard.querySelector('.task-select'));
      fireEvent.click(
        ui.getByRole('button', { name: 'View result for task 3' }),
      );
      await waitFor(() => assert.ok(source().includes('Open every Sunday')));
      await say("Okay, I'll wait.");
      assert.equal(
        calls.length,
        3,
        'waiting after completion must not invent another build',
      );
      assert.match(speech.at(-1), /ready|तैयार/);
      function newBuild(brief) {
        fireEvent.click(ui.getByRole('button', { name: 'New page' }));
        fireEvent.change(ui.getByRole('textbox', { name: 'Page name' }), {
          target: { value: 'Resumable page' },
        });
        fireEvent.change(
          ui.getByRole('textbox', { name: 'What are we making?' }),
          { target: { value: brief } },
        );
        fireEvent.click(ui.getByRole('button', { name: 'Build landing page' }));
      }
      const originalBrief =
        'Build a complete pottery studio landing page that can be resumed.';
      newBuild(originalBrief);
      await waitFor(() => assert.equal(builds.length, 2));
      transcript = 'Why this color?';
      await act(async () => {
        voiceInstance.h.onSpeechConfirmed?.();
        voiceInstance.h.onUtterance(new Blob(['fixture']), {
          segmentId: 'question-2',
          filename: 'speech.webm',
          endedAt: Date.now(),
        });
      });
      await waitFor(() => assert.equal(pendingQuestions.length, 1));
      await say('Make the headline green.');
      assert.equal(questionCalls.at(-1).signal.aborted, false);
      await act(async () => pendingQuestions[0]());
      await waitFor(() =>
        assert.ok(
          speech.some((t) => t.includes('Terracotta gives')),
          'a new work request must not silence the pending answer',
        ),
      );
      await say('Why this color?', false);
      await waitFor(() => assert.equal(pendingQuestions.length, 2));
      const stopSignal = questionCalls.at(-1).signal;
      fireEvent.click(ui.getByRole('button', { name: 'Stop Ground' }));
      await waitFor(() => assert.ok(stopSignal.aborted));
      assert.equal(
        builds[1].aborted,
        false,
        'Stop Ground stops the independent answer, not the page build',
      );
      await act(async () => pendingQuestions[1]());
      await say('Why this color?', false);
      await waitFor(() => assert.equal(pendingQuestions.length, 3));
      const questionSignal = questionCalls.at(-1).signal;
      fireEvent.click(ui.getByRole('button', { name: 'Cancel task 1' }));
      assert.equal(
        questionSignal.aborted,
        false,
        'cancelling work must not cancel an independent answer',
      );
      await act(async () => pendingQuestions[2]());
      await waitFor(() =>
        assert.ok(
          document.body.textContent.includes(
            'Terracotta gives the studio a warm, handmade feel.',
          ),
        ),
      );

      await waitFor(() => assert.equal(builds[1].aborted, true));
      await waitFor(() =>
        assert.ok(ui.getByRole('button', { name: 'Resume build' })),
      );
      await say('What is happening?');
      assert.match(speech.at(-1), /interrupted|रुका/);
      assert.equal(
        builds.length,
        2,
        'status does not restart cancelled work without a resume request',
      );
      fireEvent.click(ui.getByRole('button', { name: 'Resume build' }));
      await waitFor(() => assert.equal(builds.length, 3));
      assert.equal(builds[2].body.task, 'create');
      assert.equal(builds[2].body.messages.at(-1).content, originalBrief);
      await act(async () => builds[2].finish());
      await waitFor(() =>
        assert.ok(source().includes('Made slowly, by hand.')),
      );
      await waitFor(() =>
        assert.ok(!ui.queryByRole('button', { name: 'Resume build' })),
      );
      newBuild('Create a workshop website with a hero and two sections.');
      await waitFor(() => assert.equal(builds.length, 4));
      await say('Make the headline green.');
      const callsBeforeFailure = calls.length;
      await act(async () => builds[3].fail());
      await waitFor(() =>
        assert.ok(ui.getByRole('button', { name: 'Resume build' })),
      );
      assert.ok(document.body.textContent.includes('Build needs another try'));
      assert.equal(
        calls.length,
        callsBeforeFailure,
        'follow-ups must wait for a successful original build',
      );
      await say('Resume build', false);
      await waitFor(() => assert.equal(builds.length, 5));
      assert.equal(builds[4].body.task, 'create');
      await act(async () => builds[4].finish());
      await waitFor(() =>
        assert.ok(source().includes('Made slowly, by hand.')),
      );
      await waitFor(() => assert.ok(calls.length > callsBeforeFailure + 1), {
        timeout: 8000,
      });
      assert.ok(!calls.at(-1).context.html.includes('A FRESH CANVAS'));
      await waitFor(
        () => assert.ok(!ui.queryByRole('button', { name: 'Stop processing' })),
        { timeout: 8000 },
      );
      const clarificationBrief =
        'Create a pottery landing page in terracotta and cream.';
      newBuild(clarificationBrief);
      await waitFor(() => assert.equal(builds.length, 6));
      await act(async () => builds[5].clarify());
      await waitFor(() =>
        assert.ok(ui.getByRole('status', { name: 'Waiting for details' })),
      );
      await say('kitna time lagega?');
      assert.equal(
        builds.length,
        6,
        'a status question must not discard the pending clarification',
      );
      assert.match(speech.at(-1), /detail|जानकारी/);
      await say('Clay House', false);
      await waitFor(() => assert.equal(builds.length, 7));
      assert.equal(builds[6].body.task, 'create');
      assert.ok(
        builds[6].body.messages.at(-1).content.includes(clarificationBrief),
      );
      assert.ok(builds[6].body.messages.at(-1).content.includes('Clay House'));
      await act(async () => builds[6].finish());
      await waitFor(
        () => assert.ok(!ui.queryByRole('button', { name: 'Stop processing' })),
        { timeout: 8000 },
      );
      assert.ok(source().includes('Made slowly, by hand.'));
      assert.ok(!ui.queryByRole('status', { name: 'Waiting for details' }));
      await waitFor(() =>
        assert.ok(
          speech.some((text) => text.includes('Task 1 ready है.')),
          'completion follows the current Hindi-English mix instead of the original English brief',
        ),
      );
      await say('Give this button two directions.', false);
      await waitFor(() =>
        assert.ok(
          document.querySelector('.task-card[data-task-state="needs_choice"]'),
        ),
      );
      const comparisonCount = calls.length;
      await say('Add a footer note called Open every Sunday.', false);
      assert.equal(
        calls.length,
        comparisonCount,
        'queued work waits for the design choice',
      );
      assert.ok(
        document.querySelector('iframe[title*="Warm"]'),
        'new work leaves comparison options visible',
      );
      const waitingCard = document.querySelector(
        '.task-card[data-task-state="needs_choice"]',
      );
      if (!waitingCard.classList.contains('is-open'))
        fireEvent.click(waitingCard.querySelector('.task-select'));
      fireEvent.click(
        waitingCard.querySelector('button[aria-label^="Remove task"]'),
      );
      await waitFor(() => assert.ok(calls.length > comparisonCount));
      await waitFor(() => assert.ok(source().includes('Open every Sunday')));
      await waitFor(() =>
        assert.ok(
          !document.querySelector('.task-card[data-task-state="running"]'),
        ),
      );
      await say('Make the heading blue slowly.', false);
      await waitFor(() => assert.equal(delayedEdits.length, 1));
      const beforeKeep = calls.length;
      await say('Keep this version.');
      assert.equal(
        calls.length,
        beforeKeep,
        'keep affects the visible version immediately, not a future queued result',
      );
      // Keyboard undo changes the visible base while the pending edit is still being generated.
      fireEvent.keyDown(window, { key: 'z', metaKey: true });
      await waitFor(() => assert.ok(!source().includes('Open every Sunday')));
      await act(async () => delayedEdits[0]());
      await waitFor(() =>
        assert.ok(document.body.textContent.includes('Ready to view')),
      );
      assert.ok(
        !source().includes('color:blue'),
        'an edit based on a different version cannot replace the visible page',
      );
      await say('Give this button two directions.', false);
      await waitFor(() => assert.ok(ui.getByRole('button', { name: 'Use B' })));
      await say('Why this color?', false);
      await waitFor(() => assert.equal(pendingQuestions.length, 4));
      const choiceQuestion = questionCalls.at(-1).signal;
      await say('Add a footer note called Open every Sunday.', false);
      const callsBeforeChoice = calls.length;
      fireEvent.click(ui.getByRole('button', { name: 'Use B' }));
      assert.equal(
        choiceQuestion.aborted,
        false,
        'choosing a variant preserves the independent answer',
      );
      await waitFor(() => assert.ok(calls.length > callsBeforeChoice));
      assert.ok(
        calls.at(-1).context.html.includes('color:blue'),
        'the next task starts from the chosen direction',
      );
      await act(async () => pendingQuestions[3]());
      await waitFor(() =>
        assert.ok(
          !document.querySelector('.task-card[data-task-state="running"]'),
        ),
      );
      pauseReady = true;
      fireEvent.keyDown(window, { key: 'z', metaKey: true });
      await say('Make the headline green.', false);
      const beforeReadiness = calls.length;
      await act(async () => new Promise((r) => setTimeout(r, 120)));
      assert.equal(
        calls.length,
        beforeReadiness,
        'a queued task must wait for the current preview element inventory',
      );
      pauseReady = false;
      await act(async () => announce());
      await waitFor(() => assert.equal(calls.length, beforeReadiness + 1));
      await waitFor(() =>
        assert.ok(
          !document.querySelector('.task-card[data-task-state="running"]'),
        ),
      );
      const beforeTour = calls.length,
        speechBeforeTour = speech.length;
      await say('Give me a tour.', false);
      await waitFor(() => assert.ok(speech.length > speechBeforeTour));
      assert.equal(
        calls.length,
        beforeTour,
        'a voice tour does not enter the edit queue',
      );
      await say('Give this button two directions.', false);
      await waitFor(() => assert.ok(ui.getByRole('button', { name: 'Use B' })));
      await say('Why this color?', false);
      await waitFor(() => assert.equal(pendingQuestions.length, 5));
      holdSpeech = true;
      await act(async () => pendingQuestions[4]());
      await waitFor(() => assert.ok(heldSpeech.length));
      await say('stop', false);
      assert.ok(
        ui.getByRole('button', { name: 'Use B' }),
        'spoken stop after barge-in stops voice without throwing away the comparison',
      );
      assert.ok(
        document.querySelector('.task-card[data-task-state="needs_choice"]'),
      );
      holdSpeech = false;
      await act(async () => heldSpeech.forEach((resolve) => resolve()));
      await say('Cancel this build.', false);
      await waitFor(() =>
        assert.ok(!ui.queryByRole('button', { name: 'Use B' })),
      );
      const countBeforeDetail = builds.length;
      newBuild('Create a page that will need a detail.');
      await waitFor(() => assert.equal(builds.length, countBeforeDetail + 1));
      await act(async () => builds.at(-1).clarify());
      await waitFor(() =>
        assert.ok(
          document.querySelector('.task-card[data-task-state="needs_detail"]'),
        ),
      );
      const beforeNeverMind = calls.length;
      await say('never mind', false);
      await waitFor(() =>
        assert.ok(
          !document.querySelector('.task-card[data-task-state="needs_detail"]'),
        ),
      );
      await act(async () => new Promise((r) => setTimeout(r, 120)));
      assert.equal(
        calls.length,
        beforeNeverMind,
        'never mind cancels the waiting task instead of becoming creation details',
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          fixtureCalls: calls.map((c) => ({
            task: c.task,
            last: c.messages.at(-1).content,
          })),
          pendingBuilds: builds.map((b) => ({
            closed: b.closed,
            aborted: b.aborted,
          })),
          processing: document.querySelector('.processing-title')?.textContent,
        }),
      );
      throw error;
    } finally {
      observer?.disconnect();
      clearTimeout(readyTimer);
      cleanup?.();
      await new Promise((r) => setTimeout(r, 50));
      await server.close();
      await window.happyDOM.abort();
      globalThis.fetch = previousFetch;
      for (const key of globals) {
        const descriptor = previous.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    }
  },
);
