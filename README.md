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

Passes, each applied on top of the previous one:

1. **Rig** – joints and bones, posed from the pose table
2. **Blockout** – primitives, one capsule per bone
3. **Smoothing** – capsules replaced by one tube per limb, interpolated through its joints
4. **Details** – fur markings, face, snout, glasses and props
5. **Shading** – colours, shadows, reflections

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

## Add a figure or a pose

[`CLAUDE.md`](CLAUDE.md) is the quick start for a new figure (a recipe in
`figures/`, parts from the kit, the checks and screenshots), and
[`docs/design-language.md`](docs/design-language.md) is how figures are
designed and kept printable: read it before adding a figure, a part or a
pose.

A pose is an entry in `POSES` in `src/rig.js` (only the values that differ
from `NEUTRAL`):

```sh
npm run check        # every recipe against the part library
npm run posecheck    # arm-vs-head clearance for every pose
npm run reach -- L 0.5 1.3 0.45   # arm angles that put a paw at a point
```

## 3D printing

```sh
npm run print        # build + export → print-out/ (needs Bambu Studio installed)
```

Exports the plates as Bambu Studio projects (A1 mini with AMS lite, at most
4 filaments per plate), with a QR code under each base that links back to the
figure. Each edition's projects are published as a GitHub release, which the
stage's "Print in Bambu Studio" opens. Plates, settings, editions and QR codes:
[`docs/printing.md`](docs/printing.md).

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
