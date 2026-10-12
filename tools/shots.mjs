// node tools/shots.mjs "analyst/5:puzzled:angle,listener/3:notes:front,..." [w] [h] [light|dark] [out-prefix]
// spec = [variant/]pass:pose:view[:wire][:bones][:focus=<joint>]   (focus = close-up around a joint, e.g. focus=pawR)   (run `sh build.sh` first)
// Set CHROMIUM_PATH to use a specific Chromium; otherwise Playwright's default is used.
import { chromium } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
const specs = (process.argv[2] || '5:puzzled:angle').split(',');
const w = +(process.argv[3] || 700), h = +(process.argv[4] || 760);
const scheme = process.argv[5] || 'light';
const prefix = process.argv[6] || 'shots/s';
fs.mkdirSync(path.dirname(prefix), { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
const errs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
await page.goto('file://' + path.resolve('dist/site/viewer.html'));
await page.waitForFunction(() => window.pandaViewer, null, { timeout: 20000 });
await page.evaluate(() => { pandaViewer.set('spin', false); pandaViewer.still(); });
await page.waitForTimeout(800);
const out = [];
for (const spec of specs) {
  const [head, pose, view, ...flags] = spec.split(':');
  const [variant, pass] = head.includes('/') ? head.split('/') : ['analyst', head];
  await page.evaluate(({ variant, pass, pose, view, flags }) => {
    pandaViewer.setVariant(variant);
    pandaViewer.setPass(+pass);
    pandaViewer.setPose(pose);
    pandaViewer.set('wire', flags.includes('wire'));
    pandaViewer.set('bones', flags.includes('bones'));
    pandaViewer.setView(view);
    const focus = flags.find((f) => f.startsWith('focus='));
    if (focus) pandaViewer.focus(focus.slice(6));
  }, { variant, pass, pose, view, flags });
  await page.waitForTimeout(450);
  const file = `${prefix}-${spec.replace(/[:=./]/g, '_')}.png`;
  await page.screenshot({ path: file });
  out.push(file);
}
console.log(out.join('\n'));
console.log(errs.length ? errs.join('\n') : 'no console errors');
await browser.close();
