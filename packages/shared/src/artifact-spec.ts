import { z } from "zod";

// Validation for the agent's emit_artifact tool input. The model writes a
// self-contained React/JSX component or an HTML document that renders inside a
// sandboxed iframe with React, Tailwind (CDN), Recharts and Lucide preloaded.

export const artifactInputSchema = z.object({
  title: z.string().min(1).max(120),
  /**
   * Stable identifier for this artifact's lineage within a chat. Reuse the SAME
   * key to publish a new VERSION of an existing artifact (e.g. after the user
   * asks to change it); use a NEW key for a genuinely different artifact.
   * Omit to derive one from the title.
   */
  key: z.string().min(1).max(80).optional(),
  kind: z.enum(["react", "html"]),
  /**
   * For kind "react": JSX defining a component and rendering it, OR a component
   * that the host mounts. The host exposes React, ReactDOM, Recharts, and lucide
   * as globals; code may `return <App/>` style or define `function App(){...}`.
   * For kind "html": a full or partial HTML fragment.
   */
  code: z.string().min(1).max(100_000),
});

export type ArtifactInput = z.infer<typeof artifactInputSchema>;
