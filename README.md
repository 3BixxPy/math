# Math Curriculum

A private, self-built curriculum taking one learner from their current level to
Slovak/Czech *prvý ročník vysokoškolská matematika* (STEM track: Calc I & II,
Linear Algebra, intro discrete/logic), over roughly a year of daily ~30–90 min
sessions. Static site, no backend, works offline once loaded.

This file exists so a future session (human or AI) can pick this repo up cold
without re-deriving the architecture.

## For an AI session answering a question about this curriculum

**Don't read the whole repo.** Read `data/curriculum.json` first (small) to find
which chapter file covers a topic or day, and `data/concepts.json` to find which
chapter defines a given concept or where a concept is reused. Then read only the
one chapter file needed. Equation references use the format `M.C.N` (module,
chapter, equation) — e.g. "explain equation 0.13.2" means Module 0, Chapter 13
(`content/m00-foundations/ch13-quadratics.html`), the equation with
`id="eq-0-13-2"` in that file.

## Learner profile this was built for

Diagnosed via a placement quiz before any content was written (STEM track,
~1 year timeline, English content, strict daily streak). Summary: algebraic
*mechanics* were intact but rusty on arithmetic care, exponent laws, and
factoring; functions/graphs and trigonometry were near-zero; calculus was a
clean slate; strong transferable logic-gate/boolean background; real vector
intuition from 3D game-dev coding. Module 0's chapters were written to target
these exact gaps (each chapter's intro explains which diagnostic mistake it
fixes). If re-diagnosing or extending for a different learner, don't assume
this profile carries over.

## Architecture

```
/index.html          dashboard — today's task, streak, equation/concept search
/review.html          spaced-repetition queue (Leitner boxes)
/roadmap.html          full 17-module roadmap, authored + planned
/assets/
  styles.css           shared design system — see "Visual conventions" below
  app.js               localStorage engine: streak, progress, spaced repetition
  katex/                vendored KaTeX (offline math rendering, no CDN)
/data/
  curriculum.json      manifest: modules → day-entries → chapter files
  concepts.json         concept graph: id → name, definedIn, usedBy, prompt, hint
/content/
  m00-foundations/      one HTML file per chapter, ch01.. ch15..
  m01-functions/ ...     (planned modules — folders created when authored)
.github/workflows/pages.yml   deploys on push
```

Each chapter HTML file is the single source of truth (no separate Markdown
source, no build step) — self-contained, small (~150–400 lines), and written
against `assets/styles.css` + vendored KaTeX so it renders identically whether
opened via GitHub Pages or a local server.

**Why no build step:** this has to still work, untouched, a year from now,
opened on a phone. A build pipeline is one more thing to go stale. Trade-off:
some markup duplication between chapters (nav, footer, script tags) — accepted
deliberately.

## Visual conventions (`assets/styles.css`)

Fixed color-coding by block type, same meaning on every page:

| Block class | Color | Meaning |
|---|---|---|
| `.block.definition` | blue | a term or object being defined |
| `.block.theorem` | purple | a rule, formula, or proven fact |
| `.block.example` | green | worked example, steps behind `<details class="step">` |
| `.block.mistake` | amber/red | a common error — ideally tied to a real diagnosed mistake |
| `.block.intuition` | teal | "why this matters" framing, always right after the H1 |
| `.block.practice` | gray | (rarely used directly — practice sets use `ol.problems` instead) |

Practice problems use `<ol class="problems">`, each `<li>` ending with
`<details class="answer"><summary></summary><div class="ans-body">...</div></details>`
— CSS auto-labels it "Show answer ▸". Never put the answer inline; the reveal
is deliberate (retrieval practice / testing effect).

Numbered equations: `<div class="eqn"><div class="eq-body">\[ ... \]</div><div class="eq-num" id="eq-M-C-N">(M.C.N)</div></div>`.

## How to add a new chapter (or a whole new module)

1. Create `content/mXX-slug/chNN-slug.html`, copying the structure of an
   existing Module 0 chapter (header/nav, crumb, intuition block, theorem/definition
   blocks with numbered equations, 1–2 worked examples with step reveals, one
   mistake callout, a 10–12 item practice set with the last 4 tagged
   `class="tag"` as bonus and the final one as `challenge`).
2. Add the day entry to the right module in `data/curriculum.json` (flip
   `status` to `"authored"` once the whole module's chapters exist, and fill in
   the `days` array — the dashboard/roadmap logic depends on this, not on
   scanning the filesystem).
3. Add any new atomic concepts to `data/concepts.json` with a `prompt`/`hint`
   pair for the review page, and update `usedBy` on prerequisite concepts this
   chapter reuses.
4. Prefer reusing an existing concept (link back via prose + `usedBy`) over
   re-teaching it — the whole point of the concept graph is not repeating
   yourself across chapters.

Module 0 (`content/m00-foundations/`) is the reference implementation — when in
doubt, match its patterns rather than inventing new ones.

## The daily/streak/review engine (`assets/app.js`)

All state lives in `localStorage` under key `mathcurr_state_v1` — no backend,
nothing leaves the device except via manual export/import (buttons on the
dashboard; this is the phone↔PC sync mechanism). Day pointer is a flat
concatenation of every module's `days` array in module order, so appending new
modules to `curriculum.json` never disturbs existing progress. Streak counts
consecutive *calendar days* with at least one day marked done — pace within
that is entirely up to the learner (multiple days in one sitting is fine).
Spaced repetition is a simple Leitner box (intervals 1/1/3/7/16/35 days);
concepts get introduced into the box automatically when the day that defines
them is marked complete.

## Running locally / hosting

The pages `fetch()` `data/*.json` at runtime, which browsers block over a bare
`file://` URL (CORS). Either open via the GitHub Pages URL (this repo is
private; the Pages URL itself is unlisted but technically publicly reachable —
don't publicize it), or for local testing run a tiny static server from the
repo root, e.g. `python3 -m http.server 8000`, and open `localhost:8000`.

## Status

Module 0 (Foundations Bridge) is fully authored — 15 chapters. Modules 1–16
are scoped in `data/curriculum.json`/`roadmap.html` (titles, descriptions, day
counts) but not yet written; `roadmap.html` marks them "planned." Continue
authoring in the same style, module by module.
