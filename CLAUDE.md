# CLAUDE.md

Quick start for adding a panda to Friends of BigPanda. The person you're
helping is a software engineer, not a 3D artist: you do the modelling, they
judge the screenshots.

## The project

Posable panda figures built in code with three.js: primitives and swept tubes
in five passes (Rig, Blockout, Tubes, Details, Look), viewable in the browser.
Each figure is a recipe in `figures/` assembled from a kit of parts, and is also
exported as a multi-colour 3D print (Bambu A1 mini, at most 4 filaments per plate).
Everyone stays a panda: identity comes from hair, glasses, beard, outfit, pose
and props.

## Add a figure

1. Ask who the panda is for, what to call them (first name only), and what
   makes them recognisable: hair, glasses, facial hair, clothes, a pose, a prop.
   A photo helps; use it for visual traits only and keep it out of the repo.
2. Read `docs/design-language.md` (how figures are designed, what reads at
   40 mm, what was tried and rejected) before choosing parts.
3. Create `figures/<id>.json` (id: lowercase, digits, dashes); the format is
   documented at the top of `src/recipes.js`. Copy an existing figure as a
   start. Touch only your figure's file and the kit parts it needs.
4. Pick parts from the kit first:
   - hair: `HAIR` in `src/hair.js`
   - beards: `BEARDS` in `src/beard.js`
   - glasses: `GLASSES_STYLES` in `src/passes.js`
   - outfits: `OUTFITS` in `src/outfit.js`
   - eyes, mouths, snouts: `EYE_STYLES`, `MOUTHS`, `SNOUTS` in `src/passes.js`
   - props: `PROPS` in `src/passes.js`
   - poses: `POSES` in `src/rig.js` (degrees; `tools/reach.mjs` finds arm
     angles for a paw target)
5. When the kit lacks a part, add a reusable option (a new style or option
   in the table above), not a figure-only hack. Existing figures must not
   change: screenshot them before and after and compare with `tools/pixdiff.mjs`.
6. Colours come from the global palette `FILAMENTS` in `src/passes.js` (white,
   black and six accents). A figure uses at most 4 filaments, white and black
   included. Give its signature pose a QR code in `codes`: a random 4-digit
   upper-case hex code no other recipe uses (`npm run check` verifies).

## Check and show

```sh
npm install
npm run build        # viewer → dist/site/index.html
npm run check        # every recipe against the kit
npm run posecheck    # arms vs head for every pose
node tools/print.mjs print-out <id>   # print export of your figure → print-out/ (must report connected_bodies: 1)
npm run print        # every plate, plus Bambu Studio projects (needs Bambu Studio)
```

Screenshots (headless Chromium via playwright-core; set `CHROMIUM_PATH` to a
Chromium/Chrome binary if Playwright's own isn't installed):

```sh
node tools/shots.mjs "<id>/5:<pose>:angle,<id>/5:<pose>:side,<id>/5:<pose>:front:focus=head" 700 760
node tools/palette.mjs <id> eyes "open;alert;serene"   # one sheet comparing options of a field
```

Always look at the screenshots yourself, then show them to the user (front,
side, a head close-up, and the print preview `print-out/preview-<id>-<pose>-white-iso.png`)
before moving on. Build, show, take feedback, repeat.

## Printability

The rules that keep a figure printable (one connected solid, details ≥ 0.85 mm,
no thin parts in mid-air, painted vs sculpted features, colour changes) are in
`README.md`, section "Design rules", and in `docs/design-language.md`. Follow
them; check with `npm run print`.

## Finish

Work on a branch and open a pull request with the screenshots. Never change
`EDITION`: editions are changed by hand (README, "Editions").
