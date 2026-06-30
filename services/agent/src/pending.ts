import type { AskAnswerPayload } from "@prox/shared";

// Bridge between the ask_user tool (which awaits the user's answers) and the
// out-of-band POST /chat/answer that delivers them. Process-local map keyed by
// askId — fine for this single-process agent; would need a shared store across
// multiple instances.
type Resolver = (payload: AskAnswerPayload) => void;
const pending = new Map<string, Resolver>();

// Web route maxDuration is 300s; resolve as cancelled a bit before that so the
// turn never hangs if the user walks away.
const TIMEOUT_MS = 280_000;

export function awaitAnswers(askId: string): Promise<AskAnswerPayload> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(askId);
      resolve({ askId, cancelled: true });
    }, TIMEOUT_MS);
    pending.set(askId, (payload) => {
      clearTimeout(timer);
      pending.delete(askId);
      resolve(payload);
    });
  });
}

// Returns false if no one is waiting (e.g. the turn already ended/aborted).
export function resolveAnswers(payload: AskAnswerPayload): boolean {
  const r = pending.get(payload.askId);
  if (!r) return false;
  r(payload);
  return true;
}
