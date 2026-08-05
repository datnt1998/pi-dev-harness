# Design Taste — the reasoning protocol applied to UI/UX and frontend work

The protocol's moves, applied to the one domain where reasoning is most confidently wrong
about its own output: visual design. Code either passes tests or fails them; design
"looks fine" to whatever produced it, always, because it never actually sees the render.
This reference teaches how to think, decide, and verify design work so the result is
designed rather than defaulted.

## Boundary with make-interfaces-feel-better

`/skill:make-interfaces-feel-better` owns the concrete craft rulebook — border radius,
shadows, animation timing, typography, hit areas, and the rest of its numbered
principles. Load it for the implementation rules. This reference owns the judgment and
verification layer around design work — how to decide what the design should do and how
to prove the result actually does it — and never restates a craft rule that skill already
states; it cross-links instead.

## When to load this reference

Load before writing the first line of markup, styles, or component code — not after —
whenever the deliverable is a user-facing surface:

- building or restyling pages, components, dashboards, landing pages, emails, slides,
  HTML artifacts, TUIs, charts;
- reviewing or critiquing UI code, screenshots, or live pages;
- choosing colors, typography, spacing, layout, or a design system;
- any task whose output a human will look at and judge, not just execute.

The trigger is the deliverable type, not the words in the prompt. "Make a quick page for
X" is a design task; the word "design" need not appear.

## Known Failure Modes (design-domain instances)

These are the design-domain form of the failure modes in `SKILL.md`:

- **Mode collapse / template gravity** — with no strong brief, output converges to the
  statistical mean: one favorite palette, one favorite font, one favorite hero layout,
  identical card grids. The output is not wrong; it is the average, and average reads as
  machine-made. Distinctive requires a deliberate choice made early.
- **Decoration ≠ design** — when unsure, decoration gets added (gradients, glows,
  badges, ornaments) instead of removed. Good design is mostly subtraction: fewer colors,
  fewer weights, fewer boxes, more space. An element that encodes no information is
  noise.
- **Render blindness** — the design-domain form of surface blindness. Code gets emitted
  and the result gets imagined; the imagined render is always flattering. Overflow,
  wrapping, contrast failures, misalignment, and collision are invisible in source form.
  A claim that a layout "works" is ASSUMED until the artifact is rendered and inspected,
  or the specific property is computed.
- **Uniform emphasis** — everything bold, everything colored, every section decorated.
  Hierarchy means choosing what loses. If every element shouts, the design says nothing.
- **Happy-path bias** — designing one state: medium-length content, loaded data, desktop
  width, light mode, mouse input. Real interfaces spend most of their life in the other
  states.
- **Completion pressure** — shipping the first composition that renders without errors.
  Rendering without errors is the floor of correctness, not evidence of quality.

## How to Think (the moves, in design order)

1. **FRAME the screen's job.** One sentence: who is looking at this, and what is the ONE
   thing they must see or do first? Name the emotional register the content deserves —
   calm utility, dense data, bold marketing, editorial warmth — and let it be a decision,
   not a leftover. A dashboard and a landing page with the same styling means no decision
   was made.
2. **Rank before drawing.** List every element the surface must carry, ordered by
   importance to the user's job. The finished design's visual weight (size, contrast,
   position, whitespace) must reproduce that ranking. This list is the load-bearing fact
   of the whole task; most bad layouts are correct styling applied to an unranked list.
3. **Choose the system before the parts.** Fix the design tokens first — accent color,
   neutral ramp, type families, spacing scale, radius and shadow scale — then every value
   in the output comes from the scale. Ad-hoc values are how consistency dies one line at
   a time.
4. **Design with real content.** Use realistic longest-case and shortest-case content
   from the start — real names, real numbers, empty lists, missing images. Content is a
   constraint, not a filler; placeholder text defers every hard decision to the moment it
   can no longer be made.
5. **Subtract before delivering.** One deliberate pass: remove every element, color,
   border, shadow, and animation whose absence loses no information. What survives is the
   design.

## What Good Design Is (evaluable, not vibes)

A surface is well designed when each of these holds and can be shown to hold:

- **Legible hierarchy** — a viewer squinting at it, or seeing it for three seconds, can
  point at the most important element, and it is the intended one.
- **One voice of emphasis** — a single accent does all the "look here" work; neutrals do
  everything else. Emphasis spent everywhere is emphasis spent nowhere.
- **Rhythm** — spacing values come from one scale; edges align to a grid; equal-status
  elements are visually equal. The eye notices misalignment before the mind does.
- **Readable text** — body contrast meets WCAG AA (4.5:1; 3:1 for large text), line
  length stays in the 45–75 character range, line height gives dense scripts and
  diacritics room. These are computable properties, not opinions.
- **Designed states** — hover, focus, active, disabled, empty, loading, error, and
  overflowing content all have an intended appearance, chosen rather than inherited.
- **Fit** — the styling belongs to THIS content, audience, and brand. The test: swap in a
  different product's copy; if the design fits it just as well, the design fit nothing.

## Slop Catalog (matches are failed gates, not style choices)

- The default-everything stack: an overused font on a neutral panel behind a
  violet-to-blue gradient hero with three equal feature cards.
- Glassmorphism, neon glows, and gradient text substituting for a composition.
- Emoji as icons or bullets in professional surfaces.
- Decoration stacking: shadow + border + gradient + rounded + glow on one element.
- Center-aligned paragraphs; full-viewport-width text lines.
- Gray-on-gray body text that fails a contrast computation.
- Five font sizes where three steps would do; arbitrary values off the spacing scale.
- Animating everything; motion that communicates nothing; parallax by default.
- Placeholder tells: lorem ipsum, "John Doe", obvious stock imagery, fake logos.
- Uniform card grids regardless of whether the content is uniform.

## Details Habitually Missed

Enumerate these deliberately — negative-space scanning, because absence is invisible:

- Focus visibility and tab order; hover-only affordances that break on touch; touch
  targets below the target size (see `make-interfaces-feel-better` for the specific hit
  area numbers).
- The longest realistic string: an unbroken URL, a long compound word, a 40-character
  name — where does it wrap, clip, or push the layout?
- Non-Latin and diacritic-heavy text (stacked diacritics, CJK) clipped by tight line
  heights or wrong font fallbacks.
- Dark mode as a re-decision, not an inversion: shadows stop working, borders must take
  over, saturated accents need re-tuning.
- Empty, loading, and error states — the states users actually meet first.
- Tables: numeric columns right-aligned with tabular figures; header alignment matching
  the data; horizontal overflow contained in its own scroll region.
- Optical versus box alignment: icons beside text, play buttons in circles — centered
  boxes that look off-center (see `make-interfaces-feel-better` for the concentric-radius
  and optical-alignment rules).
- Layout shift while fonts and images load; sticky elements covering content; z-index
  collisions; mobile safe-area insets.
- Print/export appearance when the artifact is a document or slide.

## Verify (render blindness makes this mandatory, not optional)

Apply Harness Leverage from `SKILL.md`: anything a granted capability can check must be
checked with it, as a loop, until a full pass over the final artifact is clean.

1. **Render it.** If the environment grants a browser, screenshot, or preview capability,
   render the artifact and look at it — at a phone width, a tablet width, and a desktop
   width. Judging design from source code is reasoning about a render never seen: ASSUMED
   wearing OBSERVED grammar.
2. **Squint test on the render.** Blur or shrink it: does the intended #1 element win?
   Does the reading order match the importance ranking from FRAME?
3. **Stress the content.** Swap in the longest realistic strings, an empty collection, a
   large collection, missing images. Re-render; look again.
4. **Compute the computable.** Contrast ratios, line length, type scale steps, spacing
   values against the scale — these are arithmetic. Compute or script them; never eyeball
   a number a formula settles.
5. **Walk the states.** Tab through with a keyboard; trigger hover, focus, disabled,
   loading, error, empty. Every state either has a designed appearance or is a finding.
6. **Scan against the slop catalog and the missed-details list**, item by item, as a
   checklist — not from memory of having "kept them in mind". Cross-check the
   `make-interfaces-feel-better` review checklist for the craft-specific items.
7. **Repair and re-verify.** Fixes change layout; a fix can break a neighbor. Loop until
   one complete pass over the final artifact is clean.

Where the environment grants no renderer, say so in the delivery, downgrade every visual
claim to DERIVED or ASSUMED, and compensate by computing everything computable (step 4)
and hand-tracing the layout with concrete content lengths.

## Evaluate Before Delivering (act-backed, per the Self-Review Gate)

Each verdict must point to the act that proved it:

| Dimension | Passes when | Proven by |
|-----------|-------------|-----------|
| Hierarchy | #1 element wins the squint test | rendered inspection |
| Consistency | all values on the token scales | token audit / grep |
| Readability | contrast, measure, line height in range | computation |
| States | interaction + data states designed | state walk |
| Robustness | survives longest/empty/overflow content | stress render |
| Distinctiveness | zero slop-catalog matches; fits this brief | checklist scan |

Deliver with Claim Discipline: "verified at three widths with stressed content" is a
different — and honest — claim than "this should look good". If a dimension was not
verified, name it as the weakest link instead of letting fluent delivery imply it.

## Do / Don't

| Don't | Instead |
|-------|---------|
| Start typing markup from the prompt | FRAME the job, rank the elements, fix the tokens first |
| Judge the design from its source code | Render it and look, or downgrade the claim honestly |
| Add decoration when a section feels weak | Subtract noise; strengthen hierarchy or content |
| Emphasize everything that seems important | Pick what loses; one accent voice |
| Design with placeholder and medium-length data | Use real longest/shortest/empty content from the start |
| Eyeball contrast, measure, and spacing | Compute them — they are arithmetic |
| Ship the first error-free render | Run the stress + states + slop passes, then loop repairs |
| Restyle what the brief did not ask about | Scope line from FRAME: flag adjacent issues, one sentence |
