# Design

**The canvas lives here:** <https://claude.ai/code/artifact/5c1997e1-3227-48cd-9f5b-643510e5db82>

Eight artboards on two rows — screens on top, system underneath:

| Artboard | What it settles |
|---|---|
| Fight screen | Split-screen layout, HP bars, option cards, mid-contact composition |
| Results | Clip-first, stats, rematch as the obvious next action (SPEC §6.6) |
| Typing surface | The four per-character states at real size (SPEC §6.2) |
| Impact beat | neutral → windup → contact → recoil, and why contact is one frame |
| Physics | Damage-driven launch curve, per-round escalation, KO ragdoll |
| Design system | Palette, type ramp, spacing, the two hard rules |
| Figure vocabulary | The nine animation states from SPEC §6.4 |
| Match flow | §2.1 sequence plus the ghost-fallback and disconnect branches |

## The system, in short

- **Type** — JetBrains Mono throughout, one family. Weight and size do all the work.
- **Ground** — `#0B0D10`, panels `#14181D`, 2px borders, no border radius.
- **Players** — you are `#56B4E9`, opponent is `#E69F00`. Okabe–Ito, distinguishable
  under every form of colourblindness, and reinforced by position (you always left).
- **States** — `#D55E00` errors, always with an underline; `#F0E442` momentum,
  specials, caret, and damage bursts.
- **Text** — `#E8EDF2` correct, `#5A6672` pending.

Two rules the whole design is built to make structurally true:

1. **Nothing signals by hue alone.** Colour is always paired with position, weight,
   or an underline (SPEC §6.7).
2. **Effects never reach the text.** The typing panel is opaque and painted over the
   stage band, so launches, bursts and shake physically cannot obscure what the
   player is reading (SPEC §6.5).

## Editing it

`canvas/` holds the source. To change the canvas, edit the `.dc.html` files and
re-seed with the `/design` skill — never hand-edit the published
`typefeud-design-system.html`, which is generated. Publishing the same file path
updates the same URL.

Saving from inside the canvas (the editor's Save button) publishes a new version
straight from the browser. If that has happened, read the artifact back before
editing locally or you will overwrite someone's work.

## Not settled

- Lunge distance and hang time read well as stills; they are unproven in motion.
  A Milestone 5 tuning question.
- Stick figures are drawn as thick round-capped strokes rather than true filled
  outlines — close to the reference pictogram style and far easier to rig, but a
  simplification.
- SPEC §6.4 calls SVG viable "because stick figures are line segments". Filled
  pictograms are more work to rig by hand than that implies; it strengthens the
  case for Rive at Milestone 5.
