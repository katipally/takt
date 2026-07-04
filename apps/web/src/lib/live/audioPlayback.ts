// Gap-free playback of the agent's 24 kHz PCM by scheduling each buffer on a
// running clock. Barge-in = flush(epoch): stop everything scheduled and ignore
// any audio tagged below the new epoch (kills the ~1s already-buffered tail).
export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private nextAt = 0;
  private minEpoch = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private rms = 0;

  private ensure(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  play(pcm: Int16Array, epoch: number) {
    if (epoch < this.minEpoch || pcm.length === 0) return;
    const ctx = this.ensure();
    const f32 = new Float32Array(pcm.length);
    let sum = 0;
    for (let i = 0; i < pcm.length; i++) { const v = pcm[i]! / 32768; f32[i] = v; sum += v * v; }
    this.rms = Math.sqrt(sum / pcm.length);
    const buf = ctx.createBuffer(1, f32.length, 24000);
    buf.copyToChannel(f32, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime + 0.02, this.nextAt);
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
    this.rms = 0;
  }

  level() { return this.rms; }
  resume() { this.ensure(); }
  close() { this.flush(Number.MAX_SAFE_INTEGER); try { void this.ctx?.close(); } catch { /* */ } this.ctx = null; }
}
