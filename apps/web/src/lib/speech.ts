// Tiny global speech-synthesis controller with a subscribe hook so any message's
// "Read aloud" button can reflect and stop the currently-playing utterance.

let speakingId: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const clean = (s: string) => s.replace(/[#*`_>|]/g, "").replace(/\[p\.\d+\]/g, "").replace(/\s+/g, " ").trim();

export const speech = {
  subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); },
  speakingId: () => speakingId,

  speak(id: string, text: string) {
    try {
      window.speechSynthesis?.cancel();
      const u = new SpeechSynthesisUtterance(clean(text).slice(0, 4000));
      u.rate = 1.05;
      u.onend = () => { if (speakingId === id) { speakingId = null; notify(); } };
      u.onerror = () => { if (speakingId === id) { speakingId = null; notify(); } };
      speakingId = id;
      notify();
      window.speechSynthesis?.speak(u);
    } catch { /* no speechSynthesis */ }
  },

  stop() {
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    speakingId = null;
    notify();
  },
};
