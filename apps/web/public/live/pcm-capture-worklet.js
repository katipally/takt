// Mic capture worklet. The AudioContext is created at 16 kHz, so input frames
// are already the rate the server wants — we just convert Float32 → Int16 and
// batch into 512-sample (32 ms) chunks to match the VAD frame size, then hand
// each chunk to the main thread (transferred, zero-copy).
class PCMCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Int16Array(512);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) {
        const out = this.buf.slice();
        this.port.postMessage(out.buffer, [out.buffer]);
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PCMCapture);
