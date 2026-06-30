import { z } from "zod";

// Shape of the agent's ask_user tool input AND the ask_user SSE event payload —
// one schema, reused on both sides. The model uses this to ask the user 1–4
// clarifying questions mid-answer; the browser renders them in the Ask modal.

// A small visual that explains a question or an option. "ascii" is plain text /
// SVG shown verbatim; "react"/"html" render in the sandboxed artifact iframe.
export const askRenderSchema = z.object({
  kind: z.enum(["ascii", "react", "html"]),
  content: z.string().min(1).max(60_000),
});

export const askOptionSchema = z.object({
  label: z.string().min(1).max(120),
  description: z.string().max(400).optional(),
  render: askRenderSchema.optional(),
});

export const askQuestionSchema = z.object({
  id: z.string().optional(),
  question: z.string().min(1).max(600),
  header: z.string().max(40).optional().describe("Very short pill label, e.g. 'Polarity'"),
  multiSelect: z.boolean().optional().describe("Allow selecting more than one option"),
  allowCustom: z.boolean().optional().describe("Show a free-text custom answer field (default true)"),
  options: z.array(askOptionSchema).max(8).optional(),
  render: askRenderSchema.optional().describe("Default visual for this question"),
});

export const askQuestionsSchema = z.array(askQuestionSchema).min(1).max(4);

export type AskRender = z.infer<typeof askRenderSchema>;
export type AskOption = z.infer<typeof askOptionSchema>;
export type AskQuestion = z.infer<typeof askQuestionSchema>;

// One answer the browser sends back per question.
export const askAnswerSchema = z.object({
  questionId: z.string(),
  question: z.string(),
  answer: z.union([z.string(), z.array(z.string())]),
  skipped: z.boolean().optional(),
});
export type AskAnswer = z.infer<typeof askAnswerSchema>;

export const askAnswerPayloadSchema = z.object({
  askId: z.string(),
  cancelled: z.boolean().optional(),
  answers: z.array(askAnswerSchema).optional(),
});
export type AskAnswerPayload = z.infer<typeof askAnswerPayloadSchema>;
