// Client-state integration in an inert DOM. This does not replace live-browser visual or microphone QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

test(
  'voice status questions and waiting acknowledgments keep the original page build alive',
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
    const calls = [],
      speech = [],
      builds = [];
    let transcript = '',
      voiceInstance;
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).endsWith('/api/health'))
        return Response.json({
          ok: true,
          chat: true,
          voice: true,
          provider: 'Fixture',
        });
      if (String(url).endsWith('/api/transcribe'))
        return Response.json({ transcript, language_code: 'hi-IN' });
      const body = options.body ? JSON.parse(options.body) : {};
      if (String(url).endsWith('/api/speak')) {
        speech.push(body.text);
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
          voiceInstance.h.onSpeechConfirmed?.();
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
      await say('stop building', false);
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
