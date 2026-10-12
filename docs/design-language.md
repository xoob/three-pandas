# Design language — panda figures

Read this before designing a new figure. It is written from what worked and
what was rejected on the first cast (Analyst, Listener, Detective,
Photographer, Leon, Hadas N., Barak, Ganani, Fausto, the hologram placeholder),
so a new figure looks like it came from the same designer.

## 1. What makes them one family

- **Everyone is a panda.** White head and belly, black ears, eye patches,
  arms, legs. Identity comes from what is added on top, never from changing the
  panda. The eye patches stay black even behind glasses; the black nose stays.
- **Toy, not sculpture.** Think Playmobil/Lego: a few chunky, smooth, readable
  pieces. No facets, no noise, no fur texture. Every detail is a sculpted
  piece with a rounded lip, as if it were moulded separately and clipped on.
- **Shells and patches.** Hair is one shell grown from the head inside a
  hairline (`src/hair.js` `HAIR`: `hairline` control points, `thickness`,
  `volume`, `edge`, `fringe`, `ridges`/`comb`, `part`, `leave`+`hang` for
  long hair, `bun`+`tie`, `band` = headband with short tails lying on the
  hair). Beards and mouths are thin patches lying on the
  face (`src/facepatch.js`, `src/beard.js` `BEARDS`: polar outline around the
  mouth, `thickness` at mouth/jaw, `hang` below the jaw, `moustache`). Clothes
  are shells over the body (`src/outfit.js` `OUTFITS`: `dress`, `gi` with a
  dark `collar`, a knotted `belt` with short hanging ends, a `sash` cord).
  Carried gear is a prop (`PROPS`: `katana` slung on the back, its handle
  showing beside the head). The ears, nose and
  glasses "grow through" or sit on these shells; parts never float.
- **Proportions.** Big round head (radii 0.66/0.57/0.6) on a pear body, short
  limbs as swept tubes (`ARM`, `LEG` radii in `src/passes.js`), flat oval
  feet. A seated figure gets longer legs via the pose's `stretch` so they
  still show; never shrink the head to fit something.
- **Silhouette first.** A figure must be recognisable as a black-and-white
  cut-out: topknot, long hair, dress, shades, rocket. One strong silhouette
  element per figure, two at most.
- **Face vocabulary** (`src/passes.js`): `SNOUTS` `panda` (round, default) or
  `strong` (fuller muzzle, defined chin, for bare-faced or short-bearded
  figures); `EYE_STYLES` `open`, `closed` (laughing ∩), `relaxed`, `serene`
  (thin u_u lid line with a lash, meditating), `wink`, `big`, `focused`;
  `MOUTHS` `smile`, `frown`, `calm`, `firm` (straight, between moustache and
  chin beard), `grin` (painted D), `beam` (sculpted open smile with teeth).
  `alert` = the fierce face (`EYE.fierce`): an eye style may reshape the
  patches (`EYE_STYLES.<style>.patch`) — here angled patches with a flat top
  sloping down to the nose, a brow wedge on that edge, a D-shaped glaring
  white under the slanted lid and a big pupil: intense, not angry. Eyes can change per
  pose like mouths (`faces.<pose>.eyes`): a zen figure meditates with
  `serene` lids and stands ready with `alert` eyes. Open mouths (`grin`, `beam`) cut an opening in a beard;
  closed ones hide under it and the moustache marks the mouth.
- **Colour.** White, black, plus at most two accent filaments per plate
  (`COLOURS` in `src/passes.js`: blue, green, yellow, red, grey, brown, dark).
  Accents are small and purposeful: glasses frame, hair tie, a prop, a dress.
  Hair and beards are a natural colour (black, brown, grey); the face itself
  is never recoloured.
- **Props and poses** tell the character in one gesture: tablet + badge, headphones +
  notepad, magnifier, camera + backpack, rocket on a smoke column, stopwatch.
  Each figure has a standing pose and optionally one signature action pose
  (`POSES` in `src/rig.js`; `figures/*.json` `poses`, `only`/`hide`, `faces`).
  Poses are calm and legible: arms clear of the head (posecheck), feet on the
  base, nothing mid-air. The signature pose is what the stage opens on and
  what gets printed; a figure may have just that one.
- **Readable from the default angled view.** Turn heads or set `look` so
  both pupils stay visible (an edge-on pupil reads as a closed eye); kicked
  feet point their toes down along the shin.

## 2. Approaching a new character

1. **Collect**: a front and a profile photo, for visual traits only (hair,
   glasses, facial hair, clothes). Photos and personal details stay out of
   the repo; a figure carries a first name only.
2. **Pick 3 traits that read at 40 mm.** At desk distance you see: hair
   silhouette, facial hair mass, glasses shape, one accent colour, one prop,
   the pose. You do not see: stubble, eye colour, freckles, patterns, thin
   jewellery, text. Fausto = topknot + full beard + meditating; Ganani =
   textured hair + shades + rocket; Hadas N. = long hair + dress.
3. **At least one new part.** The kit is still small; a figure built only
   from existing parts looks like one already in the cast. Give each figure
   a new part of its own for its strongest trait, and use the kit for the
   rest. Render candidates side by side with `node tools/palette.mjs
   <figure> <field> 'a;b;c' front:focus=head` (eyes, mouth, snout, or slot
   JSON).
4. **New parts become kit options**, not figure hacks: a new hair style in
   `HAIR`, a new `BEARDS` entry, an `EYE_STYLES`/`MOUTHS` function, a pose in
   `POSES`, a prop in `PROPS`. Add general parameters (`comb`, `hang`, `tie`,
   leg `stretch`/`roll`) rather than special cases; existing figures must not
   change (defaults equal the old behaviour).
5. **Iterate with renders**, not in your head. `sh build.sh && node
   tools/shots.mjs "<id>/5:<pose>:angle,<id>/5:<pose>:side,<id>/5:<pose>:
   front:focus=head,<id>/5:<pose>:angle:focus=head,<id>/5:<pose>:top" 700 760
   light out/s`. Judge side and three-quarter views as hard as the front —
   the side view is where beaks, shelves and helmets show. `:bones` shows the
   rig, pass `3` shows the raw tubes.
6. **Check before you report**: `node tools/check.mjs` (recipes), `node
   tools/posecheck.mjs` (arm/head clearance for every pose), `node
   tools/print.mjs out` (every figure `connected_bodies: 1`, plate slots ≤ 4,
   look at `preview-<id>-{front,iso,back}.png`), and `node tools/pixdiff.mjs
   before after` on renders of the other figures whenever shared code moved.
7. **Report with pictures**: angle, side, head close-ups, print preview, the
   colours used (for plate planning), and the list of files touched.

## 3. Printability

Learned from the viewer and from test prints (A1 mini, 0.4 mm nozzle, 0.16 mm
layers, 40 mm figures). Follow them for new figures, parts, poses and props;
how the export works is in [printing.md](printing.md).

### Scale and sizes

- **One fixed scale for all figures**: a standing Rest-pose panda is 40 mm; a
  figure that would be taller is shrunk to fit, a seated one simply prints
  shorter. Design compact and low, not tall. 1 model unit ≈ 17 mm.
- **Minimum sizes.** Details ≥ 0.85 mm (`PRINT.minLine` 0.05, two nozzle
  widths); lines and inlays use `m.style.print` variants (e.g. eyes, mouth
  strands) that widen to it. Relief ≥ 0.02–0.03 units (0.4–0.5 mm) or it
  vanishes; comb grooves are 0.025, beard grooves 0.02–0.03. First-layer
  features ≥ one solid line (~0.7 mm; 0.43 mm letter strokes broke up);
  isolated first-layer dots need ~1 mm or they get knocked off when the other
  colour prints (0.72 mm QR modules mostly failed, 1 of 7 scanned; the codes
  now use ~0.93 mm).

### One model, one solid

- **One model for viewer and print.** Base, props, decals and inlays are the
  same parts in both; the export only thickens details and turns paint into
  inlays. What the viewer shows is what prints — never design a viewer-only
  look (the hologram placeholder is the one deliberate exception; mirrored
  shade lenses print hollow).
- **One connected solid per figure** (`connected_bodies: 1` in the print
  report). Soles and floor props sink into the base (`BASE.sink`), held props
  overlap the paw, and parts overlap their support by a few hundredths
  (`inlay`) so the booleans merge them.
- **No thin mid-air parts.** Everything hangs off something: hair is a shell on
  the head, a bun sits on the hair with its tie as a solid cylinder, the long
  beard rests on the chest, the rocket stands on a smoke column from the
  base, tucked feet and shins touch the base. A flag on a pole was dropped as
  unprintable.
- **No overhangs onto the base.** Floor props are solid down to the base
  (gadget, rocket smoke column), low props rest on it; tree supports are
  acceptable for raised arms and props held high. Leave the support filament
  to the slicer: forced to black, supports left dark marks where they touch
  white surfaces.

### Paint and relief

- **Painted vs raised — how to decide.** Anything that is only a colour (eye
  patches, pupils, the grin "D", badge, tablet icon) is a surface decal in
  the viewer and a flush 0.85 mm inlay in print (`PRINT.inlay`); raised bumps
  on the face need supports and were removed (tube mouths, ellipsoid pupils).
  Sculpted face pieces — hair, beards, moustache, the `beam` mouth, lid-line
  eyes — are volumes because they change the silhouette or must read from
  the side. Rule: a feature that changes the silhouette or must be seen in
  profile is a volume (hair, beard, nose, ears, props); a feature that only
  changes colour on the surface is paint. Sculpted face pieces lie on the
  face with a rounded lip and reach into the head (`inlay`), so they print
  as supported relief, not as bumps standing off the surface.
- **Eyes are painted.** Each eye is an eye patch plus one of the eye styles
  (`EYE_STYLES`, a recipe's `eyes`), flat: a decal on the patch in the
  viewer (drawn after it) and a white inlay in print. Raised pupils and
  crescents stood off the face, needed support and printed jittery.
- **Inlays on curved surfaces reach deeper.** A painted area is a flat 2D
  shape pushed into the part; where the surface curves away from that plane
  the inlay must reach further, or its edges go missing. Decals on the head
  and body get extra depth (`reach`); their outer face is the part's own
  surface, so they sit flush on the curve.
- **Decals stay where they belong.** Project a decal only as deep as the
  surface curves under it (else a mouth lands on the chin too); per-pose
  decals (`faces.<pose>.look`) slide along the tangent plane.
- **Colour by priority** (`ROLES` in `src/passes.js`): base fur 1, hair 1.5,
  black markings 2, patches 3, accent colours 4, dark details 5, eyes/trim 6,
  pupils 7. Details win over what they sit on, so a tie "ring" can be a solid
  cylinder inside the bun.

### Filaments

- **Each figure its own accents, from one global palette.** The palette is
  `FILAMENTS` in `src/passes.js`: 8 filaments, white and black for the panda
  plus six accents (blue, green, yellow, red, grey, brown). A figure picks
  its accents from it (hair, beard, glasses, clothes, props). At most 4
  filaments per figure and per plate (white + black + 2 accents, the AMS
  lite's 4 slots); plates group figures whose colours fit (`PLATES` in
  `tools/print.mjs`), so plan a figure's accents so it can share a plate.
  Add a palette colour only when a character truly needs it, and prefer
  reusing one.
- **Filament changes cost print time — a trade-off, not a rule.** Every layer
  prints each colour present once plus a purge, so a colour adds changes on
  every layer it spans. Weigh it case by case; the look decides each time
  (the gadget stand went black, the Guardian's shield stayed blue).

### Base

- Round plinth, panda 40 mm on top. The underside carries only a QR code, as
  large as the flat face allows, black on white on any base colour, as one
  0.2 mm first layer (black printed first), with a slower first layer whose
  travel avoids printed areas. Curved lettering around it (2.7 mm, 0.7 mm
  strokes) came out garbled and was removed. The QR links to a short code
  (the recipe's `codes`, Cloudflare redirects), so targets change without
  reprinting.

## 4. Lessons from feedback

Rejected, and why:
- **Strand/lock tubes** (hanging hair locks, beard locks): read as
  dreadlocks, fingers or tentacles. Sculpt one mass with grooves instead
  (`hang` + `grooves`, `comb`).
- **Grey stubble** on the muzzle: looked like a dirty face. Facial hair is a
  solid, crisp piece or nothing.
- **Two-tone beard** (moustache in another colour): read as two beards.
- **Rocket in the hand**: looked like an ice cream; a rocket lifting off from
  the base read instantly.
- **Flag on a pole**: unprintable thin pole; dropped.
- **Brown glasses frames**: looked dull; accents should be saturated plate
  colours (green shades, blue frames) or dark.
- **Flat helmet hair** (thin cap with a bump): boring; hair needs thickness
  (≈0.07), a shaped hairline and sculpted grooves or tufts.
- **Derp face**: fat half-moon eye crescents plus a white D mouth gap inside a
  beard. Fixed with thin lid lines (`serene`) and a beard that closes under a
  closed mouth.
- **Beak snout**: strong snout + thick beard + moustache leaning forward made
  one dark pointed mass from the side. Fixed with the round `panda` snout, a
  beard that thickens from the mouth to a strong chin (`thickness: { top,
  jaw }`) and hangs nearly vertically, a domed moustache (`edge: 1`), and the
  nose left on white.
- **Stiff/stubby seated legs** with feet sunk into the base: "unfinished".
  Long crossed shins, soles showing, paws on knees read as a proper sit.

- **Inspiration images are input, not targets.** The ninja-panda reference
  (faceted low-poly, flying headband tails, pouches, grappling hook) was
  translated, not copied: smooth surfaces stay, tails became short slabs
  lying on the hair, the katana handle shows over the shoulder, the gi keeps
  a plain V and a knotted belt. Take the attitude and the silhouette, drop
  anything thin or mid-air.
- **Beards that belong to the head.** A beard stuck on the snout reads as a
  patch; one that follows the head's outline from the sides of the face to a
  deep chin (`ninja`: thin at the sides, thick at the chin, straight upper
  edges) gives the whole head an angular jaw and reads as part of the face.
  Face patches are polar outlines, so a shape must be star-shaped around its
  centre: put the centre low (below the mouth) and let the cheek edges run
  radially.
- **Brows as thin slashes floating on the white** read as scratches. A brow
  must be a bold wedge whose lower edge sits on the eye patch (so black meets
  black and the frown line is one shape), heavy at the inner end.
- **A glare is a composition, not a pupil.** Round wide-open whites with
  small pupils read cute/surprised whatever the brow does. The fierce look
  comes from the V of angled patches + brows pointing at the nose, a lid that
  slices the white flat, a large dark pupil, and a flat mouth with corners
  barely down — all one angular shape with the beard.
- **Closed zen eyes in an action pose** contradict the pose; the signature
  pose decides the eye style, the resting pose keeps its own.
- **Cloth over hair.** A band crossing the hairline must not follow every
  groove and peak under it: sit it on bare skin where possible and give it a
  smooth standoff (an envelope of the hair under it), or it reads lumpy.

Liked: Playmobil-style dress; hologram placeholder; textured hair + shades;
rocket on smoke; samurai topknot with red tie; comb grooves; serene eyes;
long full beard onto the chest; the overall chunky toy look.

## 5. Review checklist

Before showing a figure, answer each from the renders:
- Silhouette: front, side, back and top — is it a clean cut-out? Any shelf,
  beak, helmet, pinch or floating piece?
- Identity at desk distance: would someone who knows the person name them
  from the three traits? Is one trait dominant?
- Still a panda: white face, black patches and ears, nose visible?
- Expression: calm/kind/funny on purpose? No accidental sleepy, angry or
  grinning read (check eyes + mouth + beard together).
- Coherence with the cast: same thickness of pieces, same lip rounding, same
  accent discipline; would it stand next to Leon and Hadas N. without looking
  like a different toy line?
- Pose: posecheck ok, feet/seat on the base, paws resting on something,
  readable from the front.
- Printability: `connected_bodies: 1`, nothing under 0.85 mm, no mid-air
  parts, relief deep enough, filaments ≤ 4 on its plate, colours listed.
- Regressions: other figures pixel-identical; new options default to the old
  behaviour; checkRecipe still rejects unknown parts.
- Two-pose figures: the signature (second) pose is what prints and what the
  viewer opens on; check both poses' renders and that props and hair read in
  both.
- Report: render paths for every view, print preview, colours, files changed.
