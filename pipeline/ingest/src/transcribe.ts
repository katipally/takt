import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Best-effort local audio transcription. We do NOT bundle a speech model — set
// TAKT_WHISPER_CMD to a command that reads an audio file path as its LAST arg and
// prints the transcript to stdout, e.g.
//   whisper-cli -m models/ggml-base.en.bin -nt -otxt -f      (whisper.cpp)
//   whisper --model base --output_format txt --output_dir -   (openai-whisper)
// If it's unset or fails, transcription is skipped and ingest continues (audio is
// an enhancement, never required). ponytail: env-configured binary, not a bundled
// model — swap in a hosted STT call here if you'd rather not run whisper locally.
export function transcribeAudio(filename: string, data: Uint8Array): string | null {
  const cmd = process.env.TAKT_WHISPER_CMD?.trim();
  if (!cmd) return null;
  const dir = mkdtempSync(join(tmpdir(), "takt-audio-"));
  const path = join(dir, filename.replace(/[^\w.-]+/g, "_"));
  try {
    writeFileSync(path, data);
    const parts = cmd.split(/\s+/);
    const out = execFileSync(parts[0]!, [...parts.slice(1), path], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const text = out.replace(/\r/g, "").trim();
    return text.length > 4 ? text : null;
  } catch {
    return null;
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp cleanup */ }
  }
}
