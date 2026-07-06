import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { streamProvider, type ProviderInfo, type ChatRequest } from "@takt/harness";
import { writeMedia, mediaDir, loadGraph, saveGraph, entityId, sameEntity, type Anchor, type Entity } from "@takt/profile";

// Turn a repair/how-to video into TIMESTAMPED snippet anchors: sample frames
// with ffmpeg, have a vision model segment the video into chapters (each about
// one part/action, with a start/end), and attach a video_clip anchor per chapter
// to the matching graph entity. Then get_anchors hands the agent a `#t=start,end`
// Video that plays exactly the relevant span — not the whole clip. Falls back to
// a single whole-clip anchor if ffmpeg or the vision pass is unavailable.

export interface VideoFile { filename: string; data: Uint8Array }

async function complete(provider: ProviderInfo, apiKey: string | undefined, req: ChatRequest): Promise<string> {
  let text = "";
  const signal = new AbortController().signal;
  for await (const ev of streamProvider(provider, apiKey, req, signal)) if (ev.type === "text") text += ev.delta;
  return text.trim();
}

function probeDuration(path: string): number {
  try { return Math.round(parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).toString().trim())) || 0; }
  catch { return 0; }
}

function extractFrames(path: string, interval: number): { t: number; b64: string }[] {
  const dir = mkdtempSync(join(tmpdir(), "takt-vid-"));
  try {
    execFileSync("ffmpeg", ["-nostdin", "-i", path, "-vf", `fps=1/${interval},scale=512:-1`, "-f", "image2", join(dir, "f_%03d.png")], { stdio: "ignore" });
    return readdirSync(dir).filter((f) => f.endsWith(".png")).sort()
      .map((f, i) => ({ t: Math.round(i * interval), b64: readFileSync(join(dir, f)).toString("base64") }));
  } catch { return []; }
  finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ } }
}

interface Chapter { tStart: number; tEnd: number; part?: string; caption?: string }

function parseChapters(raw: string, dur: number): Chapter[] {
  try {
    const a = raw.indexOf("["), b = raw.lastIndexOf("]");
    if (a === -1 || b === -1) return [];
    const arr = JSON.parse(raw.slice(a, b + 1));
    if (!Array.isArray(arr)) return [];
    return arr.map((c: any) => ({
      tStart: Math.max(0, Math.round(Number(c.tStart) || 0)),
      tEnd: Math.min(dur, Math.round(Number(c.tEnd) || 0)),
      part: typeof c.part === "string" ? c.part.trim() : undefined,
      caption: typeof c.caption === "string" ? c.caption.trim() : undefined,
    })).filter((c: Chapter) => c.tEnd > c.tStart);
  } catch { return []; }
}

export async function addVideo(
  slug: string,
  video: VideoFile,
  opts: { provider?: ProviderInfo; model?: string; apiKey?: string; onProgress?: (m: string) => void | Promise<void> } = {},
): Promise<void> {
  const link = writeMedia(slug, video.filename, video.data);
  const url = `/assets/products/${slug}/${link}`;
  const path = join(mediaDir(slug), video.filename);
  const graph = loadGraph(slug);

  // whole-clip fallback anchor on a "Repair walkthrough" procedure
  const procId = entityId("Procedure", "repair walkthrough video");
  const ensureProc = (): Entity => {
    let e = graph.entities.find((x) => x.id === procId);
    if (!e) { e = { id: procId, name: "Repair walkthrough", type: "Procedure", description: "A video walkthrough of repair/maintenance for this product.", confidence: "EXTRACTED", source_ids: [`video:${video.filename}`], anchors: [] }; graph.entities.push(e); }
    return e;
  };
  const addAnchor = (a: Anchor, entIds: string[]) => {
    a.entityIds = entIds; graph.anchors.push(a);
    for (const id of entIds) { const e = graph.entities.find((x) => x.id === id); if (e && !e.anchors.includes(a.id)) e.anchors.push(a.id); }
  };

  const dur = opts.provider && opts.model ? probeDuration(path) : 0;
  let chapters: Chapter[] = [];
  if (dur > 0 && opts.provider && opts.model) {
    const interval = Math.max(8, Math.round(dur / 12));
    await opts.onProgress?.("Sampling video frames…");
    const frames = extractFrames(path, interval);
    if (frames.length >= 2) {
      const names = graph.entities.filter((e) => /part|subsystem|fault|procedure/i.test(e.type)).map((e) => e.name).slice(0, 60);
      const prompt = `This is a ${dur}s repair/how-to video for the product. Below are ${frames.length} frames sampled in order at these timestamps (seconds): ${frames.map((f) => f.t).join(", ")}.
Segment the video into CHAPTERS — each a contiguous span about ONE part or action. For each chapter return {"tStart":<sec>,"tEnd":<sec>,"part":"<the component it's about; match one of the product parts below when possible>","caption":"<one short line>"}.
Product parts: ${names.join(", ") || "(unknown)"}.
Return ONLY a JSON array, timestamps within 0..${dur}.`;
      try {
        await opts.onProgress?.("Chaptering the video…");
        const raw = await complete(opts.provider, opts.apiKey, {
          model: opts.model, maxTokens: 1500, tools: [],
          messages: [{ role: "user", text: prompt, images: frames.map((f) => ({ data: f.b64, mime: "image/png" as const })) }],
        });
        chapters = parseChapters(raw, dur);
      } catch (e: any) { await opts.onProgress?.(`Video chaptering skipped: ${String(e?.message ?? e)}`); }
    }
  }

  if (chapters.length) {
    let seq = graph.anchors.length;
    for (const ch of chapters) {
      const ent = ch.part ? graph.entities.find((x) => sameEntity(x, { name: ch.part! })) : undefined;
      const target = ent ?? ensureProc();
      addAnchor({ id: `a-vid-${seq++}`, kind: "video_clip", ref: { videoUrl: url, tStart: ch.tStart, tEnd: ch.tEnd }, caption: ch.caption || (ch.part ? `${ch.part} (video)` : "Repair step"), entityIds: [] }, [target.id]);
    }
    await opts.onProgress?.(`Video: ${chapters.length} timestamped snippets`);
  } else {
    // whole-clip fallback
    addAnchor({ id: `a-vid-${graph.anchors.length}`, kind: "video_clip", ref: { videoUrl: url, tStart: 0, tEnd: dur || 0 }, caption: "Repair walkthrough video", entityIds: [] }, [ensureProc().id]);
    await opts.onProgress?.("Attached repair video (whole clip)");
  }

  saveGraph(slug, graph);
}
