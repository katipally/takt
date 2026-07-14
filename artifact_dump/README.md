# artifact_dump — raw Claude Code artifact/gen-UI internals

Everything artifact- and generative-UI-related extracted from the installed
Claude Code binary (`@anthropic-ai/claude-code-darwin-arm64`, v2.1.198) and its
bundled skills. Raw, verbatim.

## Files

| File | What it is | Source |
|---|---|---|
| `artifact-tool.md` | The `Artifact` tool: prompt, input/output schema, error codes, permission-prompt + result messages | binary |
| `artifact-design.SKILL.md` | The design skill the Artifact tool forces you to load first | binary |
| `dataviz-callout.md` | Text injected into artifact-design when the dataviz flag is on | binary |
| `dataviz.SKILL.md` | The data-visualization skill body | binary |
| `dataviz/references/*.md` | 7 reference docs the dataviz skill points to | disk (unpacked on skill load) |
| `dataviz/scripts/validate_palette.{js,py}` | The runnable six-checks palette validator | disk (unpacked on skill load) |
| `plan-artifact.SKILL.md` | Skill for publishing a plan as a shareable Artifact | binary |
| `plan-artifact-template.html` | The blessed plan-artifact HTML template (both light+dark tokens) | binary |
| `md-artifact-wrapper.html` | The CSS reset/skeleton wrapping MARKDOWN artifacts (`Zxm` const) | binary |
| `published-wrapper-REAL.html` | GROUND TRUTH: what claude.ai actually wraps an `.html` artifact in — captured by publishing a probe + WebFetch | live (empirical) |
| `frame-runtime.js` | The ~7KB sandbox runtime claude.ai injects into every published artifact's `<head>` (verbatim) | live (empirical) |

## What you actually get when creating an artifact (verified end-to-end)

1. **`Artifact` tool** — prompt + schema (`artifact-tool.md`).
2. **`artifact-design` skill** — forced load before writing (`artifact-design.SKILL.md`),
   with the optional dataviz callout (`dataviz-callout.md`).
3. **`dataviz` skill** if charts are involved — body + 7 refs + 2 validators (`dataviz/`).
4. **`plan-artifact` skill** for plans — skill + blessed template.
5. **The published page** runs inside a **sandboxed iframe** on claude.ai. The server
   injects `frame-runtime.js` + `__FRAME_PREAMBLE` ahead of your bytes. That runtime:
   RTC-locks the frame, bridges `postMessage` to the parent (`claude.ai` /
   `preview.claude.ai` only), intercepts external links, auto-heights the iframe,
   syncs theme, and exposes a **`window.claude`** capability proxy (caps: `mcp`,
   `permissions`, `downloads`, `self`) — the substrate for the gated connectors feature.
   Your file's bytes are placed **verbatim** after `<body>`; the `<head>` reset is `fkm`.

## Notes / remaining gaps

- **Frame MCP connector PROMPT** (`buildFrameMcpPrompt`): the model-facing instructions
  for declaring `capabilities` are gated off in normal sessions → build no text. (The
  runtime that *serves* those caps, `window.claude`, is always injected — see above.)
- **The artifact CSP** is an HTTP *response header*, not a `<meta>`, so WebFetch (which
  drops headers) can't show it. The tool prompt states the effective policy: blocks all
  external hosts (CDN/font/img/fetch/XHR/WebSocket). No `<base href>`/`data-frame-runtime`
  appeared on this single-file probe; the binary's read-back strips them, so they show
  on some (likely multi-file) frames.
- Skill `SKILL.md` bodies live inside the binary; only their `references/`/`scripts/`
  support files unpack to disk (session temp dir) when the skill is invoked.

## Adjacent gen-UI: Claude Design (claude.ai/design) — the `design-sync/` folder

A separate product from Artifacts: push a real React design system to claude.ai/design
so Claude's *design agent* renders live UI from the real compiled components. Extracted
statically from the binary (the skill is `disable-model-invocation` — user-only via
`/design-sync` — and the `DesignSync` tool drives real cloud writes, so NEITHER was run):

| File | What it is | chars |
|---|---|---|
| `design-sync/SKILL.md` | main design-sync skill (target project, plan, incremental upload) | 28 K |
| `design-sync/storybook.SKILL.md` | sub-skill: Storybook source shape (compare-harness verification) | 69 K |
| `design-sync/non-storybook.SKILL.md` | sub-skill: bare-package source shape | 59 K |
| `design-sync/DesignSync-tool.md` | the `DesignSync` tool schema (11 methods) | — |
| `dataviz-ALT-frontmatter.SKILL.md` | the dataviz skill WITH its YAML frontmatter (the invoked/on-disk copy strips it) | 8 K |

Not dumped: the design-sync converter `.mjs` scripts (`lib/story-imports.mjs`,
`sync-hashes.mjs`, `package-validate.mjs`) — build tooling that unpacks only when the
skill runs, which requires user invocation. Say the word and I'll extract whatever of
them exist as strings in the binary.

## The CSP — what I could and couldn't get

- The real artifact CSP is an HTTP response header served only to an authenticated
  browser session. WebFetch (login-backed) drops headers; `curl` (no login) gets a
  **Cloudflare challenge 403**, whose CSP (`…challenges.cloudflare.com…`) is the
  challenge page's, NOT the artifact's — do not mistake it for the frame policy.
- Effective policy per the Artifact tool prompt: blocks every external host (CDN, fonts,
  remote images, fetch/XHR/WebSocket); inline CSS/JS + data: URIs only. The injected
  frame-runtime additionally RTC-locks the frame and restricts postMessage to
  claude.ai / preview.claude.ai. That's the enforced surface, header text aside.

## The frame-mcp prompt — why there's nothing to dump

`buildFrameMcpPrompt(tools)` is generated at RUNTIME from your connected connectors —
it is NOT a stored string in the binary. Gated off + no connectors ⇒ it produces no
text. The runtime it drives (`window.claude`, caps mcp/permissions/downloads/self) is
in `frame-runtime.js`; the model-facing instructions simply don't exist statically.
