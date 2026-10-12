# CLAUDE.md

Quick start for adding a panda to Friends of BigPanda. The person you're
helping is a software engineer, not a 3D artist: you do the modelling, they
judge the screenshots.

## The project

Posable panda figures built in code with three.js: primitives and swept tubes
in five passes (Rig, Blockout, Smoothing, Details, Shading), viewable in the browser.
Each figure is a recipe in `figures/` assembled from a kit of parts, and is also
exported as a multi-colour 3D print (Bambu A1 mini, at most 4 filaments per plate).
Everyone stays a panda: identity comes from hair, glasses, beard, outfit, pose
and props.

## Interview

Before touching a file: start `npm install` in the background, then
interview. Use AskUserQuestion (up to 4 questions per call, 2–4 options each;
"Other" is added for free text; `multiSelect` where noted). One round at a
time; read the answers before writing the next round. Skip anything already
answered (in the prompt, by the photo) and say in the question text what you
took from where. At most four rounds; stop as soon as you have three traits,
an accent, a pose and a prop. Never ask about what does not read at 40 mm
(eye colour, stubble, patterns, text, jewellery).

Round 1, who:
- Who is the panda for? `Me` / `A colleague` / `A team mascot, not a person`
- Do you have a photo? `I'll paste one now` / `No, I'll describe them`

Then, in chat: ask for the first name, and wait for the photo if promised.

Photo: read only hair silhouette, hair colour, facial hair and glasses from
it; say what you read and let them correct it. Never copy it into the repo,
never describe the person beyond those four things in files, commits or the
PR. The figure carries a first name only; its id is the lowercase first
name, with an initial if taken (`hadas-n`).

Round 2, looks (only what the photo left open):
- Hair: `None, plain panda head` / `Short` (`crop` or `short`) / `Tall or
  textured on top` (`textured`) / `Long` (`long`); `topknot` (tied up, with
  `band` for a headband) via Other.
- Hair colour: `Black` / `Brown` / `Grey`. Hair and beard share one colour.
- Facial hair: `None` / `Goatee` / `Short boxed beard` (`boxed`) / `Full long
  beard` (`full`); `ninja` (angular jaw beard) only when the photo shows one.
- Glasses: `None` / `Frames` (`octagon` or `halfRim`) / `Shades`.

Round 3, character:
- Which sounds most like them? (the question text invites an MBTI type via
  Other) `Runs the show: organised, decisive, on time` / `Deep in the
  problem: quiet, finds the bug nobody else can` / `The one everyone talks
  to: warm, listens, remembers` / `Up for anything: spontaneous, makes it fun`
- Known for, or a hobby (pick up to 2, `multiSelect`): `Running or sport` /
  `Music, always in headphones` / `Photography` / `Martial arts, yoga,
  meditation`; anything else via Other (coffee, bike, laptop, pet...).
- Mood on the figure: `Cheerful, laughing` / `Calm and kind` / `Focused,
  intense` / `Zen, eyes closed`.

Round 4, finishing (after applying the maps below):
- Accent colour, one: `Blue` / `Green` / `Yellow` / `Red` (grey via Other).
- Outfit: `Plain panda` / `Dress` / `Gi (wrapped robe with belt)`.
- Pose: your three best candidates from `POSES`, each named with its comment
  line from `src/rig.js` and the prop it implies (e.g. `hooray: shows the
  tablet off`), plus `You choose` as the fourth.

Maps (orientation, not law; the photo and the free text win):
- Hobby → prop and pose: sport → `run`; music → `headphones` (+ `notes` or
  `point`); photography → `camera`, `backpack` (+ `photo`, `run`); martial
  arts or meditation → `gi`, `katana`, `ready` or `meditate`; dashboards and
  numbers → `tablet` (+ `hooray`, `puzzled`); always on time → `stopwatch` +
  `onTime`; launches → `rocket` + `liftoff`; security → `shield` + `guard`;
  debugging → `magnifier` + `inspect`.
- Trope → pose and face: runs the show → `handsOnHips`, `onTime`, `point`,
  eyes `open` or `focused`, mouth `smile` or `firm`; deep in the problem →
  `inspect`, `puzzled`, `notes`, `focused` + `calm`; the one everyone talks
  to → `welcome`, `wave`, `hipWave`, `open` or `relaxed` + `smile` or `beam`;
  up for anything → `dance`, `hooray`, `run`, `liftoff`, `closed` + `grin`.
- Mood → face: cheerful = `closed` + `grin` (or `beam`); calm and kind =
  `open` or `relaxed` + `smile` or `calm`; focused = `focused` or `alert` +
  `firm`; zen = `serene` + `calm`. `alert` only on an action pose; `wink` and
  `big` are seasoning, not identity.
- Not in the kit yet (hat, cap, mug, laptop, phone, bike, instrument, pet,
  ponytail, curls): extend the kit, cheapest step first (Add a figure,
  step 5): a variant of an existing part (new colour, angle, parameters)
  before a new part. Name the step in the summary; don't ask about it as
  another question.
- Do not give a new figure another cast member's prop + pose pair (magnifier
  + `inspect` is the Detective) unless it is genuinely theirs.

Summary, in chat, then one question: name and id; the three traits that read
at 40 mm; filaments as a list (white, black, hair colour if any, accent; at
most 4, so brown hair plus a grey beard plus an accent does not fit); pose,
prop, eyes and mouth; kit parts vs new kit parts, and what each new part
costs; what you left out and why. Unanswered questions get the kit default,
named here. Then AskUserQuestion: `Build it` / `Change something first`.
From here on it is a normal session (Add a figure, below): build, show
screenshots, take feedback. AskUserQuestion only returns to pick between
rendered candidates, after showing the `tools/palette.mjs` sheet.

## Add a figure

1. Run the interview (above) and get the summary confirmed: who, first name,
   three traits, accent, pose, prop, kit vs new parts.
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
5. The kit is young and small, so extending it is normal. Go for the
   cheapest step that carries the trait:
   1. An existing part as is, varied in the recipe: slot colour, `accent`,
      eyes and mouth per pose (`faces`), `look`, `spin`, `only`/`hide`.
   2. A variant of an existing part: a new entry copied from an existing
      style, prop or pose with a few values changed (colour, angle, length,
      volume). Cheap, and it matches the cast by construction.
   3. A new part (a new style, prop, pose or parameter), reusable by later
      figures, never a figure-only hack.

   For 2 and 3:
   - Existing figures must not change: new parameters default to the old
     behaviour. Screenshot every figure before and after and compare with
     `tools/pixdiff.mjs`.
   - New parts must look like the cast's: chunky toy pieces with rounded
     lips, the same thickness and detail level, accents from the palette
     (`docs/design-language.md`, section 1). Render the new part next to
     existing figures and check it against the review checklist (section 5)
     before showing it.
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
`docs/design-language.md`, section 3; the print export itself is described in
`docs/printing.md`. Follow them; check with `npm run print`.

## Finish

Work on a branch and open a pull request with the screenshots (`gh repo fork
--remote` first if you cannot push to the repo). Never change
`EDITION`: editions are changed by hand (`docs/printing.md`, "Editions and releases").
