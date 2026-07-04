// Mic → 16 kHz PCM16 chunks via the capture worklet. Browser AEC/NS/AGC are on
// so the agent's own TTS coming out of the speakers doesn't feed back into the
// mic (primary echo defense; the server also half-duplex-gates).
export class MicCapture {
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private node?: AudioWorkletNode;
  private muted = false;
  private rms = 0;

  async start(onPcm: (buf: ArrayBuffer) => void, deviceId?: string) {
    const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 };
    if (deviceId) audio.deviceId = { exact: deviceId };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio });
    this.ctx = new AudioContext({ sampleRate: 16000 });
    await this.ctx.audioWorklet.addModule("/live/pcm-capture-worklet.js");
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.node.port.onmessage = (ev: MessageEvent) => {
      const buf = ev.data as ArrayBuffer;
      this.rms = rmsOf(buf);
      if (!this.muted) onPcm(buf);
    };
    src.connect(this.node);
    // Keep the graph alive without audible output (some browsers GC an
    // unconnected worklet node).
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.node.connect(sink);
    sink.connect(this.ctx.destination);
  }

  setMuted(m: boolean) { this.muted = m; }
  level() { return this.muted ? 0 : this.rms; }
  stop() {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    try { void this.ctx?.close(); } catch { /* */ }
  }
}

function rmsOf(buf: ArrayBuffer): number {
  const i16 = new Int16Array(buf);
  let s = 0;
  for (let i = 0; i < i16.length; i++) { const v = i16[i]! / 32768; s += v * v; }
  return Math.sqrt(s / Math.max(1, i16.length));
}
