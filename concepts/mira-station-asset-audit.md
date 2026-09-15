# Mira station asset audit

Truthful inventory for the one-station proof. Production files were not modified.

## What exists in the repo today (production)

| File | Pixels | What it actually is |
| --- | --- | --- |
| `assets/runner-deep.png` | 220×339 RGBA | **One** side-view walking/standing frame. Not a sheet. No idle, work, receive, or handoff cells. |
| `assets/scanslime.png` | 282×260 RGBA | **One** front-facing static frame. Not a sheet. |
| `assets/floor.jpg` | 1280×720 JPEG | Flattened isometric office. Desks and empty chairs are baked in. There is no `office-floor.jpg`. |
| `assets/occluders/north-desks.png` | 901×161 | Rough desk-row cutout. Not a Mira-only chair/desk mask. |
| Other `assets/runner-*.png` + mascots | single frames | Same limitation: one pose each, no 4-direction walk sheets. |

A static walking PNG is not an animation asset. It was **not** used as a frame in this proof.

## What was missing

- No seated / workstation Mira frames
- No idle / working / receiving / handoff sheets
- No 4-direction walk sheets
- No Scanslime idle / scanner / completion sheet
- Sprites cannot sit behind furniture inside `floor.jpg` without a mask

## What this proof created (concepts only)

Original seated isometric art was authored to match the room (perspective, dark purple light, cyan monitor light, furniture scale). Frames are stepped on a **fixed canvas** with a locked seat-contact anchor. No CSS rotate, scale, skew, bob, float, slide, limb-clip, or whole-person opacity blink.

| Asset | Canvas | Frames |
| --- | --- | --- |
| `concepts/sprites/mira-sheet.png` | 11 × 56×64 | 0–1 idle (coat/blink) · 2–5 working (hands/upper body) · 6–7 receiving (head turn) · 8–10 handoff (monitor reach) |
| `concepts/sprites/scanslime-sheet.png` | 5 × 28×26 | 0–1 idle · 2–3 scanner reaction · 4 completion |
| `concepts/sprites/mira-chair-mask.png` | 1280×720 | Chair back / seat / casters cut from `assets/floor.jpg` |
| `concepts/sprites/contact-shadow.png` | 34×10 | Stationary ellipse |

Mira display size is 58px tall on the 1280×720 floor (nearest-neighbor from the seated master). Foot/hem anchor is `(30, 62)` in every cell. Seat on the floor is integer `(544, 208)`.

## Stop condition

Compatible workstation frames **were** created. CSS was not used to fake a walk cycle. If this proof is rejected for art quality, the next step is a dedicated pixel-art pass on the same locked canvas — not another dashboard.

## Proof artifacts

| File | What |
| --- | --- |
| `concepts/mira-station-proof.html` | Standalone page. 10s sequence. Does not restart. |
| `concepts/screenshots/mira-station-proof.png` | 1920×1080 still at WORKING ~3.5s |
| `concepts/screenshots/mira-station-proof.gif` | 10s stepped 8fps GIF (1280×720) |
| `concepts/screenshots/mira-station-proof.mp4` | Same sequence, 1920×1080 |

## Acceptance self-check

| Fail if | Result |
| --- | --- |
| Still looks like the walking PNG | Pass — walking `runner-deep.png` is unused. Seated isometric master only. |
| Slides / bounces / rotates / scales / floats | Pass — stepped sheet cells, locked anchor, no CSS body motion. |
| Resolution mismatch | Pass — 58px seated figure vs ~50px chair; nearest-neighbor. |
| Feet move between frames | Pass — seat-contact anchor `(30, 62)` on every cell. |
| Desk does not occlude | Pass — chair mask cut from `floor.jpg` draws in front of the lower coat. |
| Lighting mismatch | Pass — dark cyan coat, purple room, cyan monitor light. |
| Scanslime size changes | Pass — 28×26 cell, same fit for all 5 frames. |
| Floating card covers characters | Pass — HUD is a small corner overlay only. |
| Needs persistent dashboard to explain | Pass — no rails, cards, metrics wall, or pipeline. |
| Restarts on the same poll | Pass — HTML plays once and stops. No `status.json` poll. |

## Do not build

The other four agents stay unanimated until this station is approved.
