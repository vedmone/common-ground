// Network layer for the hosted API and the local companion. Every call accepts an AbortSignal so
// "Interrupt" can cancel in-flight work, and every failure surfaces the server's human message.

export class ApiError extends Error {
  constructor(message, { status = 0, cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.cause = cause;
  }
}

export function isAbort(error) {
  return error?.name === 'AbortError';
}

export async function readNDJSON(body, onEvent) {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let pending = '',
    result;
  const consume = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new ApiError(event.error);
    onEvent?.(event);
    if (event.type === 'result') result = event.result;
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let end;
      while ((end = pending.indexOf('\n')) >= 0) {
        consume(pending.slice(0, end));
        pending = pending.slice(end + 1);
      }
      if (done) break;
    }
    if (pending.trim()) consume(pending);
    if (!result)
      throw new ApiError(
        'The connection ended before the page was ready. Your current version is safe.',
      );
    return result;
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
}

async function streamedChat(payload, signal, onEvent) {
  const timeout = withTimeout(signal, 190000);
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify(payload),
      signal: timeout.signal,
    });
    if (!response.ok) {
      const d = await response.json().catch(() => ({}));
      throw new ApiError(d.error || `The request failed (${response.status}).`);
    }
    if (!response.headers.get('content-type')?.includes('application/x-ndjson'))
      return response.json();
    return await readNDJSON(response.body, onEvent);
  } catch (e) {
    if (signal?.aborted) {
      const abort = new Error('Cancelled');
      abort.name = 'AbortError';
      throw abort;
    }
    if (timeout.timedOut())
      throw new ApiError(
        'The page took too long to build. Your current version is safe.',
      );
    throw e;
  } finally {
    timeout.done();
  }
}

function withTimeout(signal, ms) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

async function request(
  url,
  {
    method = 'GET',
    json,
    body,
    headers = {},
    signal,
    timeout = 30000,
    label = 'request',
  } = {},
) {
  const t = withTimeout(signal, timeout);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers:
        json !== undefined
          ? { 'Content-Type': 'application/json', ...headers }
          : headers,
      body: json !== undefined ? JSON.stringify(json) : body,
      signal: t.signal,
    });
  } catch (error) {
    t.done();
    if (t.timedOut())
      throw new ApiError(`The ${label} took too long. Please try again.`, {
        cause: error,
      });
    if (signal?.aborted || isAbort(error)) {
      const e = new Error('Cancelled');
      e.name = 'AbortError';
      throw e;
    }
    throw new ApiError(
      `Could not reach ${label === 'companion' ? 'the companion' : 'the server'}. Check your connection and try again.`,
      { cause: error },
    );
  }
  let data = null;
  const text = await response.text().catch(() => '');
  t.done();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      data?.error ||
      (response.status === 404
        ? 'This endpoint is not available on this server.'
        : `The ${label} failed (${response.status}).`);
    throw new ApiError(message, { status: response.status });
  }
  if (data === null)
    throw new ApiError(`The ${label} returned an unreadable response.`, {
      status: response.status,
    });
  return data;
}

export const api = {
  discuss: (payload, signal, base = '', token = '') =>
    request(`${base}/api/discuss`, {
      method: 'POST',
      json: payload,
      signal,
      timeout: 55000,
      label: 'conversation',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  health: (signal) =>
    request('/api/health', { signal, timeout: 8000, label: 'health check' }),
  publish: (payload) =>
    request('/api/publish', {
      method: 'POST',
      json: payload,
      timeout: 60000,
      label: 'publishing',
    }),
  uploadImage: (file) => {
    const body = new FormData();
    body.set('file', file);
    return request('/api/media', {
      method: 'POST',
      body,
      timeout: 60000,
      label: 'image upload',
    });
  },
  chat: (payload, signal, onEvent) =>
    onEvent
      ? streamedChat(payload, signal, onEvent)
      : request('/api/chat', {
          method: 'POST',
          json: payload,
          signal,
          timeout: 190000,
          label: 'AI request',
        }),
  speak: (text, language, signal, base = '', token = '') =>
    request(`${base}/api/speak`, {
      method: 'POST',
      json: { text, language },
      signal,
      timeout: 60000,
      label: 'voice request',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  transcribe: (blob, filename, signal, base = '', token = '') => {
    const form = new FormData();
    form.append('file', blob, filename);
    return request(`${base}/api/transcribe`, {
      method: 'POST',
      body: form,
      signal,
      timeout: 60000,
      label: 'transcription',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
};

function normalizeBase(url) {
  const trimmed = String(url || '')
    .trim()
    .replace(/\/+$/, '');
  const parsed = new URL(trimmed);
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw new ApiError('Use an http:// companion address.');
  return trimmed;
}

export const companionApi = {
  normalizeBase,
  health: (base, token, signal) =>
    request(`${normalizeBase(base)}/health`, {
      signal,
      timeout: 6000,
      label: 'companion',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  chat: (base, token, payload, signal) =>
    request(`${normalizeBase(base)}/chat`, {
      method: 'POST',
      json: payload,
      signal,
      timeout: 240000,
      label: 'companion',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  undo: (base, token, signal) =>
    request(`${normalizeBase(base)}/undo`, {
      method: 'POST',
      json: {},
      signal,
      timeout: 20000,
      label: 'companion',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
};
