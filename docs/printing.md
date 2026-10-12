# 3D printing

Every figure is also a multi-colour 3D print for a Bambu Lab A1 mini with the
AMS lite. The print export uses the same model as the stage; how to design a
figure so it prints well is in
[design-language.md](design-language.md#3-printability).

```sh
npm run print        # build + export → print-out/ (needs Bambu Studio installed)
```

## Plates and scale

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
whole, in their signature pose (what the pull-request preview does).

Edition 1 was printed with every accessory in blue and every base in white;
the stage, the viewer and the print export now show each of the gang in its
own accent colour (the recipe's `accent`: blue, green, yellow, red or grey).

## Output

- `<figure>-<pose>-<base>.3mf` – Bambu Studio project: one object per figure, one
  part per filament on its AMS slot, complete print settings
- `<figure>-<pose>-<base>-<slot>-<colour>.stl` – one STL per filament, aligned
- `gang_a.3mf`, `gang_b.3mf`, `gang_c.3mf`, `gang_test_a.3mf`, `gang_test_b.3mf` – the plates
- `preview-*.png` (front, iso, back, bottom, detail), `report.json` (sizes,
  volumes, connectivity, plate contact area)

## How the export works

Painted areas become 0.85 mm inlays and fine details are thickened to at least
`PRINT.minLine` in print mode. `tools/print.mjs` does the solid modelling with
`manifold-3d` and writes the STLs and `projects.json`; `tools/bambu.py`
packages the projects with Bambu Studio's own CLI (flattened presets) and
test-slices each one headless (printing time, filament, filament changes).

Settings: A1 mini with AMS lite, 0.4 mm nozzle, "0.16mm Optimal", Bambu PLA
Basic, tree supports, support-cubic infill, Arachne walls, figures 12 mm apart
(room for the support brims) and the prime tower (about 80 × 40 mm) in a
square grid on the bed, purge volumes by the colour switched to (`PURGE`:
white 220, black 70, accent 150 mm³). White and black alternate on almost
every layer, so filament changes dominate the printing time: about 8–11 h per
figure.

## Editions and releases

An edition is a set of figures released together (Edition 1: the gang; next:
the ADR Team). Its number, in the `EDITION` file, goes into the figures' QR
links as a hint of when a figure was printed. Starting a new edition is a
deliberate step: edit `EDITION` by hand; nothing bumps it.

Each edition's printed projects are a GitHub release, `edition-<number>`. The
stage's "Print in Bambu Studio" opens them from there (`RELEASE` in
`src/stage.js`). To publish: `npm run print`, check the projects, then
`npm run release` (uploads them from `print-out/` to the release of the
current `EDITION`, replacing files of the same name).

## QR codes

The underside of each base carries a QR code (first layer, about 0.93 mm
modules, mirrored so it reads from below) that links to
`https://pandas.xoob.de/<CODE>/<edition>`: a random 4-digit hex code per
printed pose from the figure's recipe (`codes`), plus the edition. The build
turns the codes into Cloudflare `_redirects` (302 to the stage on that figure
and pose, with a wildcard for the edition), so a target can change at any
time without reprinting. A recipe keeps every code ever printed, so old
figures keep working (`npm run check` keeps them unique). The viewer shows
the same base and QR code (Bottom view).
