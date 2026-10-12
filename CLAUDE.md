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

Start `npm install` in the background, then get to know the panda. Follow the
user's lead: what they volunteer (a photo, a pose they like, a name) beats
any question you planned. Never ask about something already answered, and
never about what does not read at 40 mm (eye colour, stubble, patterns,
text, jewellery).

1. One chat message: who is the panda for (themselves, a colleague, a team
   mascot), the first name on the figure, a photo if they have one, and a
   few words in their own voice: what they're known for, a hobby, a
   favourite gadget, a pose they like, an MBTI type if they know it.
2. Read the answer and the photo, and say what you took from them.
3. At most one AskUserQuestion round (up to 4 questions, 2–4 options each;
   "Other" is added for free text) for what is still open, built from the
   question bank below. Skip it when nothing important is open. If the user
   turns the cards down, carry on in chat and don't use them again.

Photo: read only hair silhouette, hair colour, facial hair and glasses from
it. Never copy it into the repo, never describe the person beyond those four
things in files, commits or the PR. The figure carries a first name only;
its id is the lowercase first name, with an initial if taken (`hadas-n`).

Question bank: looks (only what the photo left open):
- Hair: `None, plain panda head` / `Short` (`crop` or `short`) / `Tall or
  textured on top` (`textured`) / `Long` (`long`); `topknot` (tied up, with
  `band` for a headband) via Other.
- Hair colour: `Black` / `Brown` / `Grey`. Hair and beard share one colour.
- Facial hair: `None` / `Goatee` / `Short boxed beard` (`boxed`) / `Full long
  beard` (`full`); `jaw` (short beard from cheek to cheek) via Other; `ninja`
  (angular jaw beard) only when the photo shows one.
- Glasses: `None` / `Frames` (`octagon`, `halfRim` or thin `round` wire) /
  `Shades`.

Question bank: character:
- Which sounds most like them? (the question text invites an MBTI type via
  Other) `Runs the show: organised, decisive, on time` / `Deep in the
  problem: quiet, finds the bug nobody else can` / `The one everyone talks
  to: warm, listens, remembers` / `Up for anything: spontaneous, makes it fun`
- Known for, or a hobby (pick up to 2, `multiSelect`): `Running or sport` /
  `Music, always in headphones` / `Photography` / `Martial arts, yoga,
  meditation`; anything else via Other (coffee, bike, laptop, pet...).
- Mood on the figure: `Cheerful, laughing` / `Calm and kind` / `Focused,
  intense` / `Zen, eyes closed`.

Question bank: finishing (after applying the maps below):
- Accent colour, one: `Blue` / `Green` / `Yellow` / `Red` (grey via Other).
- Outfit: `Plain panda` / `Dress` / `Gi (wrapped robe with belt)` / `Hoodie`.
- Pose: your best candidates, existing ones from `POSES` named with their
  comment line from `src/rig.js` and the prop they imply (e.g. `hooray:
  shows the tablet off`) and new ones described in a few words (e.g. `new:
  sips coffee`), plus `You choose`; four options at most.

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
- The kit is small, so these maps only name the closest existing parts.
  Every figure gets at least one new part of its own (Add a figure, step 5):
  pick the trait that most defines the person (a ponytail, curls, a cap, a
  mug, a laptop, a bike, an instrument, a pet, a signature gesture) and
  plan it as a new kit entry. Name it in the summary; don't ask about it as
  another question.
- Do not give a new figure another cast member's prop + pose pair (magnifier
  + `inspect` is the Detective) unless it is genuinely theirs.

Summary, in chat, short: name and id; the three traits that read at 40 mm;
filaments as a list (at most 4, white and black included); pose, prop, eyes
and mouth; the new kit parts you will build; what you left out and why.
Then build right away; the user corrects course on the first screenshots.

## Working with the user

- Show a first render early: the recipe with existing parts as stand-ins,
  within the first few minutes, before building new parts. Then show each
  new part as soon as it renders. Never go quiet for long stretches.
- Filaments: count before you render. Every candidate you offer fits in 4
  filaments, and you label each with its list (e.g. "white, black, brown,
  purple"). When the user asks for a mix that does not fit, say so and offer
  the nearest mixes that do.
- A new palette colour (`FILAMENTS`) is a kit change with a real cost (one
  more spool to buy and load): propose it in the summary with a reason,
  don't add it silently.
- Candidates side by side in one sheet, labelled A, B, C, are faster to
  judge than questions.
- Edit files with your Edit and Write tools, not sed, heredocs or scripts,
  so the user can follow the diffs.

## Add a figure

1. Run the interview (above).
2. Read `docs/design-language.md` (how figures are designed, what reads at
   40 mm, what was tried and rejected) before choosing parts. Section 4
   lists looks that were already rejected (a beard stuck on the snout,
   stubble, strand hair, ...): check every new part against it before
   showing it.
3. Create `figures/<id>.json` (id: lowercase, digits, dashes); the format is
   documented at the top of `src/recipes.js`. Copy an existing figure as a
   start. Touch only your figure's file and the kit parts it needs.
4. The kit, where existing parts live and new ones go:
   - hair: `HAIR` in `src/hair.js`
   - beards: `BEARDS` in `src/beard.js`
   - glasses: `GLASSES_STYLES` in `src/passes.js`
   - outfits: `OUTFITS` in `src/outfit.js`
   - eyes, mouths, snouts: `EYE_STYLES`, `MOUTHS`, `SNOUTS` in `src/passes.js`
   - props: `PROPS` in `src/passes.js`
   - poses: `POSES` in `src/rig.js` (degrees; `tools/reach.mjs` finds arm
     angles for a paw target)
5. The kit is still small: a handful of hair styles, beards, props and
   poses. Reusing them makes every new figure look like an existing one, so
   until the kit is large, give each figure at least one new part of its own
   (a hair style, beard, prop or pose) that carries its identity. Build it as
   a reusable kit entry, never a figure-only hack, and start from the
   closest existing part's construction (its shell, parameters, proportions)
   so it belongs to the same toy line. Existing parts are fine for the rest
   of the figure.

   For every new part:
   - Existing figures must not change: new parameters default to the old
     behaviour. Screenshot every figure before and after and compare with
     `tools/pixdiff.mjs`.
   - New parts must look like the cast's: chunky toy pieces with rounded
     lips, the same thickness and detail level, accents from the palette
     (`docs/design-language.md`, section 1). Render the new part next to
     existing figures and check it against the review checklist (section 5)
     before showing it.
6. Colours come from the global palette `FILAMENTS` in `src/passes.js` (white,
   black and seven accents). A figure uses at most 4 filaments, white and black
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

Work on the branch `figure/<id>` (`git switch -c figure/<id>`, push with
`git push -u origin figure/<id>`; `gh repo fork --remote` first if you
cannot push to the repo). Pushing work in progress is fine.

When the user is happy, without waiting to be asked:
1. Run every check: `npm run check`, `npm run posecheck`, the print export
   of the figure (`connected_bodies: 1`), and the pixel comparison of the
   other figures whenever shared code changed.
2. Open the pull request, titled `Figure: <Name>`, its description like the
   other figure PRs: one line of the figure's traits, then
   `Live stage: https://figure-<id>-three-panda.xoob.workers.dev/#<id>/<pose>`
   (the branch's Cloudflare preview).
3. Give the user both links, the PR and the live stage. The preview
   workflow adds the figure sheets and print previews to the PR as a
   comment within a few minutes.

Never change `EDITION`: editions are changed by hand (`docs/printing.md`,
"Editions and releases").
