# Artifact tool — raw definition (extracted from claude-code binary)

## Internal registration metadata

```
name:                             "Artifact"        // NR constant
userFacingName:                   "Artifact"
searchHint:                       "render an HTML or Markdown file to a claude.ai web page"
briefStandalone:                  true
shouldDefer:                      false
maxResultSizeChars:               1000
preserveToolUseResultInSubagents: true
isEnabled:                        poe()             // gated on artifact feature flag
isConcurrencySafe:                false
isReadOnly:                       false
ruleContentField:                 "file_path"
linked skill (Vde constant):      "artifact-design"
```

Short description (used on some surfaces):
> Render an HTML or Markdown file to an Artifact — a default-private claude.ai web page the user can share with teammates.

## Base tool prompt (`vLl`) — raw template string

`${Vde}` interpolates to `artifact-design`.

Render an HTML or Markdown file to an Artifact — a default-private web page hosted on claude.ai that the user can later choose to share with their teammates. Use this when communicating visually would be clearer than terminal text.

**Before writing the page, you MUST load the `${Vde}` skill** to calibrate how much design investment this particular request warrants. Then write the content to a file (via Write/Edit) and call Artifact with its path. The file is wrapped in a `<!doctype html>…<head>…</head><body>` skeleton at publish time, so write the page content directly — no `<!DOCTYPE>`, `<html>`, `<head>`, or `<body>` tags of your own. The file includes a minimal CSS reset. Unless the user names a location, put the file in your scratchpad directory if one is listed in your system prompt.

**Title**: Set a concise `<title>` in the HTML — it names the artifact in the browser tab and gallery. Keep it stable across redeploys. Pass a one-sentence `description` parameter — it becomes the gallery card's subtitle.

**To update**: Edit the file, then call Artifact again with the same file path — it redeploys to the same URL. A different file path claims a new URL so only use a different path if you intend to create a separate new Artifact.

**To update an artifact the user gives you a URL for** (an artifact link not published in this session): pass the URL as `url`. Without it, a fresh session always mints a new URL — there is no other way to target an existing one.

**To read an existing artifact's content**: call WebFetch with its URL.

**Self-contained only**: A strict CSP blocks requests to any external host — CDN scripts, external stylesheets, fonts, remote images, fetch/XHR/WebSockets. Inline all CSS/JS and embed assets as data: URIs.

**Responsive**: Use relative units, flexbox/grid, `max-width:100%` on images. Wide content (tables, diagrams, code blocks) must scroll inside its own `overflow-x: auto` container — the page body must never scroll horizontally.

**Favicon** (required): Pass one or two emoji as `favicon` (e.g. `"📊"`, `"🐛"`, `"⚡🔥"`). It becomes the browser-tab icon. Emoji only — no SVG, no markup. Keep it the **same** across redeploys of an artifact — users find their tab by its icon, and a changed favicon reads as a different page. Only pick a new emoji on a hard pivot in what the artifact is about (new investigation, new deliverable), not for incremental updates.

> When Frame MCP is enabled the prompt becomes `` `${vLl}\n${pfe.buildFrameMcpPrompt(e)}` `` — gated OFF in normal sessions (pfe is null), so no connector text appends.

## Input schema (`nUo`) — raw Zod

```js
A.strictObject({
  file_path:   A.string()
    .describe("Path to an .html or .md file to render. Use a short, distinctive basename — it is the fallback title if the HTML has no <title>."),
  favicon:     A.string().min(1).max(32)
    .describe('Browser-tab icon: one or two emoji (e.g. "📊"). No markup. Keep stable across redeploys; change only on a hard topic pivot.'),
  description: A.string().max(1000).optional()
    .describe("One-sentence subtitle shown on the gallery card. Say what the page is or does."),
  label:       A.string().max(60).optional()
    .describe('Short human-readable name for this version, max 60 chars (e.g. "fixed-background"). Shown in the version picker. Not a description — keep it to a few words.'),
  url:         A.string().optional()
    .describe("Existing artifact URL to redeploy to. Pass when the user gives you a URL for an artifact not published in this session; omit for new artifacts or same-session redeploys. Must be an artifact the user owns."),
  force:       A.boolean().optional()
    .describe("Overwrite without a conflict check. Use only after a 409 when you have reconciled with the other session's version and intend to replace it. Omit (or false) to send baseVersion so a concurrent write 409s instead of being silently clobbered."),
  // gated, INACTIVE in normal sessions:
  ...(pfe && pfe.isFrameMcpEnabled() && { capabilities: pfe.frameCapabilitiesInputSchema() })
})
```

## Output schema (`vLm`) — raw Zod

```js
A.object({
  url:          A.string(),
  path:         A.string(),
  title:        A.string().optional(),
  version:      A.string().optional(),
  capabilities: A.unknown().optional(),
  stored:       A.object({
    contract:     A.string(),
    capabilities: A.record(A.string(), A.unknown()).optional()
  }).optional()
})
```

## Validation rules & error codes (`validateInput`)

```
errorCode 1  unsupported file type: {ext} — use .html or .md
errorCode 2  File not found: {path}. Create the file first (Write tool, or via shell if Write
             is unavailable), then retry with the same path.   // + "Did you mean {x}?" variants
errorCode 3  too large: {n}MB (max {bZ}MB)
errorCode 4  not an artifact URL: {url}
errorCode 5  that artifact URL is for {env}, but this session targets {env} claude.ai —
             republish it here to mint a {env} URL, or switch environments
errorCode 6  favicon must be one or two emoji — no markup   // triggered if favicon contains "<"
```

## Steering messages (`validationErrorSteer`)

> The Artifact tool reads from a file on disk — it does not take inline `content` or `title`. Write the page to an .html or .md file first (Write/Edit), then call Artifact with `file_path` pointing at it. Set the title via an HTML `<title>` tag in the file.

> `label` is a short version name (max 60 chars). Move longer text into the page content.

Runtime `call()` stale-version guard:
> This session hasn't viewed the latest version of the artifact. WebFetch the URL first, or pass force:true to overwrite.

## Permission-prompt messages (`checkPermissions`)

Template: `Claude wants to publish "{title}" ({file_path}) to {target}{connectorClause}`

**{target}**:
- `a private page on claude.ai`
- `a page shared with {your organization | specific users | others…} on claude.ai (viewers see updates immediately)`
- `a page on claude.ai (viewers see a pinned earlier version)`
- `a page on claude.ai (share status could not be confirmed)`

**{connectorClause}** (Frame MCP only; inactive normally):
- `, granting the page access to your connectors{summary}`
- `, which carries forward a stored connector grant`
- `, which may carry forward a stored connector grant (could not be read — approve only if that is intended)`
- `, clearing any stored connector grant for this page`

Auto-allow (no prompt) reason: `Redeploy of an artifact already published this session`.

## Result message (`mapToolResultToToolResultBlockParam`)

```
Published {path} at {url}
```
(+ if a stored capability declaration carried forward: `This artifact has a stored capability declaration that was carried forward: {…}.`)
