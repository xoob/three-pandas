// node tools/check.mjs — checks every figure recipe in figures/ against the
// part library (src/recipes.js), that each file is named after its id and
// that no two figures share a QR code.
// Also proves the checker rejects a broken recipe.
import fs from 'node:fs';
import { checkRecipe } from '../src/recipes.js';

const files = fs.readdirSync('figures').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
const codes = new Map(); // QR short code → where it is used: each code links to one figure pose
for (const id of files) {
  const r = JSON.parse(fs.readFileSync(`figures/${id}.json`, 'utf8'));
  if (r.id !== id) throw new Error(`figures/${id}.json has id "${r.id}"`);
  checkRecipe(r);
  for (const [pose, code] of Object.entries(r.codes)) {
    if (codes.has(code)) throw new Error(`QR code ${code} of ${id} ${pose} is already used by ${codes.get(code)}`);
    codes.set(code, `${id} ${pose}`);
  }
  console.log(`ok    ${id}`);
}

const broken = { ...JSON.parse(fs.readFileSync(`figures/${files[0]}.json`, 'utf8')), hair: { style: 'mohawk', colour: 'grey' } };
let rejected = false;
try { checkRecipe(broken); } catch (e) { rejected = e.message.includes('unknown style "mohawk"'); }
if (!rejected) throw new Error('checkRecipe accepted a recipe with an unknown hair style');
console.log('ok    broken recipe rejected');
