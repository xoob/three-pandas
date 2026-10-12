// Publishes the printed figures' Bambu Studio projects as the GitHub release
// of the current edition, edition-<EDITION> (the number in their QR links),
// for the stage's "Print in Bambu Studio" (RELEASE in src/stage.js):
//   npm run release
// uploads print-out/<id>-<pose>-<base>.3mf per figure in src/cast.json as
// <Name>.3mf and the gang's plates (print-out/gang_a.3mf, …; each figure in
// its own accent, two accents per plate) as Gang A.3mf, …, replacing files of
// the same name. A deliberate step: run `npm run print` and check the projects
// first. The release must exist (gh release create edition-<EDITION>).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const tag = `edition-${fs.readFileSync('EDITION', 'utf8').trim()}`;
const cast = JSON.parse(fs.readFileSync('src/cast.json', 'utf8'));
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const plates = fs.readdirSync('print-out').filter((f) => /^gang_[a-z]\.3mf$/.test(f));
if (!plates.length) throw new Error('no gang plates in print-out/; run npm run print first');
const files = [
  ...cast.map((c) => [`${c.id}-${c.pose}-${c.base}.3mf`, `${cap(c.id)}.3mf`]),
  ...plates.map((f) => [f, `Gang ${f[5].toUpperCase()}.3mf`]),
];
// gh names each upload after its file, so copy them to their published names first
fs.mkdirSync('print-out/release', { recursive: true });
const named = files.map(([from, to]) => {
  fs.copyFileSync(`print-out/${from}`, `print-out/release/${to}`);
  return `print-out/release/${to}`;
});
execFileSync('gh', ['release', 'upload', tag, ...named, '--clobber', '-R', 'xoob/three-panda'], { stdio: 'inherit' });
console.log(`${tag}: ${files.map(([, to]) => to).join(', ')}`);
