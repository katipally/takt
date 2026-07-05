import { warmEmbedder } from "./index.js";
import { warmReranker } from "./rerank.js";

console.log("Warming embedding + reranker models (one-time download)…");
await Promise.all([warmEmbedder(), warmReranker()]);
console.log("Models ready.");
