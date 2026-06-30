import { createElement, memo, useMemo, useState, type HTMLAttributes, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";

// Referentially-stable markdown component map (ported from the reference design).
// A fresh arrow component per render is a new element *type*, which makes React
// remount the whole markdown DOM — visible as the transcript jumping while a
// stream re-renders. So the map is hoisted; only `a` (citation chips) is memoized.

export type RenderLink = (input: { href: string; children: ReactNode }) => ReactNode | null | undefined;

type MdProps = HTMLAttributes<HTMLElement> & { node?: unknown };
type MdTag = "blockquote" | "h1" | "h2" | "h3" | "h4" | "li" | "ol" | "p" | "table" | "td" | "th" | "ul";

function el(tag: MdTag, base: string, props: MdProps) {
  const { children, className, node: _n, ...rest } = props;
  return createElement(tag, { ...rest, className: [base, className].filter(Boolean).join(" ") }, children);
}

const STATIC = {
  h1: (p: MdProps) => el("h1", "mb-2.5 mt-5 text-[22px] font-semibold leading-[1.25]", p),
  h2: (p: MdProps) => el("h2", "mb-2.5 mt-5 text-[19px] font-semibold leading-[1.25]", p),
  h3: (p: MdProps) => el("h3", "mb-2 mt-4 text-[16px] font-semibold leading-[22px]", p),
  h4: (p: MdProps) => el("h4", "mb-1.5 mt-4 text-[14px] font-semibold", p),
  p: (p: MdProps) => el("p", "mb-[0.6875rem] mt-0 text-chat", p),
  ul: (p: MdProps) => el("ul", "my-0 list-disc pl-[1.3125rem] text-chat [&>li+li]:mt-1.5", p),
  ol: (p: MdProps) => el("ol", "my-0 list-decimal pl-[1.3125rem] text-chat [&>li+li]:mt-1.5", p),
  li: (p: MdProps) => el("li", "pl-0.5 text-chat", p),
  blockquote: (p: MdProps) => el("blockquote", "my-3 border-l-2 border-border pl-4 text-chat italic text-muted-foreground", p),
  hr: () => <hr className="my-4 border-border" />,
  table: (p: MdProps) => (
    <div className="my-4 overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto prox-scroll">
        {el("table", "w-max min-w-full border-collapse text-chat [&_tbody_tr:nth-child(2n)]:bg-foreground/[0.02]", p)}
      </div>
    </div>
  ),
  th: (p: MdProps) => el("th", "border-b border-border bg-foreground/5 px-2.5 py-1.5 text-left text-chat font-semibold", p),
  td: (p: MdProps) => el("td", "border-b border-border px-2.5 py-1.5 align-top text-chat", p),
} as const;
// strong/em/a default-render inline unless overridden (a is set per-render below).

function anchorFactory(renderLink?: RenderLink) {
  return function Anchor(props: MdProps & { href?: string; children?: ReactNode }) {
    const { href, children, node: _n, ...rest } = props;
    if (href) {
      const custom = renderLink?.({ href, children });
      if (custom !== null && custom !== undefined) return <>{custom}</>;
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer"
        className="text-link-foreground underline decoration-[0.5px] decoration-foreground/40 transition hover:decoration-foreground" {...rest}>
        {children}
      </a>
    );
  };
}

function CodeBlock({ code, label }: { code: string; label?: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative my-3.5 overflow-clip rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between gap-2 py-1 pl-2.5 pr-1.5 text-[11px] text-muted-foreground">
        <span className="truncate">{label ?? "code"}</span>
        <button onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="grid size-6 place-items-center rounded-md text-muted-foreground transition hover:bg-foreground/10 hover:text-foreground" aria-label="Copy code">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <div className="overflow-x-auto p-2.5 prox-scroll">
        <pre className="m-0"><code className="whitespace-pre font-mono text-[12px] leading-[1.5]">{code}</code></pre>
      </div>
    </div>
  );
}

function code(props: MdProps & { className?: string; children?: ReactNode }) {
  const { className, children, node: _n } = props;
  const match = /language-(\w+)/.exec(className || "");
  const str = String(children).replace(/\n$/, "");
  if (match || str.includes("\n")) return <CodeBlock code={str} label={match?.[1] ?? null} />;
  return <code className="rounded-sm bg-foreground/10 px-1.5 py-0.5 font-mono text-[12px]">{children}</code>;
}

export const MarkdownBody = memo(function MarkdownBody({
  content, className = "", renderLink,
}: { content: string; className?: string; renderLink?: RenderLink }) {
  const components = useMemo(() => ({ ...STATIC, a: anchorFactory(renderLink), code }), [renderLink]);
  return (
    <div className={`text-chat text-foreground break-words [&_li>p]:my-0 ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform} components={components as never}>
        {content}
      </ReactMarkdown>
    </div>
  );
});

// Preserve our `prox:cite:` scheme (used for citation chips); block dangerous ones.
function urlTransform(url: string): string {
  if (url.startsWith("prox:")) return url;
  if (/^(javascript|data|vbscript):/i.test(url.trim())) return "";
  return url;
}
