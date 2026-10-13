// node tools/variants.mjs <figure> <variants.json> [view[:focus=joint];view...] [out.png]
// Renders a figure once per variant and lays the renders out on one labelled
// sheet (a column per variant, a row per view): the first-pass candidates of
// a new figure, or any comparison that changes more than one recipe field
// (tools/palette.mjs compares the values of a single field).
// <variants.json> is a list of { "label": "A · waves, tablet", ...recipe fields }:
// each variant is the figure's own recipe with these fields replaced (poses,
// props, eyes, mouth, hair, beard, glasses, outfit, only, hide, faces, accent;
// null removes a slot). It is shown in its signature pose (the last of `poses`).
// Nothing is checked against the 4-filament limit: count before you render.
// (run `sh build.sh` first)
// Set CHROMIUM_PATH to use a specific Chromium; otherwise Playwright's default is used.
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const [figure, file, viewList = 'angle', out = `shots/variants-${figure}.png`] = process.argv.slice(2);
if (!figure || !file) throw new Error('usage: node tools/variants.mjs <figure> <variants.json> [views] [out.png]');
const variants = JSON.parse(fs.readFileSync(file, 'utf8'));
const views = viewList.split(';');
const W = 520, H = 640;
const OPTIONAL = ['hair', 'beard', 'glasses', 'outfit', 'only', 'hide', 'faces', 'accent']; // fields a recipe may leave out

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H + 600 } }); // tall, so the dock sits below the tile
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('file://' + path.resolve('dist/site/viewer.html'));
await page.waitForFunction(() => window.pandaViewer, null, { timeout: 20000 });
await page.evaluate(() => { pandaViewer.set('spin', false); pandaViewer.still(); });
// the figure's own recipe: every variant starts from it, not from the variant before
const base = await page.evaluate((figure) => {
  pandaViewer.setVariant(figure);
  const { id, ...recipe } = pandaViewer.model().variant;
  return recipe;
}, figure);

const rows = [];
for (const viewSpec of views) {
  const [view, ...flags] = viewSpec.split(':');
  const focus = flags.find((f) => f.startsWith('focus='))?.slice(6);
  const tiles = [];
  for (const { label, ...fields } of variants) {
    const recipe = { ...base, ...fields };
    const [pose, signature = pose] = recipe.poses;
    for (const k of OPTIONAL) if (recipe[k] == null) recipe[k] = undefined;
    // a draft pose has no QR code yet: borrow one of the figure's for the render
    recipe.codes = { [signature]: Object.values(base.codes)[0], ...base.codes };
    await page.evaluate(({ figure, recipe, signature, view, focus }) => {
      pandaViewer.setVariant(figure);
      pandaViewer.override(recipe);
      pandaViewer.setPose(signature);
      pandaViewer.setView(view);
      if (focus) pandaViewer.focus(focus);
    }, { figure, recipe: { ...recipe, pose, signature }, signature, view, focus });
    await page.waitForTimeout(500);
    tiles.push((await page.screenshot({ clip: { x: 0, y: focus ? 75 : 190, width: W, height: H } })).toString('base64'));
  }
  rows.push(tiles);
}
// the sheet: a labelled column per variant
const sheet = await page.evaluate(async ({ rows, labels, W, H }) => {
  const c = document.createElement('canvas');
  c.width = W * labels.length; c.height = H * rows.length + 52;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8ebf2'; ctx.fillRect(0, 0, c.width, c.height);
  for (let r = 0; r < rows.length; r++) {
    for (let i = 0; i < labels.length; i++) {
      const img = new Image(); img.src = 'data:image/png;base64,' + rows[r][i]; await img.decode();
      ctx.drawImage(img, i * W, 52 + r * H);
    }
  }
  ctx.fillStyle = '#1a1c24'; ctx.font = '600 24px system-ui, sans-serif'; ctx.textAlign = 'center';
  labels.forEach((l, i) => ctx.fillText(l, i * W + W / 2, 36));
  return c.toDataURL('image/png').split(',')[1];
}, { rows, labels: variants.map((v) => v.label), W, H });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(sheet, 'base64'));
console.log(out);
if (errs.length) console.log(errs.join('\n'));
await browser.close();
