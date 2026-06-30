import { warmEmbedder } from "./index.js";

console.log("Warming embedding model (one-time download)…");
await warmEmbedder();
console.log("Embedding model ready.");
