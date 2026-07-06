import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Takt declarative UI spec — the wire format for a rendered answer "surface".
//
// A surface is a FLAT adjacency list of typed nodes (id → node, children by id).
// It streams and caches well, renders order-independently (render as soon as
// `root` exists; unknown child refs become placeholders and fill in later), and
// the union of the per-component prop schemas below IS: the validation contract,
// the security boundary (only these components can ever render), and the model's
// vocabulary (the system prompt is generated from these schemas — see
// `catalogPromptSection`). Replaces the old free-form React/HTML `emit_artifact`.
// ─────────────────────────────────────────────────────────────────────────────

// ── node / surface ───────────────────────────────────────────────────────────
export const uiNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  props: z.record(z.unknown()).optional(),
  /** child node ids — only meaningful on container components */
  children: z.array(z.string()).optional(),
  /** JSON-Pointer into the surface `data` model (interactive/data-bound nodes) */
  bind: z.string().optional(),
});
export type UINode = z.infer<typeof uiNodeSchema>;

export const uiSurfaceSchema = z.object({
  id: z.string().min(1),
  /** id of the root node — exactly one node is the root */
  root: z.string().min(1),
  nodes: z.array(uiNodeSchema).min(1),
  /** optional data model for two-way-bound interactive nodes */
  data: z.record(z.unknown()).optional(),
  /** stable lineage key within a chat — same key ⇒ new version of a surface */
  key: z.string().optional(),
  title: z.string().optional(),
});
export type UISurface = z.infer<typeof uiSurfaceSchema>;

// ── catalog component definition ─────────────────────────────────────────────
interface CatalogEntry {
  props: z.ZodTypeAny;
  /** one-line purpose, used in the generated system prompt */
  description: string;
  /** may this component hold child nodes (via `children`)? */
  container?: boolean;
}

// small shared prop shapes
const tone = z.enum(["default", "tip", "warn", "ok", "note"]);
const media = { src: z.string().min(1), caption: z.string().optional() };

// ── the catalog (~28 components) ─────────────────────────────────────────────
export const CATALOG = {
  // layout / containers
  Section: { container: true, description: "A vertical group of nodes with an optional heading.", props: z.object({ title: z.string().optional() }) },
  Columns: { container: true, description: "Responsive columns that reflow to one column when narrow.", props: z.object({ count: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional() }) },
  Card: { container: true, description: "A bordered, elevated container for a grouped set of child nodes.", props: z.object({ title: z.string().optional(), tone: z.enum(["default", "accent", "muted"]).optional() }) },
  Tabs: { description: "Tabbed panels; each item has a label and markdown body.", props: z.object({ items: z.array(z.object({ label: z.string(), content: z.string() })).min(1) }) },
  Accordion: { description: "Collapsible sections; each item has a title and markdown content.", props: z.object({ items: z.array(z.object({ title: z.string(), content: z.string() })).min(1) }) },
  Divider: { description: "A horizontal rule separating sections.", props: z.object({}) },

  // text / info
  Heading: { description: "A section heading.", props: z.object({ text: z.string(), level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional() }) },
  Prose: { description: "A block of GitHub-flavored markdown (paragraphs, lists, bold, inline code, links). The workhorse for narrative text.", props: z.object({ markdown: z.string() }) },
  Callout: { description: "A tinted note box for a tip, warning, or aside.", props: z.object({ tone: tone.optional(), title: z.string().optional(), markdown: z.string() }) },
  Stat: { description: "A big-number stat/KPI tile.", props: z.object({ value: z.string(), label: z.string(), hint: z.string().optional() }) },
  KeyValue: { description: "A two-column key/value spec list.", props: z.object({ rows: z.array(z.object({ key: z.string(), value: z.string() })).min(1) }) },
  Quote: { description: "A pull quote with optional attribution.", props: z.object({ text: z.string(), cite: z.string().optional() }) },

  // media (multimodal)
  Image: { description: "A single image (a real /assets/ crop URL or an uploaded/fetched image). Never invent URLs.", props: z.object({ ...media, alt: z.string().optional() }) },
  Gallery: { description: "A responsive grid of images.", props: z.object({ images: z.array(z.object({ src: z.string(), alt: z.string().optional(), caption: z.string().optional() })).min(1) }) },
  Video: { description: "An inline video player.", props: z.object({ ...media, poster: z.string().optional() }) },
  Audio: { description: "An inline audio player.", props: z.object({ ...media }) },
  Model3D: { description: "An interactive 3D model viewer for an ingested /assets/*.glb model.", props: z.object({ ...media, alt: z.string().optional() }) },
  Mermaid: { description: "A themed Mermaid diagram (flowchart/sequence/state/gantt) from Mermaid source.", props: z.object({ code: z.string(), caption: z.string().optional() }) },

  // data
  Table: { description: "A data table.", props: z.object({ columns: z.array(z.string()).min(1), rows: z.array(z.array(z.string())).min(1), caption: z.string().optional() }) },
  Chart: { description: "A chart. `data` is an array of row objects; `series` names the numeric keys to plot; `xKey` is the category key.", props: z.object({ kind: z.enum(["line", "bar", "area", "pie"]), data: z.array(z.record(z.union([z.string(), z.number()]))).min(1), series: z.array(z.object({ key: z.string(), label: z.string().optional(), color: z.string().optional() })).min(1), xKey: z.string().optional(), caption: z.string().optional() }) },
  Timeline: { description: "A vertical timeline of dated events.", props: z.object({ events: z.array(z.object({ date: z.string().optional(), title: z.string(), body: z.string().optional() })).min(1) }) },
  Steps: { description: "A numbered procedure with a connecting spine.", props: z.object({ steps: z.array(z.object({ title: z.string(), body: z.string().optional() })).min(1) }) },

  // reference
  Citation: { description: "An inline page-citation chip; place right after the claim it supports.", props: z.object({ page: z.number(), label: z.string().optional(), productSlug: z.string().optional() }) },
  SourceCard: { description: "A card linking to a source page or URL.", props: z.object({ title: z.string(), page: z.number().optional(), url: z.string().optional(), caption: z.string().optional() }) },

  // interactive (call back into the agent)
  Button: { description: "A button that submits `value` under `actionId` back to the agent, resuming the turn.", props: z.object({ label: z.string(), actionId: z.string(), value: z.string().optional(), variant: z.enum(["primary", "secondary"]).optional() }) },
  Form: { description: "A form that collects typed fields and submits them under `actionId`, resuming the turn.", props: z.object({ actionId: z.string(), fields: z.array(z.object({ name: z.string(), label: z.string(), type: z.enum(["text", "number", "select", "checkbox", "textarea"]).optional(), options: z.array(z.string()).optional(), placeholder: z.string().optional(), required: z.boolean().optional() })).min(1), submitLabel: z.string().optional() }) },
  Select: { description: "A standalone dropdown that submits its choice under `actionId`.", props: z.object({ actionId: z.string(), label: z.string().optional(), options: z.array(z.string()).min(1), placeholder: z.string().optional() }) },

  // escape hatch — server-bundled arbitrary React (three, d3, etc.)
  Sandbox: { description: "Arbitrary self-contained React for anything the catalog can't express (novel interactive/3D/canvas). `code` is an ES module with a default-exported component; imports from react, three, d3, recharts, framer-motion, lucide-react, @google/model-viewer resolve. Prefer catalog components; reach here only when nothing else fits.", props: z.object({ code: z.string().min(1), height: z.number().optional() }) },
} satisfies Record<string, CatalogEntry>;

export type CatalogType = keyof typeof CATALOG;
export const CONTAINER_TYPES = new Set(Object.entries(CATALOG).filter(([, v]) => (v as CatalogEntry).container).map(([k]) => k));

// ── validation (+ self-correct error messages for the model) ─────────────────
export interface UIValidationError { path: string; message: string; }

export function validateSurface(surface: unknown): { ok: true; surface: UISurface } | { ok: false; errors: UIValidationError[] } {
  const base = uiSurfaceSchema.safeParse(surface);
  if (!base.success) return { ok: false, errors: base.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) };
  const s = base.data;
  const errors: UIValidationError[] = [];
  const byId = new Map<string, UINode>();
  for (const n of s.nodes) {
    if (byId.has(n.id)) errors.push({ path: `nodes.${n.id}`, message: `duplicate node id "${n.id}"` });
    byId.set(n.id, n);
  }
  if (!byId.has(s.root)) errors.push({ path: "root", message: `root "${s.root}" is not among nodes` });
  for (const n of s.nodes) {
    const entry = (CATALOG as Record<string, CatalogEntry>)[n.type];
    if (!entry) { errors.push({ path: `nodes.${n.id}`, message: `unknown component type "${n.type}". Use one of: ${Object.keys(CATALOG).join(", ")}` }); continue; }
    const parsed = entry.props.safeParse(n.props ?? {});
    if (!parsed.success) for (const i of parsed.error.issues) errors.push({ path: `nodes.${n.id}.props.${i.path.join(".")}`, message: i.message });
    if (n.children?.length) {
      if (!entry.container) errors.push({ path: `nodes.${n.id}`, message: `"${n.type}" cannot have children` });
      for (const c of n.children) if (!byId.has(c)) errors.push({ path: `nodes.${n.id}.children`, message: `child "${c}" is not among nodes` });
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, surface: s };
}

// ── system-prompt generation from the schemas (single source of truth) ───────
// ponytail: a compact Zod-3 introspector — enough for the shapes the catalog
// actually uses (object/string/number/boolean/enum/literal/array/union/optional).
// Falls back to the type name for anything exotic so it can never throw.
function sig(schema: z.ZodTypeAny): string {
  const def: any = (schema as any)._def;
  switch (def?.typeName) {
    case "ZodOptional": return sig(def.innerType) + "?";
    case "ZodDefault": return sig(def.innerType);
    case "ZodNullable": return sig(def.innerType) + "|null";
    case "ZodString": return "string";
    case "ZodNumber": return "number";
    case "ZodBoolean": return "boolean";
    case "ZodLiteral": return JSON.stringify(def.value);
    case "ZodEnum": return def.values.map((v: string) => JSON.stringify(v)).join("|");
    case "ZodArray": return sig(def.type) + "[]";
    case "ZodUnion": return def.options.map((o: z.ZodTypeAny) => sig(o)).join("|");
    case "ZodRecord": return "object";
    case "ZodObject": {
      const shape = def.shape();
      const inner = Object.entries(shape).map(([k, v]) => {
        const opt = (v as any)._def?.typeName === "ZodOptional" ? "?" : "";
        return `${k}${opt}: ${sig((v as z.ZodTypeAny))}`.replace("?: ", opt ? ": " : ": ");
      });
      return `{ ${inner.join(", ")} }`;
    }
    default: return "any";
  }
}

/** The catalog reference block injected into the agent's system prompt. */
export function catalogPromptSection(): string {
  const lines = Object.entries(CATALOG).map(([name, entry]) => {
    const e = entry as CatalogEntry;
    const shape = (e.props as any)._def?.typeName === "ZodObject" ? sig(e.props) : "{}";
    const tag = e.container ? " (container — may hold children[])" : "";
    return `• ${name}${tag} — ${e.description}\n    props ${shape}`;
  });
  return lines.join("\n");
}
