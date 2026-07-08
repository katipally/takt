// A Profile is OKF-conformant: a directory of `.md` files, each with YAML
// frontmatter whose only required field is `type`. Reserved files: `index.md`
// (progressive-disclosure listing, no frontmatter) and `log.md` (change history).

// Our `type` vocabulary. Producers may use others (OKF types aren't registered),
// but these are what the author step emits and the viewer groups by.
export type ConceptType =
  | "Product" | "Specs" | "Feature" | "Part" | "Safety"
  | "Procedure" | "Media" | "FAQ" | "Reference";

export interface Frontmatter {
  type: string; // REQUIRED (OKF rule 2)
  title?: string;
  description?: string;
  resource?: string; // URI of an external asset (OKF's only media hook)
  tags?: string[];
  timestamp?: string; // ISO 8601
  source?: string; // origin file/URL this concept was authored from
  [key: string]: unknown; // unknown keys preserved on round-trip (OKF §ext)
}

export interface Concept {
  id: string; // path minus `.md`, e.g. "specs" or "parts/motor"
  frontmatter: Frontmatter;
  body: string; // markdown after the frontmatter
}

export const RESERVED = new Set(["index.md", "log.md"]);

// ── compiled index (regenerable, under <slug>/.index/) ───────────────────────
// The markdown Profile is canonical; the index is a fast lookup built once at
// ingest so runtime needs zero processing. Retrieval = grep + cached semantic
// search over chunks, plus a flat media index so the canvas always has visuals.

/** A retrievable text unit (a manual page or a section of a concept). */
export interface Chunk {
  id: string;          // e.g. "owner-manual#p12"
  conceptId: string;   // the .md concept it came from
  title: string;       // concept title (for display / citation)
  page?: number;       // manual page number, when applicable
  text: string;        // the chunk body (~500 tokens)
}

export type MediaKind = "figure" | "page" | "mesh" | "video_clip" | "image";

/** A render-ready visual the canvas can pull in. Flat — no graph. */
export interface MediaItem {
  id: string;
  kind: MediaKind;
  url: string;         // /assets/... path the client loads
  caption: string;     // what it shows (embedded for semantic lookup)
  conceptId?: string;  // owning concept, when known
  page?: number;       // figure/page: source manual page
  manualKind?: string; // figure/page: which manual
  subsystem?: string;  // mesh: assembly/group (from the folder it lived in)
  nodeName?: string;   // mesh: part name
  tStart?: number;     // video_clip: start seconds
  tEnd?: number;       // video_clip: end seconds
  poster?: string;     // video_clip: thumbnail url
}
