import type { ReactNode } from "react";
import * as C from "./components";
import { Chart } from "./Chart";
import { Mermaid } from "./Mermaid";
import { Model3D } from "./Model3D";
import { Graph } from "./Graph";
import { Sandbox } from "./Sandbox";
import { CanvasFrame } from "@/components/canvas/CanvasFrame";
import type { NodeProps } from "./ctx";

// type name → renderer. The union of these keys IS the catalog the agent may use
// (enforced by validateSurface in @takt/shared). Anything not here renders as a
// neutral placeholder — never a crash.
type R = (p: NodeProps<any>) => ReactNode; // eslint-disable-line @typescript-eslint/no-explicit-any

export const REGISTRY: Record<string, R> = {
  Section: C.Section, Columns: C.Columns, Card: C.Card, Divider: C.Divider, Tabs: C.Tabs, Accordion: C.Accordion,
  Heading: C.Heading, Prose: C.Prose, Callout: C.Callout, Stat: C.Stat, KeyValue: C.KeyValue, Quote: C.Quote,
  Image: C.Image, Gallery: C.Gallery, Video: C.Video, Audio: C.Audio,
  Table: C.Table, Timeline: C.Timeline, Steps: C.Steps,
  Citation: C.Citation, SourceCard: C.SourceCard,
  Button: C.Button, Select: C.Select, Form: C.Form,
  Input: C.Input, Slider: C.Slider, Toggle: C.Toggle,
  // components that take only `props`
  Chart: (p) => <Chart props={p.props} />,
  Mermaid: (p) => <Mermaid props={p.props} />,
  Model3D: (p) => <Model3D props={p.props} />,
  Graph: (p) => <Graph props={p.props} />,
  Sandbox: (p) => <Sandbox props={p.props} onAction={(v) => p.ctx.onAction?.((p.props as { actionId?: string }).actionId ?? "sandbox", v)} />,
  // full freeform page — sandboxed iframe + host-controlled islands
  Page: (p) => <CanvasFrame props={p.props} ctx={p.ctx} />,
};

export const CONTAINERS = new Set(["Section", "Columns", "Card"]);
