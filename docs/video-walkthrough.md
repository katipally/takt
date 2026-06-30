# Video walkthrough guide

A script for recording the demo. Target length **4–6 minutes**. The goal is to
show every capability the brief tests — accuracy, multimodal *show*, generative
*draw*, clarifying *ask*, tone — with the exact prompts that trigger each one.

## Before you record

- **Browser:** use **Chrome or Edge** (voice and clipboard work best there).
- **Key:** have your Anthropic key pasted in **Settings → Providers** already, so
  you don't film yourself typing it. On local, it's read from `.env`.
- **Where:** the live Space (https://yash3471-prox.hf.space) or local `pnpm dev`.
  Live is the better story ("nothing installed"), but warm it up first — a cold
  Space takes 30–60s on the first hit.
- **Theme:** pick light or dark and stick with it; artifacts inherit it.
- **Screen:** 1080p+, hide bookmarks/notifications, zoom the browser to ~110% so
  text is legible in the recording.
- **Do a dry run** of every prompt once before recording — you want to know which
  page each one opens and which artifact it draws, so your narration lands.

A clean recording flow: **intro (15s) → one prompt per capability → 20s wrap.**
Each prompt below names what it should trigger so you can narrate it as it happens.

---

## Segment 1 — Open & frame it (0:00–0:30)

- Show the landing page and the product picker. One line: *"Prox is a product
  specialist for the Vulcan OmniPro 220 — a welder whose manual is 48 dense pages.
  Everything it tells you is grounded in that manual and cited to the page."*
- Pick the **Vulcan OmniPro 220**.

## Segment 2 — Ground + Show: the duty-cycle question (0:30–1:30)

**Prompt:**
> What's the duty cycle for MIG welding at 200A on 240V?

What to point out as it streams:
- The **tool activity** line: it runs `search_manual`, then `get_page_image`.
- The answer has an inline citation like `[p.NN]`. **Click it** — the exact manual
  page opens in the Canvas. *"It's not paraphrasing from memory; here's the table
  it read."*
- The duty-cycle table page is shown in the Canvas on its own.

## Segment 3 — Draw: a live interactive tool (1:30–2:45)

**Prompt:**
> Build me a duty-cycle calculator I can use at the machine.

What to show:
- The agent writes a React component and it **renders live** in the Artifacts
  panel — sliders/inputs, real numbers from the manual.
- Change an input; the output updates. *"This is generated on the fly, sandboxed,
  not a hardcoded widget."*

**Follow-up (shows versioning):**
> Add a 240V vs 120V toggle to that.

- Same artifact updates to a **new version**; show the version flipper.

> Optional second draw — the settings configurator (great visual):
> *"I'm welding 1/8 inch mild steel with MIG. What settings should I use?"*
> → expect a configurator (process + material + thickness → wire speed + voltage).

## Segment 4 — Ask: clarifying an ambiguous request (2:45–3:30)

**Prompt (deliberately underspecified):**
> What settings should I use?

What to show:
- Instead of guessing, the agent opens an **`ask_user` panel** — multiple-choice
  questions (process? material? thickness? voltage?), some with little inline
  diagrams. *"It asks before it guesses — because the answer changes completely
  depending on these."*
- Pick answers → it returns a precise, cited recommendation (often with an artifact).

## Segment 5 — Show + diagnose: visual-only content (3:30–4:30)

**Prompt:**
> What polarity setup do I need for TIG? Which socket does the ground clamp go in?

- It shows the **polarity/socket page** and/or draws a **socket diagram** artifact.
- Narrate that this answer lives in a diagram, not text — exactly the kind of thing
  the manual hides in an image.

**Then the troubleshooting prompt:**
> I'm getting porosity in my flux-cored welds. What should I check?

- Expect a grounded checklist with citations, often a **troubleshooting flowchart**
  artifact and/or the weld-defect page shown.

## Segment 6 — The extras (4:30–5:15)

Pick one or two, quickly:
- **Voice:** click the mic, ask *"Walk me through the front control panel,"* let it
  read the answer back.
- **Image input:** drag in a photo (of the panel or a weld) and ask about it.
- **Gallery:** open the per-product gallery to show every artifact was saved.
- **Multi-product / product-agnostic:** mention `pnpm ingest` adds any product with
  no code change (show the picker, or the README snippet).

## Segment 7 — Architecture wrap (5:15–6:00)

30–45 seconds over the README architecture diagram:
- Claude Agent SDK loop in a Node service; five tools (search / show / draw / ask /
  list); SQLite + sqlite-vec + local embeddings, so one API key runs the whole
  thing; artifacts rendered in a sandboxed iframe (the reverse-engineered Claude
  Artifacts runtime). One line on the pre-seeded clone-and-run and the free hosting.

---

## Prompt cheat-sheet (capability → prompt)

| Capability | Prompt | Triggers |
|---|---|---|
| Ground + cite | *What's the duty cycle for MIG at 200A on 240V?* | `search_manual` + `[p.NN]` |
| Show a page | *Show me the front control panel layout.* | `get_page_image` → Canvas |
| Draw a calculator | *Build me a duty-cycle calculator.* | `emit_artifact` (react) |
| Revise an artifact | *Add a 120V/240V toggle to that.* | new artifact **version** |
| Configurator | *Settings for 1/8" mild steel MIG?* | `emit_artifact` configurator |
| Ask / clarify | *What settings should I use?* | `ask_user` panel |
| Visual diagnosis | *TIG polarity — which socket for ground?* | page + socket diagram |
| Troubleshoot | *Porosity in flux-cored welds — what to check?* | flowchart + citations |
| Voice | (mic) *Walk me through setup out of the box.* | speech in/out |
| Image input | (drag photo) *What's wrong with this weld?* | multimodal input |

> Tip: if a prompt doesn't draw an artifact when you wanted one, add
> *"…and build me an interactive tool for it."* The agent draws proactively, but
> that nudge guarantees it on camera.
