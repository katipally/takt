"use client";

// Dev-only harness: renders one surface exercising every catalog component so we
// can eyeball light/dark + responsive without the agent. Visit /ui-harness.

import type { UISurface } from "@takt/shared";
import { UIRenderer } from "@/components/ui-catalog/UIRenderer";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

const surface: UISurface = {
  id: "harness", root: "root",
  nodes: [
    { id: "root", type: "Section", props: { title: "Catalog harness" }, children: ["h", "p", "cols", "callout", "tabs", "acc", "table", "chart1", "chart2", "chartpie", "timeline", "steps", "kv", "quote", "img", "gallery", "mermaid", "sources", "form", "btns", "bad"] },
    { id: "h", type: "Heading", props: { text: "Setting wire feed speed", level: 1 } },
    { id: "p", type: "Prose", props: { markdown: "Start at **250 in/min** for 0.030\" wire [p.18](takt:cite:18). Adjust from there based on bead appearance.\n\n- Too cold: piles up\n- Too hot: burns through" } },
    { id: "cols", type: "Columns", props: { count: 3 }, children: ["s1", "s2", "s3"] },
    { id: "s1", type: "Stat", props: { value: "250", label: "in/min", hint: "starting feed" } },
    { id: "s2", type: "Stat", props: { value: "18–22", label: "volts" } },
    { id: "s3", type: "Stat", props: { value: "0.030\"", label: "wire gauge" } },
    { id: "callout", type: "Callout", props: { tone: "tip", title: "Tip", markdown: "Increase feed **10%** if the bead piles up." } },
    { id: "tabs", type: "Tabs", props: { items: [{ label: "Steel", content: "Use **75/25** shielding gas." }, { label: "Aluminum", content: "Switch to **100% argon** and a spool gun." }] } },
    { id: "acc", type: "Accordion", props: { items: [{ title: "Troubleshooting", content: "Check ground clamp and liner." }, { title: "Maintenance", content: "Replace the contact tip when worn." }] } },
    { id: "table", type: "Table", props: { columns: ["Wire", "Voltage", "Feed"], rows: [["0.023\"", "16–18", "200"], ["0.030\"", "18–22", "250"], ["0.035\"", "20–24", "300"]], caption: "Starting parameters" } },
    { id: "chart1", type: "Chart", props: { kind: "line", xKey: "v", series: [{ key: "feed", label: "Feed" }], data: [{ v: "16", feed: 180 }, { v: "18", feed: 230 }, { v: "20", feed: 270 }, { v: "22", feed: 300 }], caption: "Feed vs voltage" } },
    { id: "chart2", type: "Chart", props: { kind: "bar", xKey: "wire", series: [{ key: "min", label: "Min" }, { key: "max", label: "Max" }], data: [{ wire: "0.023", min: 16, max: 18 }, { wire: "0.030", min: 18, max: 22 }, { wire: "0.035", min: 20, max: 24 }] } },
    { id: "chartpie", type: "Chart", props: { kind: "pie", series: [{ key: "pct" }], data: [{ name: "Argon", pct: 75 }, { name: "CO₂", pct: 25 }] } },
    { id: "timeline", type: "Timeline", props: { events: [{ date: "Step 1", title: "Set gas", body: "75/25 at 20 CFH" }, { date: "Step 2", title: "Set voltage" }, { date: "Step 3", title: "Test bead" }] } },
    { id: "steps", type: "Steps", props: { steps: [{ title: "Clamp the ground", body: "Bare metal, close to the weld." }, { title: "Set voltage & feed" }, { title: "Run a test bead" }] } },
    { id: "kv", type: "KeyValue", props: { rows: [{ key: "Input", value: "240V" }, { key: "Duty cycle", value: "60% @ 200A" }, { key: "Weight", value: "38 lb" }] } },
    { id: "quote", type: "Quote", props: { text: "Let the wire do the work — don't push the gun.", cite: "Owner's manual, p.12" } },
    { id: "img", type: "Image", props: { src: "https://placehold.co/800x400/eee/999?text=manual+p.18", alt: "dial", caption: "Feed-speed dial [p.18]" } },
    { id: "gallery", type: "Gallery", props: { images: [{ src: "https://placehold.co/400/eee/999?text=1", caption: "Front" }, { src: "https://placehold.co/400/eee/999?text=2", caption: "Side" }, { src: "https://placehold.co/400/eee/999?text=3", caption: "Dial" }] } },
    { id: "mermaid", type: "Mermaid", props: { code: "flowchart LR\n  A[Clamp ground] --> B[Set voltage]\n  B --> C[Set feed]\n  C --> D{Good bead?}\n  D -- No --> B\n  D -- Yes --> E[Weld]", caption: "Setup flow" } },
    { id: "sources", type: "Columns", props: { count: 2 }, children: ["src1", "src2"] },
    { id: "src1", type: "SourceCard", props: { title: "Owner's manual", page: 18, caption: "Feed-speed settings" } },
    { id: "src2", type: "SourceCard", props: { title: "Quick start", page: 4, caption: "First weld" } },
    { id: "form", type: "Form", props: { actionId: "config", submitLabel: "Recommend settings", fields: [{ name: "wire", label: "Wire gauge", type: "select", options: ["0.023\"", "0.030\"", "0.035\""], required: true }, { name: "material", label: "Material", type: "text", placeholder: "e.g. mild steel" }, { name: "thin", label: "Thin stock?", type: "checkbox" }] } },
    { id: "btns", type: "Columns", props: { count: 2 }, children: ["b1", "b2"] },
    { id: "b1", type: "Button", props: { label: "Steel", actionId: "mat", value: "steel", variant: "primary" } },
    { id: "b2", type: "Button", props: { label: "Aluminum", actionId: "mat", value: "aluminum", variant: "secondary" } },
    { id: "bad", type: "NotAThing", props: {} },
  ],
};

export default function Harness() {
  return (
    <div className="min-h-dvh bg-background p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-[13px] text-muted-foreground">/ui-harness</h1>
          <ThemeToggle />
        </div>
        <div className="space-y-4">
          <UIRenderer surface={surface} ctx={{ onCitation: (p) => alert(`cite p.${p}`), onAction: (a, v) => console.log("action", a, v) }} />
        </div>
      </div>
    </div>
  );
}
