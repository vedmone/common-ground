// Microphone capture with an energy-based voice activity detector.
//
// Hands-free: a MediaRecorder runs continuously while listening so the very start of speech is never
// clipped. When speech is followed by ~1s of silence the segment is closed and emitted as one
// utterance, and a fresh segment starts. Silence-only segments are recycled every few seconds.
// Tap-to-talk: segments start/stop only when the user asks (manual stop).

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of MIME_CANDIDATES) if (MediaRecorder.isTypeSupported?.(t)) return t;
  return '';
}

export function voiceSupport() {
  if (typeof window === 'undefined') return { ok: false, reason: 'Voice needs a browser.' };
  if (!window.isSecureContext) return { ok: false, reason: 'Voice needs a secure (https or localhost) page.' };
  if (!navigator.mediaDevices?.getUserMedia) return { ok: false, reason: 'This browser cannot access a microphone.' };
  if (typeof MediaRecorder === 'undefined') return { ok: false, reason: 'This browser cannot record audio.' };
  return { ok: true, reason: '' };
}

export function micErrorMessage(error) {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Microphone permission was denied. Allow it in your browser’s site settings, then start the call again.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No microphone was found. Connect one and try again.';
  if (name === 'NotReadableError') return 'Your microphone is in use by another app.';
  return error?.message || 'The microphone could not start.';
}

const FRAME_MS = 50;

export class VoiceSession {
  constructor(handlers = {}) {
    this.h = handlers;
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.buf = null;
    this.timer = 0;
    this.recorder = null;
    this.segment = null;
    this.handsFree = true;
    this.muted = false;
    this.manualActive = false;
    this.level = 0;
    this.floor = 0.008;
    this.speechFrames = 0;
    this.silenceMs = 0;
    this.voicedMs = 0;
    this.speaking = false;
    this.playbackActive = false;
    this.mimeType = pickMimeType();
    this.closed = false;
    this.segCounter = 0;
  }

  async start({ handsFree = true } = {}) {
    this.handsFree = handsFree;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    if (this.closed) {
      this.stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    src.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      if (!this.closed) this.h.onError?.(new Error('The microphone was disconnected.'));
    });
    this.timer = setInterval(() => this.tick(), FRAME_MS);
    if (this.handsFree) this.openSegment();
    this.emitState();
  }

  get state() {
    if (this.closed) return 'off';
    if (this.muted) return 'muted';
    if (this.handsFree) return this.speaking ? 'hearing' : 'listening';
    return this.manualActive ? 'recording' : 'ready';
  }

  emitState() {
    this.h.onState?.(this.state);
  }

  setHandsFree(on) {
    if (this.handsFree === on) return;
    this.handsFree = on;
    this.discardSegment();
    this.manualActive = false;
    this.resetVad();
    if (on && !this.muted) this.openSegment();
    this.emitState();
  }

  setMuted(on) {
    this.muted = on;
    this.stream?.getAudioTracks().forEach((t) => {
      t.enabled = !on;
    });
    this.discardSegment();
    this.manualActive = false;
    this.resetVad();
    if (!on && this.handsFree) this.openSegment();
    this.emitState();
  }

  /** Ground is talking: raise the threshold so echo does not count as speech (barge-in still works). */
  setPlayback(active) {
    this.playbackActive = active;
  }

  /** Tap-to-talk start, or hands-free manual stop ("send now"). */
  beginManual() {
    if (this.muted || this.closed) return;
    this.discardSegment();
    this.resetVad();
    this.manualActive = true;
    this.openSegment();
    this.segment.voiced = true;
    this.segment.onsetAt = Date.now();
    this.h.onSpeechStart?.(this.segment.id);
    this.emitState();
  }

  finishManual() {
    if (!this.segment) return false;
    const voiced = this.segment.voiced || this.voicedMs > 200;
    this.manualActive = false;
    if (!voiced) {
      this.discardSegment();
      if (this.handsFree) this.openSegment();
      this.emitState();
      return false;
    }
    this.closeSegment();
    this.emitState();
    return true;
  }

  resetVad() {
    this.speechFrames = 0;
    this.silenceMs = 0;
    this.voicedMs = 0;
    this.speaking = false;
  }

  openSegment() {
    if (!this.stream || this.closed) return;
    const chunks = [];
    let recorder;
    try {
      recorder = this.mimeType ? new MediaRecorder(this.stream, { mimeType: this.mimeType }) : new MediaRecorder(this.stream);
    } catch (error) {
      this.h.onError?.(error);
      return;
    }
    const seg = { id: `seg${++this.segCounter}`, recorder, chunks, startedAt: Date.now(), onsetAt: 0, voiced: false, discard: false };
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      if (seg.discard || !chunks.length) return;
      const type = recorder.mimeType || this.mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type });
      const ext = /mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';
      this.h.onUtterance?.(blob, { segmentId: seg.id, filename: `speech.${ext}`, onsetAt: seg.onsetAt, endedAt: Date.now() });
    };
    recorder.start(250);
    this.segment = seg;
  }

  discardSegment() {
    const seg = this.segment;
    this.segment = null;
    if (!seg) return;
    seg.discard = true;
    if (seg.recorder.state !== 'inactive') seg.recorder.stop();
  }

  closeSegment() {
    const seg = this.segment;
    this.segment = null;
    if (seg && seg.recorder.state !== 'inactive') seg.recorder.stop();
    this.resetVad();
    if (this.handsFree && !this.muted) this.openSegment();
  }

  tick() {
    if (!this.analyser || this.closed) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = this.muted ? 0 : Math.sqrt(sum / this.buf.length);
    this.level = Math.min(1, rms * 9);
    this.h.onLevel?.(this.level);
    if (this.muted || !this.segment) return;

    const threshold = Math.max(0.014, this.floor * 2.6) * (this.playbackActive ? 2.1 : 1);
    if (!this.speaking) this.floor = Math.min(0.05, this.floor * 0.96 + rms * 0.04);

    if (!this.handsFree) {
      if (rms > threshold) {
        this.voicedMs += FRAME_MS;
        this.segment.voiced = true;
      }
      if (Date.now() - this.segment.startedAt > 60000) this.finishManual();
      return;
    }

    if (rms > threshold) {
      this.speechFrames++;
      this.silenceMs = 0;
      if (this.speaking) this.voicedMs += FRAME_MS;
      if (!this.speaking && this.speechFrames >= 3) {
        this.speaking = true;
        this.voicedMs = this.speechFrames * FRAME_MS;
        this.segment.onsetAt = Date.now() - this.speechFrames * FRAME_MS;
        this.h.onSpeechStart?.(this.segment.id);
        this.emitState();
      }
    } else {
      this.speechFrames = Math.max(0, this.speechFrames - 1);
      if (this.speaking) {
        this.silenceMs += FRAME_MS;
        if (this.silenceMs >= 700) {
          const enough = this.voicedMs >= 350;
          this.speaking = false;
          if (enough) {
            this.segment.voiced = true;
            this.closeSegment();
          } else {
            this.discardSegment();
            this.resetVad();
            this.openSegment();
            this.h.onSpeechDiscarded?.();
          }
          this.emitState();
        }
      } else if (Date.now() - this.segment.startedAt > 9000) {
        // Recycle long silent segments so uploads stay small.
        this.discardSegment();
        this.openSegment();
      }
    }
    if (this.speaking && this.segment && Date.now() - this.segment.onsetAt > 30000) {
      this.speaking = false;
      this.segment.voiced = true;
      this.closeSegment();
      this.emitState();
    }
  }

  stop() {
    this.closed = true;
    clearInterval(this.timer);
    this.discardSegment();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = null;
    this.analyser = null;
    this.h.onLevel?.(0);
    this.emitState();
  }
}
