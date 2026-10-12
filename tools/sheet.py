#!/usr/bin/env python3
# python3 tools/sheet.py out.png cols scale img1 img2 ...
import sys
from PIL import Image
out, cols, scale, *files = sys.argv[1:]
cols, scale = int(cols), float(scale)
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
tw, th = int(w * scale), int(h * scale)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (tw * cols, th * rows), 'white')
for i, im in enumerate(ims):
    sheet.paste(im.resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
sheet.save(out)
print(out, sheet.size)
