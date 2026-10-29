// Plays synthesized speech. Only one clip plays at a time; stop() resolves the current play() promise.

export class SpeechPlayer {
  constructor() {
    this.audio = null;
    this.url = null;
    this.finish = null;
    this.listeners = new Set();
    this.playing = false;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this.playing);
  }

  play(base64, mimeType = 'audio/wav', { onStart } = {}) {
    this.stop();
    let bytes;
    try {
      const bin = atob(base64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
      return Promise.resolve('error');
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: mimeType || 'audio/wav' }));
    const audio = new Audio(url);
    audio.preload = 'auto';
    this.audio = audio;
    this.url = url;
    return new Promise((resolve) => {
      let started = false;
      const finish = (reason) => {
        if (this.finish !== finish) return;
        this.finish = null;
        audio.onplaying = audio.onended = audio.onerror = null;
        audio.pause();
        URL.revokeObjectURL(url);
        if (this.audio === audio) {
          this.audio = null;
          this.url = null;
        }
        this.playing = false;
        this.emit();
        resolve(reason);
      };
      this.finish = finish;
      audio.onplaying = () => {
        if (started || this.finish !== finish) return;
        started = true;
        this.playing = true;
        this.emit();
        onStart?.(Number.isFinite(audio.duration) ? audio.duration : 0);
      };
      audio.onended = () => finish('ended');
      audio.onerror = () => finish('error');
      audio.play().catch((err) => finish(err?.name === 'NotAllowedError' ? 'blocked' : 'error'));
    });
  }

  stop() {
    this.finish?.('stopped');
  }
}
