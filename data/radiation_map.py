"""Radiation map from NASA/JPL/JSC PIA03480 "Estimated Radiation Dosage on Mars" (Mars Odyssey MARIE + MGS MOLA).

Two outputs:
  1. The dose-vs-elevation fit that planner/src/radiation.js uses (printed; also data/radiation/fit.json).
  2. web/public/data/mars/radiation.png: the NASA map reprojected from its two orthographic hemispheres to
     Web Mercator (lon -180..180, lat +-85), recoloured on its own 10-20 rem/yr colour bar, grid lines removed.
     Areas neither hemisphere shows (or only at the limb) stay transparent.

How:
  - Each globe is an orthographic view. Centre, radius and sub-observer point were fitted by hand to the pole and
    to Hellas / Olympus Mons / Pavonis Mons, then checked by drawing MOLA contours over the image (they line up).
  - A map pixel = colour-bar colour blended with grey hillshade. We remove the grey part (subtract min channel,
    normalise) and match against the colour bar the same way. Shading-invariant, but the pure-blue (<11.2) and
    pure-red (>18.5) ends of the bar can't be told apart that way: the fit skips them, the image keeps them.
  - Fit: ln(dose) vs MOLA elevation, -7 to +3 km (above, Tharsis is drawn in shaded browns that read back badly).

Run from the repo root (needs numpy + Pillow; downloads MOLA MEGDR 4 px/deg, 2 MB, once into data-cache/):
    python data/radiation_map.py
"""
import json
import os
import sys
import urllib.request

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'data', 'radiation', 'PIA03480.png')
MOLA_URL = 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg004/megt90n000cb.img'
MOLA = os.path.join(ROOT, 'data-cache', 'megt90n000cb.img')
OUT_PNG = os.path.join(ROOT, 'web', 'public', 'data', 'mars', 'radiation.png')
OUT_FIT = os.path.join(ROOT, 'data', 'radiation', 'fit.json')

# Orthographic globes in PIA03480 (1177 x 940 px): centre (px), radius (px), sub-observer lat / east lon (deg)
GLOBES = [
    dict(cx=320.5, cy=558.5, R=262.5, lat0=-30.4, lon0=90.4),   # left: 0-180 E, south pole visible
    dict(cx=870.0, cy=559.5, R=262.0, lat0=37.8, lon0=239.5),   # right: 180-360 E, north pole visible
]
BAR_Y, BAR_X = (180, 210), (134, 1063)   # colour bar rows / columns; x 133..1063 = 10..20 rem/yr
LIMB = 0.93                               # ignore the outer 7 % of each disk (too foreshortened)


def chroma(p):
    mn = p.min(-1, keepdims=True)
    mx = p.max(-1, keepdims=True)
    return (p - mn) / np.maximum(mx - mn, 1), (mx - mn)[..., 0]


def decode(px, lut, lc, amb, vals):
    """rem/yr for each pixel (N x 3), NaN where it isn't a colour-bar colour (grid lines, labels)."""
    pc, sat = chroma(px)
    j = np.empty(len(pc), int)
    dmin = np.empty(len(pc))
    for a in range(0, len(pc), 4000):
        dd = ((pc[a:a + 4000, None, :] - lc[None, :, :]) ** 2).sum(2)
        jj = dd.argmin(1)
        j[a:a + 4000] = jj
        dmin[a:a + 4000] = np.sqrt(dd[np.arange(len(jj)), jj])
    v = np.where((sat > 40) & (dmin < 0.12), vals[j], np.nan)
    white = px.min(1) > 200          # Olympus / Tharsis summits: off the top of the scale
    v[white] = 20.0
    return v, amb[j] & ~white


def ortho_inverse(g, xs, ys):
    x = (xs - g['cx']) / g['R']
    y = -(ys - g['cy']) / g['R']
    rho = np.hypot(x, y)
    c = np.arcsin(np.clip(rho, 0, 1))
    p0, l0 = np.deg2rad(g['lat0']), np.deg2rad(g['lon0'])
    with np.errstate(invalid='ignore', divide='ignore'):
        lat = np.arcsin(np.cos(c) * np.sin(p0) + np.where(rho > 0, y * np.sin(c) * np.cos(p0) / rho, 0))
        lon = l0 + np.arctan2(x * np.sin(c), rho * np.cos(c) * np.cos(p0) - y * np.sin(c) * np.sin(p0))
    return np.rad2deg(lat), np.rad2deg(lon) % 360, rho


def ortho_forward(g, lat, lon):
    p, l = np.deg2rad(lat), np.deg2rad(lon)
    p0, l0 = np.deg2rad(g['lat0']), np.deg2rad(g['lon0'])
    cosc = np.sin(p0) * np.sin(p) + np.cos(p0) * np.cos(p) * np.cos(l - l0)
    x = g['R'] * np.cos(p) * np.sin(l - l0)
    y = g['R'] * (np.cos(p0) * np.sin(p) - np.sin(p0) * np.cos(p) * np.cos(l - l0))
    return g['cx'] + x, g['cy'] - y, cosc


def main():
    im = np.asarray(Image.open(SRC).convert('RGB')).astype(float)
    H, W, _ = im.shape
    lut = im[BAR_Y[0]:BAR_Y[1], BAR_X[0]:BAR_X[1]].mean(0)
    vals = 10 + 10 * (np.arange(len(lut)) + 1.5) / (BAR_X[1] - BAR_X[0] + 1)
    lc, _ = chroma(lut)
    amb = ((lc[:, 0] < 0.02) & (lc[:, 1] < 0.02)) | ((lc[:, 1] < 0.02) & (lc[:, 2] < 0.02))

    if not os.path.exists(MOLA):
        os.makedirs(os.path.dirname(MOLA), exist_ok=True)
        print('downloading MOLA MEGDR 4 px/deg ...', file=sys.stderr)
        urllib.request.urlretrieve(MOLA_URL, MOLA)
    mola = np.fromfile(MOLA, '>i2').reshape(720, 1440).astype(float)

    # 1. decode every globe pixel, pair with MOLA
    ys, xs = np.mgrid[0:H, 0:W]
    Z, V = [], []
    for g in GLOBES:
        lat, lon, rho = ortho_inverse(g, xs, ys)
        m = rho < LIMB
        v, ambig = decode(im[m], lut, lc, amb, vals)
        ok = ~np.isnan(v) & ~ambig & (v < 20)
        r = np.clip(((90 - lat[m][ok]) * 4).astype(int), 0, 719)
        c = np.clip((lon[m][ok] * 4).astype(int), 0, 1439)
        Z.append(mola[r, c])
        V.append(v[ok])
    Z, V = np.concatenate(Z), np.concatenate(V)
    k = (Z > -7000) & (Z < 3000)
    A = np.vstack([np.ones(k.sum()), Z[k] / 1000]).T
    coef = np.linalg.lstsq(A, np.log(V[k]), rcond=None)[0]
    pred = np.exp(A @ coef)
    r2 = 1 - ((V[k] - pred) ** 2).sum() / ((V[k] - V[k].mean()) ** 2).sum()
    bins = []
    for lo in range(-7000, 3000, 1000):
        b = (Z >= lo) & (Z < lo + 1000)
        if b.sum() > 30:
            bins.append({'zKm': [lo / 1000, lo / 1000 + 1], 'n': int(b.sum()), 'medianRemYr': round(float(np.median(V[b])), 2)})
    fit = {
        'model': 'rem/yr = a * exp(kPerKm * z_km)', 'a': round(float(np.exp(coef[0])), 3), 'kPerKm': round(float(coef[1]), 4),
        'perKmPct': round(100 * float(np.exp(coef[1]) - 1), 2), 'r2': round(float(r2), 3), 'n': int(k.sum()),
        'rmsRemYr': round(float(np.sqrt(((V[k] - pred) ** 2).mean())), 2), 'bins': bins,
        'source': 'NASA/JPL/JSC PIA03480 (Mars Odyssey MARIE, MGS MOLA) x MGS MOLA MEGDR 4 px/deg',
    }
    os.makedirs(os.path.dirname(OUT_FIT), exist_ok=True)
    with open(OUT_FIT, 'w') as f:
        json.dump(fit, f, indent=1)
    print(json.dumps({k: fit[k] for k in ('a', 'kPerKm', 'perKmPct', 'r2', 'n', 'rmsRemYr')}))

    # 2. global layer in Web Mercator. Value per output pixel from the globe that sees it most face-on.
    OW, OH = 1024, 1024
    lon_out = -180 + (np.arange(OW) + 0.5) / OW * 360
    merc = np.pi * (1 - 2 * (np.arange(OH) + 0.5) / OH) * np.log(np.tan(np.pi / 4 + np.deg2rad(85) / 2)) / np.pi
    lat_out = np.rad2deg(np.arctan(np.sinh(merc)))
    LON, LAT = np.meshgrid(lon_out % 360, lat_out)
    best = np.full(LON.shape, -1.0)
    val = np.full(LON.shape, np.nan)
    for g in GLOBES:
        x, y, cosc = ortho_forward(g, LAT, LON)
        use = (cosc > np.sqrt(1 - LIMB ** 2)) & (cosc > best)
        xi = np.clip(np.round(x).astype(int), 0, W - 1)
        yi = np.clip(np.round(y).astype(int), 0, H - 1)
        v, ambig = decode(im[yi[use], xi[use]], lut, lc, amb, vals)
        # dark pure blue / pure red ends: keep the bar end they belong to
        pc, _ = chroma(im[yi[use], xi[use]])
        blue = ambig & (pc[:, 2] > 0.9)
        v = np.where(ambig, np.where(blue, 10.6, 19.4), v)
        val[use] = v
        best[use] = cosc[use]
    seen = best > 0
    # fill grid lines / labels (NaN inside the seen area) from neighbours
    for _ in range(12):
        holes = seen & np.isnan(val)
        if not holes.any():
            break
        acc = np.zeros_like(val)
        cnt = np.zeros_like(val)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                s = np.roll(np.roll(val, dy, 0), dx, 1)
                okn = ~np.isnan(s)
                acc[okn] += s[okn]
                cnt[okn] += 1
        fill = holes & (cnt > 0)
        val[fill] = acc[fill] / cnt[fill]
    # where neither hemisphere shows Mars (a band between the two tilted views), use the fit on MOLA elevation
    gap = np.isnan(val)
    r = np.clip(((90 - LAT[gap]) * 4).astype(int), 0, 719)
    c = np.clip((LON[gap] * 4).astype(int), 0, 1439)
    val[gap] = np.clip(fit['a'] * np.exp(fit['kPerKm'] * mola[r, c] / 1000), 10, 20)
    print(f'filled from the fit: {100 * gap.mean():.0f} % of the layer (not shown by either NASA hemisphere)')
    t = np.clip((val - 10) / 10, 0, 1)
    idx = np.clip(np.nan_to_num(t * (len(lut) - 1)).astype(int), 0, len(lut) - 1)
    rgba = np.zeros((OH, OW, 4), np.uint8)
    rgba[..., :3] = lut[idx].astype(np.uint8)
    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    # 512 px and a 96-colour palette keep it ~150 KB (the site must stay light)
    img = Image.fromarray(rgba[..., :3], 'RGB').resize((512, 512), Image.BILINEAR)
    img.quantize(96, method=Image.Quantize.MEDIANCUT).save(OUT_PNG, optimize=True)
    print(f'wrote {os.path.relpath(OUT_PNG, ROOT)} ({os.path.getsize(OUT_PNG) // 1024} KB), {os.path.relpath(OUT_FIT, ROOT)}')


if __name__ == '__main__':
    main()
