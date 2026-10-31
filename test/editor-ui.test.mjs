// Client-state integration in an inert DOM. This does not replace live-browser visual or microphone QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { createServer } from 'vite';

test(
  'HTML workspace: create, edit, choose B, add an image, tour and publish',
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
    ];
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
    const calls = [];
    let requestMode = 'create';
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).endsWith('/api/health'))
        return Response.json({
          ok: true,
          chat: true,
          voice: true,
          provider: 'Test',
        });
      const body = options.body ? JSON.parse(options.body) : {};
      if (String(url).endsWith('/api/chat')) {
        calls.push(body);
        let result;
        if (requestMode === 'create')
          result = {
            action: 'edit',
            reply: 'I am building your landing page.',
            html: page,
            summary: 'Clay House landing page',
            changes: [
              { id: 'hero-heading', description: 'Created the hero' },
              { id: 'cta', description: 'Added a workshop CTA' },
            ],
          };
        else if (requestMode === 'error')
          return new Response(
            '{"type":"error","error":"The build failed safely."}\n',
            { headers: { 'content-type': 'application/x-ndjson' } },
          );
        else
          result = {
            action: 'compare',
            targets: [{ id: 'cta', label: 'Workshop button' }],
            variants: [
              {
                id: 'a',
                name: 'Forest direction',
                html: body.context.html.replace(
                  '<button',
                  '<button data-choice="forest" style="background:green"',
                ),
                changes: [{ id: 'cta', description: 'Forest button' }],
              },
              {
                id: 'b',
                name: 'Terracotta direction',
                html: body.context.html.replace(
                  '<button',
                  '<button data-choice="terracotta" style="background:coral"',
                ),
                changes: [{ id: 'cta', description: 'Terracotta button' }],
              },
            ],
          };
        return new Response(
          [
            { type: 'stage', stage: 'building', label: 'Building your page' },
            { type: 'reply', text: 'I am working on this page.' },
            { type: 'result', result },
          ]
            .map((x) => JSON.stringify(x))
            .join('\n') + '\n',
          { headers: { 'content-type': 'application/x-ndjson' } },
        );
      }
      if (String(url).endsWith('/api/publish')) {
        calls.push({ publish: body });
        return Response.json({
          url: 'https://example.com/project/clay-house',
          path: '/project/clay-house',
          publishedAt: new Date().toISOString(),
        });
      }
      throw Error('Unexpected client request: ' + url);
    };
    const server = await createServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: { port: 0, host: '127.0.0.1' },
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
      fireEvent.click(ui.getByRole('button', { name: 'New page' }));
      fireEvent.change(ui.getByRole('textbox', { name: 'Page name' }), {
        target: { value: 'My pottery page' },
      });
      fireEvent.change(
        ui.getByRole('textbox', { name: 'What are we making?' }),
        { target: { value: 'Create a pottery studio landing page.' } },
      );
      fireEvent.click(ui.getByRole('button', { name: 'Build landing page' }));
      await waitFor(() =>
        assert.ok(source().includes('Made slowly, by hand.')),
      );
      assert.equal(calls[0].task, 'create');
      await waitFor(() =>
        assert.ok(!ui.queryByRole('button', { name: 'Stop processing' })),
      );
      fireEvent.click(ui.getByRole('button', { name: 'HTML editor' }));
      fireEvent.change(
        ui.getByRole('textbox', { name: 'HTML source editor' }),
        {
          target: {
            value: page.replace(
              'Made slowly, by hand.',
              'A new headline, by hand.',
            ),
          },
        },
      );
      fireEvent.click(ui.getByRole('button', { name: 'Apply HTML' }));
      await waitFor(() =>
        assert.ok(source().includes('A new headline, by hand.')),
      );
      await waitFor(() =>
        assert.ok(!ui.queryByRole('dialog', { name: 'HTML editor' })),
      );
      requestMode = 'compare';
      fireEvent.click(ui.getByRole('button', { name: 'Two directions' }));
      fireEvent.click(
        ui.getByRole('button', {
          name: 'Open the full transcript and keyboard input',
        }),
      );
      fireEvent.change(ui.getByRole('textbox', { name: 'Message Ground' }), {
        target: { value: 'Give this button two directions.' },
      });
      fireEvent.click(ui.getByRole('button', { name: 'Send', exact: true }));
      await waitFor(() =>
        assert.ok(ui.getByRole('heading', { name: 'Which feels right?' })),
      );
      fireEvent.click(ui.getByRole('button', { name: 'Close panel' }));
      fireEvent.click(ui.getByRole('button', { name: 'Use B' }));
      await waitFor(() =>
        assert.ok(source().includes('data-choice="terracotta"')),
      );
      assert.ok(!ui.queryByRole('heading', { name: 'Which feels right?' }));
      fireEvent.click(ui.getByRole('button', { name: 'Images' }));
      fireEvent.click(ui.getByRole('button', { name: 'Add to page' }));
      await waitFor(() => assert.ok(source().includes(asset.url)));
      await waitFor(() =>
        assert.ok(!ui.getByRole('button', { name: 'Tour page' }).disabled),
      );
      fireEvent.click(ui.getByRole('button', { name: 'Tour page' }));
      await waitFor(() =>
        assert.ok(document.querySelector('.walkthrough-bar')),
      );
      const first = document.querySelector('.walkthrough-bar b').textContent;
      fireEvent.click(ui.getByRole('button', { name: 'Next', exact: true }));
      await waitFor(() =>
        assert.notEqual(
          document.querySelector('.walkthrough-bar b').textContent,
          first,
        ),
      );
      fireEvent.click(ui.getByRole('button', { name: 'Stop tour' }));
      fireEvent.click(ui.getByRole('button', { name: 'Publish', exact: true }));
      fireEvent.click(
        ui.getByRole('button', { name: 'Publish page', exact: true }),
      );
      await waitFor(() =>
        assert.ok(ui.getByRole('link', { name: 'Open page' })),
      );
      const published = calls.find((c) => c.publish).publish;
      assert.equal(published.secret.length, 64);
      assert.ok(!document.body.textContent.includes(published.secret));
      assert.ok(published.html.includes(asset.url));
      fireEvent.click(ui.getByRole('button', { name: 'Close panel' }));
      requestMode = 'error';
      const before = source();
      fireEvent.click(
        ui.getByRole('button', {
          name: 'Open the full transcript and keyboard input',
        }),
      );
      fireEvent.change(ui.getByRole('textbox', { name: 'Message Ground' }), {
        target: { value: 'Make something different.' },
      });
      fireEvent.click(ui.getByRole('button', { name: 'Send', exact: true }));
      await waitFor(() =>
        assert.ok(
          document.body.textContent.includes('The build failed safely.'),
        ),
      );
      assert.equal(source(), before);
      await new Promise((r) => setTimeout(r, 400));
      const stored = JSON.parse(
        window.localStorage.getItem(
          'commonground:v1:session:' +
            JSON.parse(window.localStorage.getItem('commonground:v1:settings'))
              .projectId,
        ),
      );
      assert.ok(
        stored.versions.some((v) =>
          v.html.includes('data-choice="terracotta"'),
        ),
      );
      assert.ok(
        !stored.versions.some((v) => v.html.includes('data-choice="forest"')),
      );
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
