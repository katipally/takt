# Video walkthrough guide

A script for recording the demo. Aim for 4 to 6 minutes. The goal is to show every
capability the brief tests (accuracy, the multimodal *show*, the generative *draw*,
clarifying *ask*, and tone) using the exact prompts that trigger each one.

## Before you record

- Use Chrome or Edge. Voice and clipboard behave best there.
- Have your Anthropic key already pasted in Settings, Providers, so you don't film
  yourself typing it. Locally it's read from `.env`.
- Record on the live Space (https://yash3471-prox.hf.space) or local `pnpm dev`.
  Live is the better story since nothing is installed, but warm it up first because
  a cold Space takes 30 to 60 seconds on the first hit.
- Pick light or dark theme and stick with it. Artifacts inherit it.
- Use 1080p or higher, hide bookmarks and notifications, and zoom to about 110% so
  text stays legible.
- Do a dry run of every prompt once before recording. You want to know which page
  each one opens and which artifact it draws so your narration lands.

A clean flow is: intro (15s), one prompt per capability, then a 20s wrap. Each
prompt below names what it should trigger so you can narrate it as it happens.

## Segment 1: Open and frame it (0:00 to 0:30)

- Show the landing page and the product picker. One line: *"Prox is a product
  specialist for the Vulcan OmniPro 220, a welder whose manual runs 48 dense pages.
  Everything it tells you is grounded in that manual and cited to the page."*
- Pick the Vulcan OmniPro 220.

## Segment 2: Ground and Show, the duty-cycle question (0:30 to 1:30)

Prompt:
> What's the duty cycle for MIG welding at 200A on 240V?

Point out as it streams:
- The tool activity line: it runs `search_manual`, then `get_page_image`.
- The answer has an inline citation like `[p.NN]`. Click it, and the exact manual
  page opens in the Canvas. *"It's not paraphrasing from memory. Here's the table it
  read."*
- The duty-cycle table page is shown in the Canvas on its own.

## Segment 3: Draw, a live interactive tool (1:30 to 2:45)

Prompt:
> Build me a duty-cycle calculator I can use at the machine.

Show:
- The agent writes a React component and it renders live in the Artifacts panel,
  with inputs and real numbers from the manual.
- Change an input and the output updates. *"This is generated on the fly, sandboxed,
  not a hardcoded widget."*

Follow-up, to show versioning:
> Add a 240V vs 120V toggle to that.

- The same artifact updates to a new version. Show the version flipper.

Optional second draw, the settings configurator (a strong visual):
> *"I'm welding 1/8 inch mild steel with MIG. What settings should I use?"*
> Expect a configurator: process plus material plus thickness gives wire speed and
> voltage.

## Segment 4: Ask, clarifying an ambiguous request (2:45 to 3:30)

Prompt, deliberately underspecified:
> What settings should I use?

Show:
- Instead of guessing, the agent opens an `ask_user` panel with multiple-choice
  questions (process, material, thickness, voltage), some with inline diagrams.
  *"It asks before it guesses, because the answer changes completely with these."*
- Pick answers, and it returns a precise, cited recommendation, often with an
  artifact.

## Segment 5: Show and diagnose, visual-only content (3:30 to 4:30)

Prompt:
> What polarity setup do I need for TIG? Which socket does the ground clamp go in?

- It shows the polarity and socket page, or draws a socket diagram artifact.
- Narrate that this answer lives in a diagram, not in the text, exactly the kind of
  thing the manual hides in an image.

Then the troubleshooting prompt:
> I'm getting porosity in my flux-cored welds. What should I check?

- Expect a grounded checklist with citations, often a troubleshooting flowchart and
  the weld-defect page shown.

## Segment 6: The extras (4:30 to 5:15)

Pick one or two, quickly:
- Voice: click the mic, ask *"Walk me through the front control panel,"* and let it
  read the answer back.
- Image input: drag in a photo of the panel or a weld and ask about it.
- Gallery: open the per-product gallery to show every artifact was saved.
- Multi-product: mention that `pnpm ingest` adds any product with no code change.

## Segment 7: Architecture wrap (5:15 to 6:00)

Spend 30 to 45 seconds over the README architecture diagram. Cover the Claude Agent
SDK loop in a Node service, the five tools (search, show, draw, ask, list), and the
SQLite plus sqlite-vec plus local embeddings stack that lets one API key run the
whole thing. Note that artifacts render in a sandboxed iframe, which is the
reverse-engineered Claude Artifacts runtime. Close on the pre-seeded clone-and-run
and the free hosting.

## Prompt cheat-sheet

| Capability | Prompt | Triggers |
|---|---|---|
| Ground and cite | *What's the duty cycle for MIG at 200A on 240V?* | `search_manual` plus `[p.NN]` |
| Show a page | *Show me the front control panel layout.* | `get_page_image`, Canvas |
| Draw a calculator | *Build me a duty-cycle calculator.* | `emit_artifact` (react) |
| Revise an artifact | *Add a 120V/240V toggle to that.* | new artifact version |
| Configurator | *Settings for 1/8" mild steel MIG?* | `emit_artifact` configurator |
| Ask and clarify | *What settings should I use?* | `ask_user` panel |
| Visual diagnosis | *TIG polarity, which socket for ground?* | page plus socket diagram |
| Troubleshoot | *Porosity in flux-cored welds, what to check?* | flowchart plus citations |
| Voice | (mic) *Walk me through setup out of the box.* | speech in and out |
| Image input | (drag photo) *What's wrong with this weld?* | multimodal input |

If a prompt doesn't draw an artifact when you wanted one, add *"and build me an
interactive tool for it."* The agent draws on its own, but that nudge guarantees it
on camera.
