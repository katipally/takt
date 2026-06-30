import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

// Local, zero-key embeddings via Transformers.js (ONNX, CPU). bge-small-en-v1.5
// is asymmetric: passages are embedded plain, queries get a short retrieval
// instruction. 384-dim, L2-normalized → cosine == dot product.

const MODEL = process.env.PROX_EMBED_MODEL ?? "Xenova/bge-small-en-v1.5";
const QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: ";

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractorPromise) {
    extractorPromise = pipeline("feature-extraction", MODEL) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

/** Warm the model (download + init) ahead of first use. */
export async function warmEmbedder(): Promise<void> {
  await getExtractor();
}

async function embed(texts: string[]): Promise<Float32Array[]> {
  if (!texts.length) return [];
  const extractor = await getExtractor();
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  const rows = output.tolist() as number[][];
  return rows.map((r) => Float32Array.from(r));
}

/** Embed manual passages (chunks) for storage. */
export async function embedPassages(texts: string[]): Promise<Float32Array[]> {
  return embed(texts);
}

/** Embed a user/agent search query for retrieval. */
export async function embedQuery(text: string): Promise<Float32Array> {
  const [vec] = await embed([QUERY_INSTRUCTION + text]);
  return vec!;
}

export const EMBED_DIM = 384;
