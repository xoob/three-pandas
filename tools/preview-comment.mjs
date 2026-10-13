// node tools/preview-comment.mjs <image-url-base> <sha> <branch> [id ...]
// Prints the pull-request comment of the preview workflow
// (.github/workflows/preview.yml): a link to the branch's live stage, then per
// figure its preview sheet (<base>/<id>.png, from tools/preview.mjs) and, for
// printed figures, the print report of its signature pose and preview
// (<base>/print-<id>.png, from print-out/report.json).
// <base> is a GitHub blob URL; `?raw=true` makes it render as an image.
// The live stage is the branch's Workers Builds preview (npx wrangler preview,
// named after the branch: figure/leon → figure-leon-three-pandas.xoob.workers.dev).
// The first line is a marker the workflow uses to find and update its comment.
import fs from 'node:fs';

const [base, sha, branch, ...ids] = process.argv.slice(2);
if (!base || !sha || !branch || !ids.length) throw new Error('usage: node tools/preview-comment.mjs <image-url-base> <sha> <branch> <id ...>');
const stage = `https://${branch.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-three-pandas.xoob.workers.dev`;
const recipes = JSON.parse(fs.readFileSync('dist/figures.json', 'utf8'));
const printed = ids.some((id) => !recipes.find((x) => x.id === id)?.hologram);
const reports = printed ? JSON.parse(fs.readFileSync('print-out/report.json', 'utf8')) : [];

const lines = ['<!-- figure-preview -->', `### Figure preview · ${sha.slice(0, 7)}`, '',
  `Live stage: ${stage} (Cloudflare preview of this branch, ready a few minutes after the push)`, ''];
for (const id of ids) {
  const r = recipes.find((x) => x.id === id);
  if (!r) throw new Error(`no figure "${id}"`);
  const signature = r.poses[1] ?? r.poses[0];
  lines.push(`#### ${r.label}`, '', `[On the stage](${stage}/#${id}/${signature})`, '', `![${r.label}](${base}/${id}.png?raw=true)`, '');
  if (r.hologram) { lines.push('_Hologram: not printed._', ''); continue; }
  const p = reports.find((x) => x.id === id && x.pose === signature);
  if (!p) throw new Error(`no print report for "${id}" in pose "${signature}"`);
  const ok = p.connected_bodies === 1 ? 'one connected body' : `**${p.connected_bodies} separate bodies — not printable**`;
  lines.push(`Print, ${p.figure}: ${p.size_mm.join(' × ')} mm · ${p.slots.join(', ')} · ${ok}`, '',
    `<img src="${base}/print-${id}.png?raw=true" width="260" alt="${r.label} print preview">`, '');
}
console.log(lines.join('\n'));
