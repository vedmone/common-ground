// Prepare following clips in parallel; one speaker plays at a time. Owners allow a tour to stop
// without discarding an independent answer or a page task's narration.
export class SpeechQueue {
  constructor(player) {
    this.player = player;
    this.entries = [];
    this.epoch = 0;
    this.running = false;
  }
  get busy() {
    return this.entries.some((e) => !e.controller.signal.aborted);
  }
  enqueue(
    prepare,
    { onStart, kind = 'reply', isCurrent, beforePlay, owner } = {},
  ) {
    if (kind === 'progress' && this.busy) return Promise.resolve('skipped');
    const controller = new AbortController();
    const entry = {
      controller,
      onStart,
      isCurrent,
      beforePlay,
      owner,
      epoch: this.epoch,
      playing: false,
    };
    entry.cancelled = new Promise(
      (resolve) => (entry.unblock = () => resolve({ cancelled: true })),
    );
    const outcome = new Promise((resolve, reject) =>
      Object.assign(entry, { resolve, reject }),
    );
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
        try {
          const prepared = await Promise.race([
            entry.prepared,
            entry.cancelled,
          ]);
          if (epoch !== this.epoch) return;
          if (prepared.cancelled || entry.controller.signal.aborted) {
            this.entries.shift();
            continue;
          }
          const { audio, error } = prepared;
          if (!error && entry.beforePlay)
            await Promise.race([
              entry.beforePlay(entry.controller.signal),
              entry.cancelled,
            ]);
          if (epoch !== this.epoch) return;
          if (entry.controller.signal.aborted) {
            this.entries.shift();
            continue;
          }
          if (error) entry.reject(error);
          else if (entry.isCurrent && !entry.isCurrent())
            entry.resolve('skipped');
          else if (!audio?.audio) entry.resolve('error');
          else {
            entry.playing = true;
            const outcome = await Promise.race([
              this.player.play(audio.audio, audio.mimeType, {
                onStart: entry.onStart,
              }),
              entry.cancelled,
            ]);
            entry.playing = false;
            if (epoch !== this.epoch) return;
            entry.resolve(
              entry.controller.signal.aborted ? 'cancelled' : outcome,
            );
          }
        } catch (error) {
          if (epoch !== this.epoch) return;
          entry.playing = false;
          entry.reject(error);
        }
        this.entries.shift();
      }
    } finally {
      if (epoch === this.epoch) this.running = false;
    }
  }
  cancelOwner(owner) {
    for (const entry of this.entries)
      if (entry.owner?.kind === owner?.kind && entry.owner?.id === owner?.id) {
        entry.controller.abort();
        entry.unblock();
        entry.resolve('cancelled');
        if (entry.playing) this.player.stop();
      }
  }
  cancel() {
    this.epoch++;
    for (const entry of this.entries) {
      entry.controller.abort();
      entry.unblock();
      entry.resolve('cancelled');
    }
    this.entries = [];
    this.running = false;
    this.player.stop();
  }
}
