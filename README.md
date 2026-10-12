# Friends of BigPanda

Panda figures built entirely in code with [three.js](https://threejs.org), no
modelling tool involved: a skeletal rig posed from hard-coded angles, rough
shapes on the bones, one smooth tube per arm and leg, a painted-on face, then
materials and light. The same model is exported as a multi-colour 3D print
for Bambu Studio, with a QR code under its base that links back to the
figure. Live at **https://pandas.xoob.de**.

## Run

```sh
npm install
npm run build        # → dist/site/index.html (the stage) and viewer.html
```

Serve `dist/site/` with any static file server, e.g.
`python3 -m http.server 8765 --directory dist/site`.

- **The stage** (`index.html`; `src/stage.js`, `src/stage.html`): the printed
  gang (`src/cast.json`) on a lit stage, each figure its own WebGL canvas,
  idling in its printed pose and trying other poses now and then. Select a
  figure to customize it (pose, accent, base, eyes); the layers button shows
  the build passes. On phones the gang stands on a carousel: one finger
  swipes it, two fingers turn the figure in front.
- **The viewer** (`viewer.html`; `src/main.js`, `src/shell.html`): one
  character to inspect: orbit, pick a pose, view and build pass, wireframe
  and bones. `tools/shots.mjs` drives it for screenshots.

## How the model is built

| File | Contents |
|---|---|
| `src/rig.js` | Joint layout, pose parameters (degrees), `POSES`, pose blending (`PoseDriver`), knees, body lean/turn, automatic grounding |
| `src/shapes.js` | Geometry helpers: ellipsoid, `sweep()` tube through joints (centripetal Catmull-Rom, smooth radius, parallel-transport frames) |
| `figures/*.json` | One recipe per character: poses, face, slot parts (hair, beard, glasses, outfit: style + colour), props, accent, QR codes |
| `src/recipes.js` | Recipe format and checks against the part library |
| `src/passes.js` | The build passes, proportions, colours and filaments (`COLOURS`, `FILAMENTS`, `ROLES`), face parts (`SNOUTS`, `EYE_STYLES`, `MOUTHS`), glasses styles (`GLASSES_STYLES`), props (`PROPS`), print settings (`PRINT`) |
| `src/hair.js`, `src/beard.js`, `src/outfit.js`, `src/facepatch.js` | Hair styles (`HAIR`), beards (`BEARDS`), outfits (`OUTFITS`), and the face patches beards and mouths sit on |
| `src/panda.js` | Model container: loads the recipes (`VARIANTS`), add/remove parts, per-pose prop visibility, accent colour, pose application, dispose |
| `src/stage.js`, `src/stage.html` | The stage |
| `src/main.js`, `src/shell.html` | The viewer |
| `src/print.js`, `src/preview.js` | Browser side of the print export |

Passes, each applied on top of the previous one:

1. **Rig** – joints and bones, posed from the pose table
2. **Blockout** – primitives, one capsule per bone
3. **Smoothing** – capsules replaced by one tube per limb, interpolated through its joints
4. **Details** – fur markings, face, snout, glasses and props
5. **Shading** – colours, shadows, reflections

### Add a pose

Add an entry to `POSES` in `src/rig.js` (only values that differ from
`NEUTRAL`), then check it:

```sh
npm run posecheck    # arm-vs-head clearance for every pose
npm run reach -- L 0.5 1.3 0.45   # arm angles that put a paw at a point
```

### Add a character

Add `figures/<id>.json` (the format is at the top of `src/recipes.js`;
`CLAUDE.md` walks through it). New parts go into the kit: hair styles in
`HAIR` (`src/hair.js`), beards in `BEARDS` (`src/beard.js`), outfits in
`OUTFITS` (`src/outfit.js`), and glasses styles, props and colours in
`GLASSES_STYLES`, `PROPS` and `COLOURS` (`src/passes.js`). Then:

```sh
npm run check        # every recipe against the part library
```

A figure uses at most 4 filaments, white and black included. Its recipe's
`codes` give each printed pose a unique random 4-digit hex QR code; an
optional `accent` puts every accessory in one colour, and `spin` turns the
figure on the stage so its best side shows first.

## 3D printing

```sh
npm run print        # build + export → print-out/ (needs Bambu Studio installed)
```

Prints the figures on the `PLATES` in `tools/print.mjs` (`[character, pose,
base colour, cut]`; the plates of an edition are set there by hand) on a round
base (`BASE`, about 40 mm across and 3 mm high). All figures share one scale:
a plain panda standing in the Rest pose is `PRINT.height` (40 mm) tall; seated
figures come out shorter, and a figure that would be taller than 40 mm is
shrunk to fit. Each part prints in the filament of its colour (`FILAMENTS`);
a figure, and a plate, uses at most 4 filaments. Plates: `gang_a`, `gang_b`,
`gang_c` (the five printed figures, two accents per plate) and `gang_test_a`,
`gang_test_b` (flat validation plates of slices through the parts that
changed). `node tools/print.mjs <out> <id> …` prints just those figures,
whole, in their signature pose (what the pull-request preview does). Writes:

- `<figure>-<pose>-<base>.3mf` – Bambu Studio project: one object per figure, one
  part per filament on its AMS slot, complete print settings
- `<figure>-<pose>-<base>-<slot>-<colour>.stl` – one STL per filament, aligned
- `gang_a.3mf`, `gang_b.3mf`, `gang_c.3mf`, `gang_test_a.3mf`, `gang_test_b.3mf` – the plates
- `preview-*.png` (front, iso, back, bottom, detail), `report.json` (sizes,
  volumes, connectivity, plate contact area)

Painted areas become 0.85 mm inlays and fine details are thickened to at least
`PRINT.minLine` in print mode. `tools/print.mjs` does the solid modelling with
`manifold-3d` and writes the STLs and `projects.json`; `tools/bambu.py`
packages the projects with Bambu Studio's own CLI and test-slices each one
(printing time, filament, filament changes). Settings: A1 mini with AMS lite,
0.4 mm nozzle, "0.16mm Optimal", Bambu PLA Basic, tree supports, support-cubic
infill, Arachne walls, figures 12 mm apart (room for the support brims) and the
prime tower in a square grid on the bed, purge volumes by the colour switched
to (`PURGE`: white 220, black 70, accent 150 mm³). White and black alternate on
almost every layer, so filament changes dominate the printing time: about
8–11 h per figure.

Edition 1 was printed with every accessory in blue and every base in white;
the stage, the viewer and the print export now show each of the gang in its
own accent colour (the recipe's `accent`: blue, green, yellow, red or grey).

### Editions and releases

An edition is a set of figures released together (Edition 1: the gang; next:
the ADR Team). Its number, in the `EDITION` file, goes into the figures' QR
links as a hint of when a figure was printed. Starting a new edition is a
deliberate step: edit `EDITION` by hand; nothing bumps it.

Each edition's printed projects are a GitHub release, `edition-<number>`. The
stage's "Print in Bambu Studio" opens them from there (`RELEASE` in
`src/stage.js`). To publish: `npm run print`, check the projects, then
`npm run release` (uploads them from `print-out/` to the release of the
current `EDITION`, replacing files of the same name).

### QR codes

The underside of each base carries a QR code (first layer, about 0.93 mm
modules, mirrored so it reads from below) that links to
`https://pandas.xoob.de/<CODE>/<edition>`: a random 4-digit hex code per
printed pose from the figure's recipe (`codes`), plus the edition. The build
turns the codes into Cloudflare `_redirects` (302 to the stage on that figure
and pose, with a wildcard for the edition), so a target can change at any
time without reprinting. A recipe keeps every code ever printed, so old
figures keep working (`npm run check` keeps them unique). The viewer shows
the same base and QR code (Bottom view).

## Design rules

Learned from the viewer and from test prints (A1 mini, 0.4 mm nozzle, 40 mm
figures). Follow them for new characters, poses and props.

**One model for viewer and print.** The base, props, decals and inlays are
the same parts in both; the print export only thickens details and turns
painted areas into inlays. What the viewer shows is what prints.

**Painted, not raised.** Anything that is only a colour (eye patches, pupils,
mouths, badge, tablet icon) is a decal on the surface in the viewer and a
flush inlay in print (0.85 mm deep, `PRINT.inlay`). Raised bumps stand off
the face and need supports. Reserve 3D shapes for real volumes (nose, ears,
props).

**Eyes are painted.** Each eye is an eye patch plus one of the eye styles
(`EYE_STYLES`, a recipe's `eyes`), flat: `open` is a white oval pupil,
`closed` a white crescent, thick in the middle and pointed at both ends. Each
is a decal on the patch in the viewer (drawn after it) and a white inlay in
print. A new eye style must be painted the same way; raised pupils and
crescents stood off the face, needed support and printed jittery.

**Decals only where they belong.** Project a decal just as deep as the
surface curves under it, or it also lands on the chin or cheek behind
(mouth lines size their depth from the curve). Moved decals (pupils looking
sideways) slide along the surface's tangent plane, not straight across.

**No overhangs that need support from the base.** Props on the floor are
solid down to the base (the gadget), props held low rest on it (the
shield's tip). Tree supports are fine for arms and props held up high. Leave
the support filament to the slicer: forced to black, supports left dark
marks where they touch white surfaces.

**Minimum sizes.** Details at least 0.85 mm (`PRINT.minLine`, two lines of
the nozzle). First-layer features at least one solid line (about 0.7 mm):
thinner strokes break up. Single isolated first-layer dots need about 1 mm
or they get knocked off when the other colour prints (QR codes with 0.72 mm
modules mostly failed to scan).

**Colour changes cost the most time.** Every layer prints each colour
present in it once, with a purge in between, so a colour that appears where
it otherwise isn't needed adds changes on every layer it spans. Weigh it case
by case against the look.

**One connected solid per figure.** Everything touches: soles and floor
props sink into the base (`BASE.sink`), held props overlap the paw. The
export checks it (`connected_bodies: 1`).

**Readable from the default view.** Turn heads toward the viewer (or set
`look`) so both pupils stay visible in the angled view; a pupil seen
edge-on makes the eye look closed. Kicked-up feet point their toes down
along the shin instead of staying level.

**Base underside.** Only a QR code, as large as the flat face allows,
black on white on any base colour, as one first layer (0.2 mm; black printed
first), with a slower first layer whose travel avoids printed areas. Curved
lettering around it (2.7 mm, 0.7 mm strokes) came out garbled and was
removed.

**Inlays on curved surfaces reach deeper.** A painted area is a flat 2D
shape pushed into the part; where the surface curves away from that plane
the inlay must reach further, or its edges go missing. Decals on the head
and body get extra depth (`reach`); their outer face is the part's own
surface, so they sit flush on the curve.

**Check before calling it done.** `npm run posecheck` (arms clear the head),
`npm run print` (every figure `connected_bodies: 1`, each project slices),
QR codes decode from the previews, and screenshots of the change.

## Tools

The tools drive headless Chromium through `playwright-core`. Set
`CHROMIUM_PATH` to use a specific Chromium build.

- `tools/shots.mjs` – screenshots of any character/pass/pose/view
- `tools/sheet.py` – contact sheet of screenshots (needs Pillow)
- `tools/posecheck.mjs`, `tools/reach.mjs` – pose checks
- `tools/check.mjs` – recipe checks (`npm run check`)
- `tools/preview.mjs` – one preview sheet per figure (angled, front, side, head close-up)
- `tools/palette.mjs` – compares the options of one recipe field side by side
- `tools/pixdiff.mjs` – compares two folders of screenshots pixel by pixel (proves a refactor changed nothing)
- `tools/print.mjs`, `tools/bambu.py` – print export
- `tools/release.mjs` – publishes the printed projects as a GitHub release

## Deploy

Every push to `main` deploys: Cloudflare Workers Builds (the Worker's Git
integration) runs `npm run build` and `npx wrangler deploy`, serving
`dist/site/` as static assets (`wrangler.jsonc`). Every other branch gets a
preview with its own URL (`npx wrangler preview`), and each pull request a
comment with its figures' preview sheets and print previews
(`.github/workflows/preview.yml`). No deploy token is stored in GitHub. By
hand, with `wrangler login`:

```sh
npm run deploy       # build + wrangler deploy → https://pandas.xoob.de
```
