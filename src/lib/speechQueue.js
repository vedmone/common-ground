// Prepare the next clip while the current clip plays. A cancellation invalidates every queued clip,
// even when an upstream request ignores AbortSignal and resolves later.
export class SpeechQueue {
  constructor(player) {
    this.player = player;
    this.entries = [];
    this.epoch = 0;
    this.running = false;
  }
  get busy() {
    return this.entries.length > 0;
  }
  enqueue(prepare, { onStart, kind = 'reply', isCurrent, beforePlay } = {}) {
    if (kind === 'progress' && this.busy) return Promise.resolve('skipped');
    const controller = new AbortController();
    const entry = {
      controller,
      onStart,
      isCurrent,
      beforePlay,
      epoch: this.epoch,
    };
    const outcome = new Promise((resolve, reject) =>
      Object.assign(entry, { resolve, reject }),
    );
    // Handle a prefetched rejection immediately rather than leaving it unhandled until playback.
    entry.prepared = Promise.resolve()
      .then(() => prepare(controller.signal))
      .then(
        (audio) => ({ audio }),
        (error) => ({ error }),
      );
    this.entries.push(entry);
    this.drain();
    return outcome;
  }
  async drain() {
    if (this.running) return;
    this.running = true;
    const epoch = this.epoch;
    try {
      while (this.entries.length && epoch === this.epoch) {
        const entry = this.entries[0];
        const { audio, error } = await entry.prepared;
        if (!error && entry.beforePlay)
          await entry.beforePlay(entry.controller.signal);
        if (epoch !== this.epoch || entry.controller.signal.aborted) return;
        if (error) entry.reject(error);
        else if (entry.isCurrent && !entry.isCurrent())
          entry.resolve('skipped');
        else if (!audio?.audio) entry.resolve('error');
        else {
          try {
            const outcome = await this.player.play(
              audio.audio,
              audio.mimeType,
              { onStart: entry.onStart },
            );
            if (epoch !== this.epoch) return;
            entry.resolve(outcome);
          } catch (error) {
            entry.reject(error);
          }
        }
        this.entries.shift();
      }
    } finally {
      if (epoch === this.epoch) this.running = false;
    }
  }
  cancel() {
    this.epoch++;
    for (const entry of this.entries) {
      entry.controller.abort();
      entry.resolve('cancelled');
    }
    this.entries = [];
    this.running = false;
    this.player.stop();
  }
}
