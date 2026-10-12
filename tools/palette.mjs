// node tools/palette.mjs <figure> <field> <value;value;...> [view[:focus=joint]] [out.png]
// Renders a figure once per value of one recipe field (e.g. eyes, mouth,
// snout) and lays the renders out side by side on one labelled sheet, for
// picking a part. Values are separated by ';': JSON objects for slots
// ('{"style":"crop","colour":"grey"}'), plain strings otherwise. (run `sh build.sh` first)
// Set CHROMIUM_PATH to use a specific Chromium; otherwise Playwright's default is used.
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const [figure, field, list, viewSpec = 'front:focus=head', out = `shots/palette-${figure}-${field}.png`] = process.argv.slice(2);
if (!figure || !field || !list) throw new Error('usage: node tools/palette.mjs <figure> <field> <values> [view[:focus=joint]] [out.png]');
const values = list.split(';').map((v) => (v.startsWith('{') ? JSON.parse(v) : v));
const [view, ...flags] = viewSpec.split(':');
const focus = flags.find((f) => f.startsWith('focus='))?.slice(6);
const W = 420, H = 460;

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
const tiles = [];
for (const value of values) {
  await page.evaluate(({ figure, field, value, view, focus }) => {
    pandaViewer.setVariant(figure);
    pandaViewer.override({ [field]: value });
    pandaViewer.setView(view);
    if (focus) pandaViewer.focus(focus);
  }, { figure, field, value, view, focus });
  await page.waitForTimeout(400);
  tiles.push((await page.screenshot({ clip: { x: 0, y: 70, width: W, height: H } })).toString('base64'));
}
// the sheet: tiles in a row, each labelled with its value
const sheet = await page.evaluate(async ({ tiles, labels, W, H }) => {
  const c = document.createElement('canvas');
  c.width = W * tiles.length; c.height = H + 44;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8ebf2'; ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < tiles.length; i++) {
    const img = new Image(); img.src = 'data:image/png;base64,' + tiles[i]; await img.decode();
    ctx.drawImage(img, i * W, 0);
    ctx.fillStyle = '#1a1c24'; ctx.font = '600 26px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(labels[i], i * W + W / 2, H + 32);
  }
  return c.toDataURL('image/png').split(',')[1];
}, { tiles, labels: values.map((v) => (typeof v === 'string' ? v : v.style ?? JSON.stringify(v))), W, H });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(sheet, 'base64'));
console.log(out);
if (errs.length) console.log(errs.join('\n'));
await browser.close();
