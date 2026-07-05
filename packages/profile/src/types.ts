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
