import type { ReactNode } from "react";

// Callbacks the host wires into rendered surfaces. All optional so a surface can
// render standalone (e.g. in the static harness) with no host.
export interface RenderCtx {
  onCitation?: (page: number, productSlug?: string) => void;
  onSource?: (s: { page?: number; url?: string; title?: string; caption?: string }) => void;
  /** interactive Button/Form/Select submit — resumes the agent turn */
  onAction?: (actionId: string, value: unknown) => void | Promise<void>;
  /** frozen history: interactive nodes render disabled at their final state */
  readOnly?: boolean;
  /** two-way-bound surface data model (JSON-Pointer get/set); set by UIRenderer */
  data?: SurfaceData;
}

/** Read/write access to the surface's `data` model for bound nodes. */
export interface SurfaceData {
  get: (pointer?: string) => unknown;
  set: (pointer: string, value: unknown) => void;
}

export interface NodeProps<P = Record<string, unknown>> {
  props: P;
  children?: ReactNode;
  ctx: RenderCtx;
  /** this node's JSON-Pointer into the surface data model (bindable nodes) */
  bind?: string;
}
