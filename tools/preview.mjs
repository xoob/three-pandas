// node tools/preview.mjs <out-dir> [id ...]
// One preview sheet per figure, <out-dir>/<id>.png: its signature pose from
// the angled, front and side views plus a head close-up, side by side and
// labelled. Without ids, every figure. Used by the pull-request preview
// workflow (.github/workflows/preview.yml). (run `sh build.sh` first)
// Set CHROMIUM_PATH to use a specific Chromium; otherwise Playwright's default is used.
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';

const [out, ...wanted] = process.argv.slice(2);
if (!out) throw new Error('usage: node tools/preview.mjs <out-dir> [id ...]');
const VIEWS = [['angle'], ['front'], ['side'], ['front', 'head']]; // [view, focus joint]
const W = 440, H = 410; // each tile: the figure's area of a 700×760 viewer
const CLIP = { x: 130, y: 72, width: W, height: H };

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 700, height: 760 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('file://' + path.resolve('dist/site/viewer.html'));
await page.waitForFunction(() => window.pandaViewer, null, { timeout: 20000 });
await page.evaluate(() => { pandaViewer.set('spin', false); pandaViewer.still(); });
// hide the viewer's UI but keep its layout, so the figure is framed as in the viewer
await page.addStyleTag({ content: '.hud, .dock { visibility: hidden; }' });
const recipes = JSON.parse(fs.readFileSync('dist/figures.json', 'utf8'));
const known = recipes.map((r) => r.id);
for (const id of wanted) if (!known.includes(id)) throw new Error(`no figure "${id}" (have ${known.join(', ')})`);
fs.mkdirSync(out, { recursive: true });

for (const id of wanted.length ? wanted : known) {
  const r = recipes.find((x) => x.id === id);
  const tiles = [];
  for (const [view, focus] of VIEWS) {
    await page.evaluate(({ id, view, focus }) => {
      pandaViewer.setVariant(id); // opens on the figure's signature pose
      pandaViewer.setView(view);
      if (focus) pandaViewer.focus(focus);
    }, { id, view, focus });
    await page.waitForTimeout(400);
    tiles.push((await page.screenshot({ clip: CLIP })).toString('base64'));
  }
  const labels = VIEWS.map(([view, focus]) => (focus ? `${view} · ${focus}` : view));
  const title = `${r.label} — ${r.poses[1] ?? r.poses[0]}`;
  const sheet = await page.evaluate(async ({ tiles, labels, title, W, H }) => {
    const c = document.createElement('canvas');
    c.width = W * tiles.length; c.height = H + 90;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#e8ebf2'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#1a1c24'; ctx.font = '700 30px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(title, 20, 38);
    ctx.font = '600 22px system-ui, sans-serif'; ctx.textAlign = 'center';
    for (let i = 0; i < tiles.length; i++) {
      const img = new Image(); img.src = 'data:image/png;base64,' + tiles[i]; await img.decode();
      ctx.drawImage(img, i * W, 50);
      ctx.fillText(labels[i], i * W + W / 2, H + 80);
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { tiles, labels, title, W, H });
  const file = path.join(out, `${id}.png`);
  fs.writeFileSync(file, Buffer.from(sheet, 'base64'));
  console.log(file);
}
await browser.close();
if (errs.length) throw new Error('page errors:\n' + errs.join('\n'));
