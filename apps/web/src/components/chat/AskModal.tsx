"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { X, ArrowLeft, ArrowRight, SkipForward, Check, Sparkles } from "lucide-react";
import type { AskAnswer, AskQuestion, AskRender } from "@prox/shared";
import type { AskState } from "@/lib/chatStore";
import { InlineArtifactFrame } from "@/components/canvas/ArtifactFrame";
import { cn } from "@/lib/cn";

interface Draft { values: string[]; custom: string; skipped: boolean }
const blankDraft = (): Draft => ({ values: [], custom: "", skipped: false });

// Interactive panel for the agent's ask_user tool. Question pills on top, a
// render-on-the-right body (question + options + custom answer | diagram), a
// review gate, and skip/submit/cancel. It grows out of the composer's position.
export function AskModal({ ask, onSubmit, onCancel }: {
  ask: AskState;
  onSubmit: (answers: AskAnswer[]) => void;
  onCancel: () => void;
}) {
  const reduce = useReducedMotion();
  const questions = ask.questions;
  const n = questions.length;
  const qid = (i: number) => questions[i]?.id ?? `q${i}`;

  const [step, setStep] = useState(0); // 0..n-1 = questions, n = review
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [preview, setPreview] = useState<number | null>(null); // option index whose render is shown

  useEffect(() => { setPreview(null); }, [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const draftOf = (i: number) => drafts[qid(i)] ?? blankDraft();
  const setDraft = (i: number, fn: (d: Draft) => Draft) =>
    setDrafts((m) => ({ ...m, [qid(i)]: fn(draftOf(i)) }));

  const toggle = (i: number, label: string, multi: boolean) =>
    setDraft(i, (d) => {
      const has = d.values.includes(label);
      const values = multi ? (has ? d.values.filter((v) => v !== label) : [...d.values, label]) : (has ? [] : [label]);
      return { ...d, values, skipped: false };
    });

  const answers: AskAnswer[] = useMemo(() => questions.map((q, i) => {
    const d = draftOf(i);
    const parts = [...d.values];
    if (d.custom.trim()) parts.push(d.custom.trim());
    const answered = parts.length > 0 && !d.skipped;
    return { questionId: qid(i), question: q.question, answer: q.multiSelect ? parts : parts.join(", "), skipped: !answered };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [questions, drafts]);

  const isAnswered = (i: number) => !answers[i]?.skipped;
  const reviewing = step >= n;
  const cur = reviewing ? null : questions[step]!;

  const activeRender: AskRender | undefined = cur
    ? (preview != null ? cur.options?.[preview]?.render : undefined) ?? cur.render
    : undefined;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      className="absolute inset-0 z-40 grid place-items-center overflow-hidden rounded-2xl" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onCancel} />
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 60, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.97 }}
        transition={reduce ? { duration: 0.15 } : { type: "spring", stiffness: 320, damping: 30 }}
        style={{ transformOrigin: "bottom center" }}
        className="relative flex h-[70%] w-[70%] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]"
      >
        {/* Header: pills + close */}
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
          <Sparkles className="size-3.5 shrink-0 text-accent" />
          <div className="prox-scroll flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            {questions.map((q, i) => (
              <Pill key={qid(i)} active={step === i} done={isAnswered(i)} onClick={() => setStep(i)}>
                {q.header || `Q${i + 1}`}
              </Pill>
            ))}
            <Pill active={reviewing} onClick={() => setStep(n)}>Review</Pill>
          </div>
          <button onClick={onCancel} aria-label="Close" className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground">
            <X className="size-4" />
          </button>
        </header>

        {/* Body */}
        {reviewing ? (
          <ReviewBody questions={questions} answers={answers} onJump={setStep} />
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-2">
            {/* Left: question + options + custom */}
            <div className="prox-scroll min-h-0 overflow-y-auto border-border p-5 md:border-r">
              <div className="text-[11px] uppercase tracking-[0.14em] text-faint">Question {step + 1} of {n}</div>
              <h2 className="mt-1.5 text-[16px] font-semibold leading-snug text-foreground">{cur!.question}</h2>

              <div className="mt-4 flex flex-col gap-2">
                {cur!.options?.map((o, oi) => {
                  const selected = draftOf(step).values.includes(o.label);
                  return (
                    <button key={o.label} onClick={() => toggle(step, o.label, !!cur!.multiSelect)}
                      onMouseEnter={() => setPreview(oi)} onFocus={() => setPreview(oi)}
                      className={cn("flex items-start gap-3 rounded-xl border px-3.5 py-2.5 text-left transition",
                        selected ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-heavy")}>
                      <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center border text-background transition",
                        cur!.multiSelect ? "rounded-[5px]" : "rounded-full",
                        selected ? "border-accent bg-accent" : "border-border-heavy")}>
                        {selected && <Check className="size-3" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-foreground">{o.label}</span>
                        {o.description && <span className="mt-0.5 block text-[12px] text-muted-foreground">{o.description}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>

              {(cur!.allowCustom ?? true) && (
                <div className="mt-3">
                  <label className="text-[11px] uppercase tracking-wide text-faint">Custom answer</label>
                  <textarea value={draftOf(step).custom} rows={2}
                    onChange={(e) => setDraft(step, (d) => ({ ...d, custom: e.target.value, skipped: false }))}
                    placeholder="Type your own answer…"
                    className="prox-scroll mt-1 w-full resize-none rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] text-foreground outline-none transition focus:border-border-heavy placeholder:text-faint" />
                </div>
              )}
            </div>

            {/* Right: render area */}
            <div className="prox-scroll hidden min-h-0 overflow-y-auto bg-background/40 md:block">
              <RenderArea render={activeRender} fromOption={preview != null && !!cur!.options?.[preview]?.render} />
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
          {!reviewing ? (
            <button onClick={() => { setDraft(step, () => ({ ...blankDraft(), skipped: true })); setStep(step + 1); }}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-foreground">
              <SkipForward className="size-3.5" /> Skip
            </button>
          ) : <span className="text-[12px] text-muted-foreground">Review your answers, then submit.</span>}

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button onClick={() => setStep(step - 1)}
                className="flex items-center gap-1.5 rounded-full border border-border px-3.5 py-1.5 text-[12.5px] text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-foreground">
                <ArrowLeft className="size-3.5" /> Back
              </button>
            )}
            {reviewing ? (
              <button onClick={() => onSubmit(answers)}
                className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-[12.5px] font-medium text-background transition hover:opacity-90">
                <Check className="size-3.5" /> Submit
              </button>
            ) : (
              <button onClick={() => setStep(step + 1)}
                className="flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-[12.5px] font-medium text-background transition hover:opacity-90">
                {step === n - 1 ? "Review" : "Next"} <ArrowRight className="size-3.5" />
              </button>
            )}
          </div>
        </footer>
      </motion.div>
    </motion.div>
  );
}

function Pill({ active, done, onClick, children }: { active: boolean; done?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn("relative flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[12px] transition",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground")}>
      {done && !active && <Check className="size-3 text-success" />}
      {children}
    </button>
  );
}

function RenderArea({ render, fromOption }: { render?: AskRender; fromOption: boolean }) {
  if (!render) {
    return <div className="grid h-full place-items-center p-8 text-center text-[12px] text-faint">No diagram for this {fromOption ? "option" : "question"}.</div>;
  }
  if (render.kind === "ascii") {
    return <pre className="prox-scroll m-0 overflow-x-auto p-5 font-mono text-[12px] leading-[1.5] text-foreground whitespace-pre-wrap">{render.content}</pre>;
  }
  return <InlineArtifactFrame code={render.content} kind={render.kind} />;
}

function ReviewBody({ questions, answers, onJump }: { questions: AskQuestion[]; answers: AskAnswer[]; onJump: (i: number) => void }) {
  return (
    <div className="prox-scroll min-h-0 flex-1 overflow-y-auto p-5">
      <h2 className="text-[16px] font-semibold text-foreground">Review</h2>
      <div className="mt-3 flex flex-col gap-2">
        {questions.map((q, i) => {
          const a = answers[i]!;
          const ans = a.skipped ? "Skipped" : Array.isArray(a.answer) ? a.answer.join(", ") : a.answer;
          return (
            <button key={i} onClick={() => onJump(i)}
              className="flex flex-col gap-1 rounded-xl border border-border bg-surface px-4 py-3 text-left transition hover:border-border-heavy">
              <span className="text-[12px] text-muted-foreground">{q.header || `Q${i + 1}`} · {q.question}</span>
              <span className={cn("text-[13px]", a.skipped ? "text-faint italic" : "font-medium text-foreground")}>{ans || "—"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
