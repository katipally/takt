import { AutoTokenizer, AutoModelForSequenceClassification } from "@huggingface/transformers";

// Local, zero-key cross-encoder reranker (ONNX via Transformers.js). Given a
// query + candidate passages it scores each [query, passage] pair and returns
// them ranked by relevance. Used to re-order an over-fetched KNN result set —
// the single biggest precision win over raw vector similarity.

const MODEL = process.env.TAKT_RERANK_MODEL ?? "Xenova/bge-reranker-base";

let tokPromise: Promise<any> | null = null;
let modelPromise: Promise<any> | null = null;

const getTok = () => (tokPromise ??= AutoTokenizer.from_pretrained(MODEL));
const getModel = () => (modelPromise ??= AutoModelForSequenceClassification.from_pretrained(MODEL, { dtype: "q8" }));

/** Warm the reranker (download + init) ahead of first use. */
export async function warmReranker(): Promise<void> {
  await Promise.all([getTok(), getModel()]);
}

/**
 * Rerank `passages` by cross-encoder relevance to `query`. Returns the original
 * indices with scores, sorted most-relevant first (optionally capped to topN).
 */
export async function rerank(
  query: string, passages: string[], topN?: number,
): Promise<{ index: number; score: number }[]> {
  if (!passages.length) return [];
  const tok = await getTok();
  const model = await getModel();
  // Cross-encoder: one [query, passage] pair per passage → a single relevance
  // logit each. text_pair aligns element-wise with the first argument.
  const inputs = tok(passages.map(() => query), { text_pair: passages, padding: true, truncation: true });
  const { logits } = await model(inputs);
  const scores = (logits.tolist() as number[][]).map((row) => row[0]!);
  const ranked = scores
    .map((score, index) => ({ index, score }))
    .sort((a, b) => b.score - a.score);
  return topN ? ranked.slice(0, topN) : ranked;
}
