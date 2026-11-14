#!/usr/bin/env python3
"""
Adds the typography to the Blender render of the layered-data scene: a title, a label for every layer with a leader
line to that layer, and a footer. Text is done here (not in Blender) so it stays crisp and uses a real font.

    python tools/blender/compose_labels.py [--preview]
Reads  tools/blender/build/layered_render[_preview].png + layered_anchors.json + web/public/data/gale/meta.json
Writes docs/graphics/layered-data.png (full size) and web/public/graphics/layered-data.jpg (1920 px wide)
"""
import json
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BUILD = os.path.join(ROOT, "tools", "blender", "build")
PREVIEW = "--preview" in sys.argv
src = os.path.join(BUILD, "layered_render_preview.png" if PREVIEW else "layered_render.png")
anchors = json.load(open(os.path.join(BUILD, "layered_anchors.json")))
meta = json.load(open(os.path.join(ROOT, "web", "public", "data", "gale", "meta.json")))

render = Image.open(src).convert("RGB")
W, H = render.size
k = W / anchors["resolution"][0]  # anchors were recorded at the render resolution


def font(name, size):
    for base in (r"C:\Windows\Fonts", "/usr/share/fonts/truetype/dejavu"):
        p = os.path.join(base, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, int(size * H / 1080))
    return ImageFont.load_default()


F_TITLE = font("segoeuib.ttf", 46)
F_SUB = font("segoeui.ttf", 21)
F_NAME = font("segoeuib.ttf", 24)
F_DESC = font("segoeui.ttf", 20)
F_SRC = font("segoeui.ttf", 16)
F_FOOT = font("segoeui.ttf", 15)
S = H / 1080


def wrap(text, fnt, max_w):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if fnt.getlength(t) <= max_w:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines

# a faint glow behind the stack so it doesn't float in pure black
glow = Image.new("RGB", (W, H), (0, 0, 0))
gd = ImageDraw.Draw(glow)
cx, cy = int(W * 0.40), int(H * 0.52)
gd.ellipse([cx - 520 * S, cy - 470 * S, cx + 520 * S, cy + 470 * S], fill=(16, 18, 40))
glow = glow.filter(ImageFilter.GaussianBlur(130 * S))
img = ImageChops.screen(render, glow)
d = ImageDraw.Draw(img, "RGBA")

# what to say about each layer: the numbers come from the baked data's own source list
srcs = {s["layer"]: s for s in meta["sources"]}
layers = [
    ("plan", "MISSION PLAN", "Our routes, science stops and Curiosity's real drive path", "Our planner  ·  NASA/JPL MSL waypoint feed", (167, 139, 250)),
    ("optical", "OPTICAL", "What the ground looks like", "MRO HiRISE colour, 25 cm per pixel at source (Viking fills the gaps)", (251, 191, 120)),
    ("thermal", "THERMAL", "Night-time infrared: firm rock stays warm, loose dust cools fast", "Mars Odyssey THEMIS, 100 m per pixel", (251, 146, 60)),
    ("hazard", "HAZARD", "Steepest slope inside every 25 m cell, up to the 15° walking limit", "Derived from the MSL Gale DEM", (52, 211, 153)),
    ("relief", "TOPOGRAPHY", "The ground itself, shown 2× taller", "MSL Gale merged DEM, 1 m source (HiRISE, CTX, HRSC, MOLA)", (232, 208, 182)),
]
if "elev" in srcs:
    layers[4] = (layers[4][0], layers[4][1], layers[4][2], f"{srcs['elev']['dataset'].split(' (')[0]}, {srcs['elev']['resolution']} source", layers[4][4])

col_x = int(W * 0.60)
for name, title, desc, source, accent in layers:
    a = anchors["layers"][name]["right"]
    ax, ay = a[0] * k, a[1] * k
    d.line([(ax + 8 * S, ay), (col_x - 18 * S, ay)], fill=accent + (200,), width=max(1, int(2 * S)))
    d.ellipse([ax - 5 * S, ay - 5 * S, ax + 5 * S, ay + 5 * S], fill=accent + (255,))
    d.rectangle([col_x - 18 * S, ay - 30 * S, col_x - 14 * S, ay + 32 * S], fill=accent + (255,))
    d.text((col_x, ay - 33 * S), title, font=F_NAME, fill=accent + (255,))
    d.text((col_x, ay - 4 * S), desc, font=F_DESC, fill=(236, 238, 245, 255))
    d.text((col_x, ay + 24 * S), source, font=F_SRC, fill=(138, 146, 166, 255))

# the same place across layers
for key, label, col in (("base", "Bradbury Landing", (251, 146, 60)), ("pahrump", "Pahrump Hills", (167, 139, 250))):
    pts = anchors["marks"][key]
    px, py = pts[0][0] * k, pts[0][1] * k
    if key == "base":
        d.text((px - 150 * S, py + 8 * S), label, font=F_SRC, fill=col + (255,))
    else:
        d.text((px + 14 * S, py + 8 * S), label, font=F_SRC, fill=col + (255,))

# title block, top left (the free side of the picture), wrapped to fit
tx, ty, tw = int(W * 0.035), int(110 * S), int(W * 0.255)
d.text((tx, ty), "Five NASA layers.", font=F_TITLE, fill=(255, 255, 255, 255))
d.text((tx, ty + 58 * S), "One plan.", font=F_TITLE, fill=(245, 200, 75, 255))
y = ty + 140 * S
for para in (
    "Gale Crater, Mars: the same 11.8 × 14.8 km patch, seen by five different instruments and registered to one map.",
    "The planner reads all of them, plus live NASA space weather and the radiation Curiosity measured on this ground.",
):
    for line in wrap(para, F_SUB, tw):
        d.text((tx, y), line, font=F_SUB, fill=(190, 196, 212, 255))
        y += 30 * S
    y += 14 * S

d.text((int(48 * S), int(H - 40 * S)), "Rendered in Blender from the real data. Data: NASA / JPL / USGS / ESA. Project: EVA Mission Planner, NASA Space Apps 2026.", font=F_FOOT, fill=(110, 118, 140, 255))

out_full = os.path.join(ROOT, "docs", "graphics", "layered-data-preview.png" if PREVIEW else "layered-data.png")
os.makedirs(os.path.dirname(out_full), exist_ok=True)
img.save(out_full, optimize=True)
if not PREVIEW:
    web = os.path.join(ROOT, "web", "public", "graphics")
    os.makedirs(web, exist_ok=True)
    img.resize((1920, int(1920 * H / W)), Image.LANCZOS).save(os.path.join(web, "layered-data.jpg"), quality=90, optimize=True)
print("wrote", out_full)
