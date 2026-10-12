#!/usr/bin/env python3
# tools/bambu.py — Bambu Studio project files for the print export.
#
#   python3 tools/bambu.py print-out        (after `node tools/print.mjs print-out`)
#
# Reads print-out/projects.json (written by print.mjs): per project the AMS
# slots and the figures, each figure one STL per filament. Every project is
# packaged by Bambu Studio's own CLI, so the 3MF carries a complete, valid
# config: A1 mini 0.4 nozzle, 0.16 mm Optimal, Bambu PLA Basic in every slot,
# tree supports, support-cubic infill, Arachne walls (orange "modified"
# fields). Each figure becomes one object whose parts are its colour STLs,
# each part on its AMS slot.
#
# CLI facts this relies on (see the openscad-3mf skill): it resolves neither
# `inherits` nor `include`, so presets are flattened first; `--outputdir` must
# be absolute; its arranger is not trusted, so figures are placed here.
# Objects in an assemble list that share an `assemble_index` become one
# object with one part per STL, relative positions kept.
import glob
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

BS = "/Applications/BambuStudio.app/Contents/MacOS/BambuStudio"
SYSDIR = os.path.expanduser("~/Library/Application Support/BambuStudio/system/BBL")
MACHINE = "Bambu Lab A1 mini 0.4 nozzle"
PROCESS = "0.16mm Optimal @BBL A1M"
FILAMENT = "Bambu PLA Basic @BBL A1M"
# changed from the system process preset (shown as orange "modified" fields);
# tree(auto) is the preset's support type. The first layer goes slower and its
# travel avoids printed areas, so the QR code's small dots aren't knocked off.
OVERRIDES = {"enable_support": "1", "sparse_infill_pattern": "supportcubic", "wall_generator": "arachne",
             "initial_layer_speed": ["30"], "initial_layer_infill_speed": ["50"], "reduce_crossing_wall": "1"}
GAP = 12.0  # mm between figures: room for the brims of tree supports standing on the plate
MARGIN = 3.0  # mm from the bed edge
# Footprint of the prime tower as sliced (x, y in mm, brim included): it grows
# along x with the purge volume per layer; measured from the G-code of these
# projects. Its `wipe_tower_x` is the centre, `wipe_tower_y` the front edge.
TOWER = (80.0, 40.0)
# purge per filament change (mm³) by the colour switched to: white shows any
# dark residue, black hides everything
PURGE = {"white": 220, "black": 70, "accent": 150}


def system_preset(kind, name):
    """A system preset with its `inherits` chain and `include` templates resolved."""
    presets = {}
    for f in glob.glob(f"{SYSDIR}/{kind}/**/*.json", recursive=True):
        d = json.load(open(f))
        if "name" in d:
            presets[d["name"]] = d

    def flat(n):
        d = presets[n]
        merged = flat(d["inherits"]) if d.get("inherits") else {}
        for inc in d.get("include", []):
            merged |= flat(inc)
        return merged | d

    d = flat(name)
    d.pop("inherits", None)
    d.pop("include", None)
    return d


def object_bbox(root, entries, oid):
    """x/y extent of an assembled object in its own coordinates (components + mesh vertices)."""
    obj = re.search(rf'<object id="{oid}"[^>]*>\s*<components>(.*?)</components>', root, re.S).group(1)
    xs, ys = [], []
    for path, sub, tr in re.findall(r'p:path="([^"]+)" objectid="(\d+)"[^>]*transform="([^"]+)"', obj):
        v = [float(x) for x in tr.split()]
        assert v[:9] == [1, 0, 0, 0, 1, 0, 0, 0, 1], f"rotated part in object {oid}"
        mesh = re.search(rf'<object id="{sub}"[^>]*>(.*?)</object>', entries[path.lstrip("/")].decode(), re.S).group(1)
        for x, y in re.findall(r'<vertex x="([-0-9.e]+)" y="([-0-9.e]+)"', mesh):
            xs.append(float(x) + v[9])
            ys.append(float(y) + v[10])
    return min(xs), max(xs), min(ys), max(ys)


def build(project, out_dir, machine, process, filament, bed):
    slots = project["slots"]
    tmp = tempfile.mkdtemp()
    assemble = {"plates": [{"plate_name": project["title"], "need_arrange": False, "objects": [
        {"path": os.path.abspath(os.path.join(out_dir, part["stl"])), "count": 1,
         "filaments": [slots.index(part["filament"]) + 1], "assemble_index": [k],
         "pos_x": [0.0], "pos_y": [0.0], "pos_z": [0.0]}
        for k, fig in enumerate(project["figures"], 1) for part in fig["parts"]]}]}
    for name, data in [("machine", machine), ("process", process), ("assemble", assemble)]:
        json.dump(data, open(f"{tmp}/{name}.json", "w"))
    for i in range(len(slots)):
        json.dump(filament, open(f"{tmp}/filament{i}.json", "w"))
    r = subprocess.run(
        [BS, "--load-assemble-list", f"{tmp}/assemble.json",
         "--load-settings", f"{tmp}/machine.json;{tmp}/process.json",
         "--load-filaments", ";".join(f"{tmp}/filament{i}.json" for i in range(len(slots))),
         "--arrange", "0", "--orient", "0", "--ensure-on-bed",
         "--export-3mf", "project.3mf", "--outputdir", tmp],
        capture_output=True, text=True, cwd=tmp)  # it also writes result.json into the working directory
    assert os.path.exists(f"{tmp}/project.3mf"), f"CLI export failed:\n{r.stdout[-2000:]}{r.stderr[-2000:]}"
    with zipfile.ZipFile(f"{tmp}/project.3mf") as z:
        entries = {n: z.read(n) for n in z.namelist()}
    root = entries["3D/3dmodel.model"].decode()
    ms = entries["Metadata/model_settings.config"].decode()

    # objects are identified by their parts' source STLs (the CLI names them assemble_N)
    oid = {}
    for m in re.finditer(r'<object id="(\d+)">(.*?)</object>', ms, re.S):
        sources = set(re.findall(r'key="source_file" value="([^"]+)"', m.group(2)))
        (fig,) = [f for f in project["figures"] if sources == {p["stl"] for p in f["parts"]}]
        oid[fig["name"]] = m.group(1)
    assert len(oid) == len(project["figures"]), f"objects mismatch: {oid}"

    # figures in a square grid centred on the bed, row by row from the back
    # left; the prime tower takes the last two cells of the front row
    boxes = {n: object_bbox(root, entries, o) for n, o in oid.items()}
    cell = [max(max(b[1] - b[0] for b in boxes.values()), TOWER[0] / 2) + GAP,
            max(max(b[3] - b[2] for b in boxes.values()), TOWER[1]) + GAP]
    cols = max(2, math.ceil(math.sqrt(len(boxes) + 2)))
    rows = math.ceil((len(boxes) + 2) / cols)
    left, bottom = bed[0] / 2 - cols * cell[0] / 2, bed[1] / 2 - rows * cell[1] / 2
    assert left >= MARGIN and bottom >= MARGIN, f"{project['file']}: {len(boxes)} figures do not fit the bed"
    centre = lambda k: (left + (k % cols + 0.5) * cell[0], bottom + (rows - 1 - k // cols + 0.5) * cell[1])
    pos = {}
    for k, fig in enumerate(project["figures"]):
        x0, x1, y0, y1 = boxes[fig["name"]]
        cx, cy = centre(k)
        pos[oid[fig["name"]]] = (cx - (x0 + x1) / 2, cy - (y0 + y1) / 2)
    tower_at = (left + (cols - 1) * cell[0], bottom + (cell[1] - TOWER[1]) / 2)  # centre x, front y

    def place(m):
        v = m.group(2).split()
        v[9], v[10] = f"{pos[m.group(1)][0]:.6f}", f"{pos[m.group(1)][1]:.6f}"
        return m.group(0).replace(m.group(2), " ".join(v))

    entries["3D/3dmodel.model"] = re.sub(r'<item objectid="(\d+)"[^>]*transform="([^"]+)"', place, root).encode()

    # readable names: object = figure, part = filament
    for fig in project["figures"]:
        o = oid[fig["name"]]
        ms = re.sub(rf'(<object id="{o}">\s*<metadata key="name" value=")[^"]+"', rf'\g<1>{fig["name"]}"', ms)
        for part in fig["parts"]:
            stem = os.path.splitext(part["stl"])[0]
            ms = ms.replace(f'value="{stem}_1"', f'value="{fig["name"]} - {part["filament"]}"')
    # first layer: black first, then white fills in between it (QR code), then the rest
    first = [slots.index("black") + 1, slots.index("white") + 1] + [i + 1 for i, f in enumerate(slots) if f not in ("black", "white")]
    ms = ms.replace('<metadata key="locked" value="false"/>',
                    '<metadata key="locked" value="false"/>\n    <metadata key="first_layer_sequence_choice" value="customize"/>\n'
                    f'    <metadata key="first_layer_print_sequence" value="{" ".join(map(str, first))}"/>', 1)
    entries["Metadata/model_settings.config"] = ms.encode()
    # the CLI's thumbnails are blank; the GUI renders new ones on the first slice
    entries = {n: d for n, d in entries.items() if not re.match(r"Metadata/(plate|plate_no_light|top|pick)_\d+", n)}

    cfg = json.loads(entries["Metadata/project_settings.config"])
    # support filament stays the slicer's default: forcing black left dark marks
    # where supports touch the white head, chin and belly
    cfg["different_settings_to_system"] = [";".join(sorted(OVERRIDES)), "", ""] + [""] * (len(slots) - 1)
    cfg["filament_colour"] = [project["colours"][s] for s in slots]
    # purge volumes, one row per filament (the CLI keeps the machine's 4×4 default
    # of 280 mm³ everywhere): row = old filament, column = new one
    n = len(slots)
    cfg["flush_volumes_matrix"] = [f"{0 if i == j else PURGE.get(slots[j], PURGE['accent']):g}"
                                   for i in range(n) for j in range(n)]
    cfg["flush_volumes_vector"] = cfg["flush_volumes_vector"][:2 * n]
    # the CLI's prime tower position suits a 256 mm bed
    cfg["wipe_tower_x"], cfg["wipe_tower_y"] = [f"{tower_at[0]:.1f}"], [f"{tower_at[1]:.1f}"]
    entries["Metadata/project_settings.config"] = json.dumps(cfg, indent=4).encode()

    out = os.path.abspath(os.path.join(out_dir, project["file"]))
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in entries.items():
            z.writestr(name, data)
    shutil.rmtree(tmp)
    return out


def slice_check(path):
    """Slice a copy headless (the project must slice as it is); returns time, filament and changes."""
    tmp = tempfile.mkdtemp()
    shutil.copy(path, f"{tmp}/copy.3mf")
    subprocess.run([BS, f"{tmp}/copy.3mf", "--arrange", "0", "--slice", "0", "--outputdir", tmp],
                   capture_output=True, text=True, cwd=tmp)
    r = json.load(open(f"{tmp}/result.json"))
    assert r["return_code"] == 0, f"{path}: slicing failed: {r['error_string']}"
    gcode = open(f"{tmp}/plate_1.gcode").read()
    shutil.rmtree(tmp)
    time = re.search(r"; total estimated time: (.+)", gcode).group(1)
    grams = sum(float(g) for g in re.search(r"; total filament weight \[g\] : (.+)", gcode).group(1).split(","))
    changes = gcode.count("\nM620 S") - 1  # the first one loads the starting filament
    return f"{time}, {grams:.0f} g filament, {changes} filament changes"


out_dir = sys.argv[1]
machine = system_preset("machine", MACHINE)
bed = [max(float(p.split("x")[axis]) for p in machine["printable_area"]) for axis in (0, 1)]
process = system_preset("process", PROCESS) | OVERRIDES | {
    "type": "process", "from": "User", "inherits": PROCESS, "name": PROCESS,
    "print_settings_id": PROCESS, "compatible_printers": [MACHINE]}
filament = system_preset("filament", FILAMENT)
for project in json.load(open(os.path.join(out_dir, "projects.json"))):
    path = build(project, out_dir, machine, process, filament, bed)
    print(f"{project['file']}: {', '.join(f['name'] for f in project['figures'])}; "
          f"slots {', '.join(project['slots'])}; {slice_check(path)}")
