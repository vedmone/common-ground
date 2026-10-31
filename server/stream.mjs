// Provider SSE and application NDJSON use incremental decoders: packet boundaries are arbitrary.
export async function readCompletion(response, onToken) {
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = '',
    content = '',
    finish;
  const consume = (line) => {
    if (!line.startsWith('data:')) return;
    const value = line.slice(5).trim();
    if (!value || value === '[DONE]') return;
    const data = JSON.parse(value);
    if (data.error) {
      console.error(
        'Provider stream failed',
        data.error?.type || data.error?.code || 'unknown',
        String(data.error?.message || '').slice(0, 240),
      );
      throw new Error('The model stream failed.');
    }
    const choice = data.choices?.[0];
    if (choice?.finish_reason) finish = choice.finish_reason;
    const delta = choice?.delta?.content || '';
    if (delta) {
      content += delta;
      onToken?.(delta, content);
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let end;
      while ((end = pending.indexOf('\n')) >= 0) {
        consume(pending.slice(0, end).replace(/\r$/, ''));
        pending = pending.slice(end + 1);
      }
      if (done) break;
    }
    if (pending.trim()) consume(pending);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  return { choices: [{ message: { content }, finish_reason: finish }] };
}

export function partialReply(json) {
  const match = String(json).match(/"reply"\s*:\s*"/);
  if (!match) return '';
  let raw = '',
    escaped = false;
  for (const c of json.slice(match.index + match[0].length)) {
    if (c === '"' && !escaped) break;
    raw += c;
    if (c === '\\') escaped = !escaped;
    else escaped = false;
  }
  // Only decode complete escapes; an incomplete Unicode sequence arrives in the next packet.
  raw = raw.replace(/\\u[0-9a-f]{0,3}$|\\$/i, '');
  try {
    return JSON.parse('"' + raw + '"');
  } catch {
    return '';
  }
}

export function completedReply(json) {
  const match = String(json).match(/"reply"\s*:\s*"/);
  if (!match) return null;
  let escaped = false;
  for (const c of json.slice(match.index + match[0].length)) {
    if (c === '"' && !escaped) return partialReply(json);
    if (c === '\\') escaped = !escaped;
    else escaped = false;
  }
  return null;
}

export async function serveChat(req, res, run) {
  if (!String(req.headers.accept || '').includes('application/x-ndjson'))
    return res.status(200).json(await run(req.body));
  res
    .status(200)
    .setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  const controller = new AbortController();
  const emit = (event) => {
    if (!controller.signal.aborted && !res.writableEnded)
      res.write(JSON.stringify(event) + '\n');
  };
  const close = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', close);
  emit({
    type: 'stage',
    stage: 'understanding',
    label: 'Understanding your request',
  });
  const heartbeat = setInterval(() => emit({ type: 'heartbeat' }), 12000);
  try {
    const result = await run(req.body, { emit, signal: controller.signal });
    emit({ type: 'result', result });
  } catch (error) {
    if (!controller.signal.aborted) {
      console.error('Chat request failed', error.name, error.message);
      emit({
        type: 'error',
        error: error.status
          ? error.message
          : 'The request could not finish. Your current page is safe.',
      });
    }
  } finally {
    clearInterval(heartbeat);
    res.off('close', close);
    if (!res.writableEnded) res.end();
    controller.abort();
  }
}
