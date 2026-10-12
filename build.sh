#!/bin/sh
set -e
cd "$(dirname "$0")"
mkdir -p dist
# figure recipes: every figures/<id>.json → dist/figures.json, in viewer order:
# by label, holograms (placeholders) last
python3 - <<'PY'
import json, os
recipes = [json.load(open(f'figures/{f}')) for f in os.listdir('figures') if f.endswith('.json')]
recipes.sort(key=lambda r: (r.get('hologram', False), r['label']))
json.dump(recipes, open('dist/figures.json', 'w'))
# the stage's "Open in Claude" prompt: the code block under "Make your own
# panda" in README.md, the one copy of it
import re
prompt = re.search(r'^## Make your own panda\n.*?^```text\n(.*?)\n```', open('README.md').read(), re.S | re.M).group(1)
json.dump(prompt, open('dist/claude-prompt.json', 'w'))
PY
# edition whose number goes into the QR links (EDITION, changed by hand)
EDITION=$(tr -d '[:space:]' < EDITION)
# the stage (index.html) and the model viewer (viewer.html), each one self-contained page
npx esbuild src/stage.js --bundle --minify --format=iife --target=es2020 --legal-comments=none --define:__EDITION__="$EDITION" --outfile=dist/stage.js --log-level=warning
npx esbuild src/main.js --bundle --minify --format=iife --target=es2020 --legal-comments=none --define:__EDITION__="$EDITION" --outfile=dist/viewer.js --log-level=warning
mkdir -p dist/site/icons
cp src/icons/* dist/site/icons/
cp src/_headers dist/site/_headers
python3 - <<'PY'
for script, shell, out in [('dist/stage.js', 'src/stage.html', 'index.html'), ('dist/viewer.js', 'src/shell.html', 'viewer.html')]:
    js = open(script).read().replace('</script', '<\\/script')
    body = open(shell).read().replace('<!--APP-->', '<script>\n' + js + '\n</script>')
    page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><meta name="robots" content="noindex, nofollow"><style>body{margin:0}</style></head><body>' + body + '</body></html>'
    open('dist/site/' + out, 'w').write(page)
    print(out, 'bytes', len(page))
# short links printed in the QR codes under the bases: each recipe's `codes`
# (pose → code), to the stage on that figure and pose; /CODE (the first test
# print, without a number) and /CODE/<edition>
import json
links = [(code, f'/#{r["id"]}/{pose}') for r in json.load(open('dist/figures.json')) for pose, code in r.get('codes', {}).items()]
open('dist/site/_redirects', 'w').write(''.join(f"/{c} {to} 302\n/{c}/* {to} 302\n" for c, to in links))
PY
# print export pages (used by tools/print.mjs)
npx esbuild src/print.js --bundle --format=iife --define:__EDITION__="$EDITION" --outfile=dist/print.js --log-level=warning
npx esbuild src/preview.js --bundle --format=iife --outfile=dist/preview.js --log-level=warning
printf '<!doctype html><meta charset="utf-8"><body style="margin:0"><script src="print.js"></script>' > dist/print.html
printf '<!doctype html><meta charset="utf-8"><body style="margin:0"><script src="preview.js"></script>' > dist/preview.html
