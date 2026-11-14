#!/usr/bin/env python3
"""
Builds the five layer textures for the Blender "layered data" graphic from the baked Gale data.

    node tools/blender/export_routes.mjs        # first: routes.json
    python tools/blender/prep_layers.py         # then: textures in tools/blender/build/

Layers (top of the stack to the bottom):
  plan.png     the mission plan: our planned routes, science sites, base, and Curiosity's real drive path
  optical.jpg  MRO HiRISE colour (Viking fills the gaps)
  thermal.jpg  Mars Odyssey THEMIS night infrared
  hazard.png   slope from the MSL 1 m DEM, colour-coded (steepest slope inside each 25 m cell)
  relief.png   elevation tint, draped on the 3D terrain in Blender
All are 1634 x 2048 (the HiRISE image size), north up, same registration as the app's map.
"""
import json
import os

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GALE = os.path.join(ROOT, "web", "public", "data", "gale")
OUT = os.path.join(ROOT, "tools", "blender", "build")
CACHE = os.path.join(ROOT, "data-cache", "gale_dem_msl_946x1186.npy")
W, H = 1634, 2048
os.makedirs(OUT, exist_ok=True)

meta = json.load(open(os.path.join(GALE, "meta.json")))
routes = json.load(open(os.path.join(OUT, "routes.json")))
size_m = routes["sizeM"]


def ramp(values, stops):
    """Piecewise-linear colour ramp: values (any shape) -> uint8 RGB. stops = [(value, (r, g, b)), ...]."""
    xs = np.array([s[0] for s in stops], dtype=np.float32)
    out = np.zeros(values.shape + (3,), dtype=np.float32)
    for c in range(3):
        out[..., c] = np.interp(values, xs, [s[1][c] for s in stops])
    return out.clip(0, 255).astype(np.uint8)


def resize_f32(a, size, resample=Image.BICUBIC):
    return np.asarray(Image.fromarray(a.astype(np.float32), mode="F").resize(size, resample), dtype=np.float32)


# 1. optical and 2. thermal: the real images, same size
Image.open(os.path.join(GALE, "visible.jpg")).convert("RGB").resize((W, H), Image.LANCZOS).save(os.path.join(OUT, "optical.jpg"), quality=93)
Image.open(os.path.join(GALE, "thermal.jpg")).convert("RGB").resize((W, H), Image.BICUBIC).save(os.path.join(OUT, "thermal.jpg"), quality=93)

# 3. hazard: slope in degrees, colour-coded (dark teal = flat, yellow = steep, red = beyond the walking limit)
slope = np.asarray(Image.open(os.path.join(GALE, "slope.png")), dtype=np.float32) / float(meta.get("slopeScale", 4))
slope = resize_f32(slope, (W, H))
hazard = ramp(
    slope,
    [(0, (9, 40, 48)), (4, (20, 98, 96)), (8, (60, 160, 110)), (12, (222, 200, 70)), (16, (240, 130, 44)), (22, (222, 48, 44)), (40, (110, 12, 40))],
)
Image.fromarray(hazard).save(os.path.join(OUT, "hazard.png"))

# 4. relief: elevation tint from the 12.5 m DEM
dem = np.load(CACHE)[0].astype(np.float32)
dem = resize_f32(dem, (W, H))
t = (dem - dem.min()) / (dem.max() - dem.min())
relief = ramp(t, [(0.0, (20, 13, 26)), (0.22, (66, 38, 44)), (0.5, (136, 82, 52)), (0.78, (196, 142, 94)), (1.0, (232, 208, 182))])
Image.fromarray(relief).save(os.path.join(OUT, "relief.png"))

# 5. plan: a dark glass plate with a 1 km grid, the routes with a glow, the sites, the base, Curiosity's path
S = 2  # supersample
PW, PH = W * S, H * S


def px(xz):
    return (xz[0] / size_m[0] * PW, xz[1] / size_m[1] * PH)


plate = Image.new("RGBA", (PW, PH), (10, 13, 24, 255))
d = ImageDraw.Draw(plate)
km = 1000.0
gx = 0.0
while gx <= size_m[0]:
    x = gx / size_m[0] * PW
    d.line([(x, 0), (x, PH)], fill=(54, 66, 90, 255), width=3 * S)
    gx += km
gz = 0.0
while gz <= size_m[1]:
    y = gz / size_m[1] * PH
    d.line([(0, y), (PW, y)], fill=(54, 66, 90, 255), width=3 * S)
    gz += km

glow = Image.new("RGBA", (PW, PH), (0, 0, 0, 0))
g = ImageDraw.Draw(glow)
lines = Image.new("RGBA", (PW, PH), (0, 0, 0, 0))
ld = ImageDraw.Draw(lines)


def dashed(draw, pts, color, width, dash=34, gap=26):
    """Dashed polyline (Pillow has none)."""
    on, left = True, dash
    prev = pts[0]
    for p in pts[1:]:
        seg = np.hypot(p[0] - prev[0], p[1] - prev[1])
        if seg == 0:
            continue
        ux, uy = (p[0] - prev[0]) / seg, (p[1] - prev[1]) / seg
        pos = 0.0
        while pos < seg:
            step = min(left, seg - pos)
            a = (prev[0] + ux * pos, prev[1] + uy * pos)
            b = (prev[0] + ux * (pos + step), prev[1] + uy * (pos + step))
            if on:
                draw.line([a, b], fill=color, width=width)
            pos += step
            left -= step
            if left <= 1e-6:
                on = not on
                left = dash if on else gap
        prev = p


# Curiosity's real path: thin white dashes
trav = [px(p) for p in routes["traverse"]]
dashed(ld, trav, (244, 244, 245, 240), 5 * S, dash=40, gap=28)

# our planned routes to Pahrump Hills (colours match the app)
colours = {"SAFE": (52, 211, 153), "FAST": (251, 191, 36), "SCIENCE": (167, 139, 250)}
for name in ("SAFE", "FAST", "SCIENCE"):
    pts = [px(p) for p in routes["routes"]["pahrump"][name]]
    w = 15 * S if name == "SCIENCE" else 10 * S
    g.line(pts, fill=colours[name] + (255,), width=w * 3, joint="curve")
    ld.line(pts, fill=colours[name] + (255,), width=w, joint="curve")

glow = glow.filter(ImageFilter.GaussianBlur(14 * S))
plate = Image.alpha_composite(plate, Image.merge("RGBA", (*glow.split()[:3], glow.split()[3].point(lambda v: int(v * 0.85)))))
plate = Image.alpha_composite(plate, lines)

# sites and base
mk = Image.new("RGBA", (PW, PH), (0, 0, 0, 0))
md = ImageDraw.Draw(mk)
for p in routes["pois"]:
    x, y = px(p["xz"])
    r = 22 * S
    md.ellipse([x - r, y - r, x + r, y + r], fill=(167, 139, 250, 255), outline=(255, 255, 255, 255), width=6 * S)
bx, by = px(routes["base"]["xz"])
r = 28 * S
md.rectangle([bx - r, by - r, bx + r, by + r], fill=(255, 255, 255, 255), outline=(251, 146, 60, 255), width=8 * S)
plate = Image.alpha_composite(plate, mk)
plate.resize((W, H), Image.LANCZOS).convert("RGB").save(os.path.join(OUT, "plan.png"))

print("layer textures written to", OUT)
for f in ("optical.jpg", "thermal.jpg", "hazard.png", "relief.png", "plan.png"):
    print(" ", f, os.path.getsize(os.path.join(OUT, f)) // 1024, "KB")
