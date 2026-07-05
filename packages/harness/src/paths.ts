import os from "node:os";
import path from "node:path";

// Only the model-catalog cache needs a path here (Friday's auth/config/session
// paths live in ~/.friday and don't apply — takt stores keys in its own DB).
// Cache the models.dev catalog in the OS temp dir so the package stays
// self-contained and coupled to nothing.
export function cacheDir(): string {
  return path.join(os.tmpdir(), "takt-model-catalog");
}
