// Gap-free playback of the agent's 24 kHz PCM by scheduling each buffer on a
// running clock. Barge-in = flush(epoch): stop everything scheduled and ignore
// any audio tagged below the new epoch (kills the ~1s already-buffered tail).
//
// CRITICAL for barge-in on speakers: we do NOT play to AudioContext.destination.
// Chrome's echo canceller (AEC3) is blind to Web-Audio output, so the agent's
// voice would leak into the mic uncancelled and break barge-in. Instead we route
// through a MediaStreamDestination into a hidden <audio> element — which AEC3
// DOES reference — so the agent's own voice is cancelled from the mic input.
export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private sink: MediaStreamAudioDestinationNode | null = null;
  private el: HTMLAudioElement | null = null;
  private nextAt = 0;
  private runStart = 0; // start time of the current continuous speaking run
  private minEpoch = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private rms = 0;

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.sink = this.ctx.createMediaStreamDestination();
      const el = document.createElement("audio");
      el.autoplay = true;
      el.setAttribute("playsinline", "");
      el.srcObject = this.sink.stream; // <audio> playback → AEC references it
      el.style.display = "none";
      document.body.appendChild(el);
      void el.play().catch(() => {});
      this.el = el;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  // On-device TTS (Kokoro) hands us Float32 @ 24 kHz directly.
  play(f32: Float32Array, epoch: number, sampleRate = 24000) {
    if (epoch < this.minEpoch || f32.length === 0) return;
    const ctx = this.ensure();
    let sum = 0;
    for (let i = 0; i < f32.length; i++) { const v = f32[i]!; sum += v * v; }
    this.rms = Math.sqrt(sum / f32.length);
    const buf = ctx.createBuffer(1, f32.length, sampleRate);
    buf.getChannelData(0).set(f32); // avoids the Float32Array<ArrayBufferLike> generic mismatch
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.sink!); // → MediaStreamDestination → <audio> (AEC-visible)
    const startAt = Math.max(ctx.currentTime + 0.02, this.nextAt);
    if (this.nextAt <= ctx.currentTime) this.runStart = startAt; // fresh run after a gap
    src.start(startAt);
    this.nextAt = startAt + buf.duration;
    this.sources.add(src);
    src.onended = () => { this.sources.delete(src); if (this.sources.size === 0) this.rms = 0; };
  }

  flush(epoch: number) {
    this.minEpoch = epoch;
    for (const s of this.sources) { try { s.stop(); } catch { /* already stopped */ } }
    this.sources.clear();
    this.nextAt = 0;
    this.runStart = 0;
    this.rms = 0;
  }

  level() { return this.rms; }
  /** 0..1 fraction of the current speaking run's audio that has played — drives
   *  word-by-word caption reveal so the text tracks the actual voice. */
  progress() {
    const ctx = this.ctx;
    if (!ctx || this.nextAt <= this.runStart) return 1;
    return Math.max(0, Math.min(1, (ctx.currentTime - this.runStart) / (this.nextAt - this.runStart)));
  }
  resume() { this.ensure(); }
  close() {
    this.flush(Number.MAX_SAFE_INTEGER);
    try { this.el?.pause(); this.el?.remove(); } catch { /* */ }
    try { void this.ctx?.close(); } catch { /* */ }
    this.el = null; this.sink = null; this.ctx = null;
  }
}
