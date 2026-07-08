// Non-PDF product sources — web pages and YouTube transcripts — fetched into
// plain-text "sections" so they flow through the SAME chunk → embed → index
// pipeline as manual pages. Text-only: no page renders, no captioning, no key.
// Video/audio/3D would slot in here the same way (produce sections + optionally
// page-images); left as stubs until there's such data.

const UA = "Mozilla/5.0 (compatible; TaktBot/1.0; +https://usetakt.com)";

export interface FetchedSource {
  title: string;
  kind: "webpage" | "youtube";
  sections: string[]; // each becomes a "page" (pseudo page number = index + 1)
}

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&#39;": "'", "&quot;": '"', "&apos;": "'",
};

// HTML → text that KEEPS paragraph breaks (block tags → newlines) so we can
// sectionize sensibly, unlike the flat strip used for the agent's fetch_url.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:\/p|\/div|\/li|\/h[1-6]|br\s*\/?|\/tr|\/section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&\w+;/g, (m) => ENTITIES[m] ?? " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleOf(html: string, fallback: string): string {
  const t = /<title[^>]*>([^<]+)<\/title>/i.exec(html)?.[1]
    ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]?.replace(/<[^>]+>/g, "");
  return (t ?? fallback).replace(/\s+/g, " ").trim().slice(0, 120) || fallback;
}

// Accumulate paragraphs into ~`target`-char sections so citations get distinct
// page numbers instead of everything landing on p.1.
function sectionize(text: string, target = 3000): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf && buf.length + p.length + 2 > target) { out.push(buf); buf = ""; }
    buf += (buf ? "\n\n" : "") + p;
  }
  if (buf) out.push(buf);
  return out.length ? out : (text.trim() ? [text.trim()] : []);
}

const YT = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/;

async function fetchYouTube(id: string): Promise<FetchedSource> {
  const page = await (await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: { "user-agent": UA, "accept-language": "en" } })).text();
  const title = /"title":\s*"([^"]+)"/.exec(page)?.[1]?.replace(/\\u0026/g, "&") ?? "YouTube video";
  const track = /"captionTracks":\s*(\[[^\]]+\])/.exec(page)?.[1];
  if (!track) throw new Error("no captions available for this video");
  const baseUrl = /"baseUrl":\s*"([^"]+)"/.exec(track)?.[1]?.replace(/\\u0026/g, "&");
  if (!baseUrl) throw new Error("could not read caption track");
  const xml = await (await fetch(baseUrl, { headers: { "user-agent": UA } })).text();
  const lines = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
    .map((m) => m[1]!.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&\w+;/g, (e) => ENTITIES[e] ?? " ").replace(/<[^>]+>/g, "").trim())
    .filter(Boolean);
  const transcript = lines.join(" ").replace(/\s+/g, " ").trim();
  if (!transcript) throw new Error("empty transcript");
  return { title: `${title} (video transcript)`, kind: "youtube", sections: sectionize(transcript) };
}

/** Fetch a URL into titled text sections. Detects YouTube vs a normal web page. */
export async function fetchWebSource(url: string): Promise<FetchedSource> {
  const yt = YT.exec(url);
  if (yt) return fetchYouTube(yt[1]!);
  const res = await fetch(url, { headers: { "user-agent": UA, "accept-language": "en" }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const text = htmlToText(html);
  const sections = sectionize(text);
  if (!sections.length) throw new Error("no readable text on the page");
  return { title: titleOf(html, new URL(url).hostname), kind: "webpage", sections };
}
