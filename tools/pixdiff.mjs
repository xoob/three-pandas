// node tools/pixdiff.mjs <dir-a> <dir-b> [x,y,w,h]
// Compares every PNG in dir-a with the file of the same name in dir-b and
// prints how many pixels differ (only inside the rectangle, if given). Exits 1 if any image differs or is missing.
// Used to prove a refactor leaves the rendered figures unchanged.
// Set CHROMIUM_PATH to use a specific Chromium; otherwise Playwright's default is used.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const [a, b, rect] = process.argv.slice(2);
const crop = rect ? rect.split(',').map(Number) : null;
if (!a || !b) throw new Error('usage: node tools/pixdiff.mjs <dir-a> <dir-b>');
const names = fs.readdirSync(a).filter((f) => f.endsWith('.png')).sort();
if (!names.length) throw new Error(`no PNGs in ${a}`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const dataUrl = (file) => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');
let failed = 0;
for (const name of names) {
  const other = path.join(b, name);
  if (!fs.existsSync(other)) { console.log(`MISSING ${name}`); failed++; continue; }
  const diff = await page.evaluate(async ([ua, ub, crop]) => {
    const load = async (u) => { const img = new Image(); img.src = u; await img.decode(); return img; };
    const [ia, ib] = await Promise.all([load(ua), load(ub)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return -1;
    const [x, y, w, h] = crop ?? [0, 0, ia.width, ia.height];
    const px = (img) => {
      const c = new OffscreenCanvas(img.width, img.height);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(x, y, w, h).data;
    };
    const da = px(ia), db = px(ib);
    let n = 0;
    for (let i = 0; i < da.length; i += 4) {
      if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) n++;
    }
    return n;
  }, [dataUrl(path.join(a, name)), dataUrl(other), crop]);
  if (diff !== 0) failed++;
  console.log(`${diff === 0 ? 'same' : 'DIFF'} ${name}${diff ? `  ${diff < 0 ? 'size differs' : diff + ' px'}` : ''}`);
}
await browser.close();
console.log(failed ? `${failed} of ${names.length} differ` : `all ${names.length} identical`);
process.exit(failed ? 1 : 0);
