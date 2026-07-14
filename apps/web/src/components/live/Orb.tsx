"use client";

// The in-call voice orb is the shared Takt live mark (a lit orb with a carved
// waveform), driven live by mic/agent level. Kept as a thin re-export so existing
// call sites (InCall, MiniBar) don't change.
export { LiveOrb as Orb } from "./LiveOrb";
