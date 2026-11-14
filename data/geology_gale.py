"""Approximate geologic units of lower Mount Sharp (Gale Crater) for the map, like NASA/JPL PIA26042 (T-34).

    python data/geology_gale.py            -> web/public/data/gale/units.json (outlines + labels) and units.png (tints)   (+ data-cache/geology-check.png to eyeball)

Why approximate: NASA publishes no GIS file for these units (searched Sat 14 Nov). PIA26042 ("Curiosity's Path to
Gediz Vallis Ridge and Beyond", NASA/JPL-Caltech/ESA/U. Arizona/JHUAPL/MSSS/USGS) is a painted animation. So every
outline here is DERIVED from NASA data with a stated rule, and each unit is seeded at a place where Curiosity really
stood inside it (NASA/JPL MSL waypoint feed). Labelled "approximate" in the app.

Rules (DEM = MSL Gale merged DEM v3 at 12.5 m, data-cache/gale_dem_msl_946x1186.npy from build_region.py):
  relief  = DEM - 400 m median        (positive = stands above its surroundings)
  ridge   Gediz Vallis Ridge: relief > RIDGE_RELIEF_M inside a 260 m corridor along the ridge axis; the component that
          contains the rover's position on sol 3940 (Aug 2023, "near the top end of Gediz Vallis Ridge", PIA26042 caption).
  pediment  Greenheugh Pediment: TRACED by hand (PED_OUTLINE) on the HiRISE mosaic + 20 m contours: the smooth,
          streaked bench whose north scarp is where the rover drove onto it (sol 2702, 'Edinburgh' drill site) and whose
          east edge is the cliff the rover followed to sol 3413. The trough below it has the same elevation and slope,
          so no automatic rule separates them. Plus a 100 m apron around the ridge's lower half (the ridge sits on it).
  clay    clay-bearing unit (Glen Torridon): south of Vera Rubin ridge and below CLAY_TOP_M, the elevation where the
          rover left the trough and started up the mountain front (sol 3209, -4031 m).
  sulfate sulfate-bearing unit: south of Vera Rubin ridge and above CLAY_TOP_M, minus pediment and ridge.
  channel Gediz Vallis Channel: a dashed line along the rover's own drive inside the channel (sols 4040-4301, 2024).
Needs: numpy, scipy, rasterio (already used by build_region.py), shapely (pip install shapely).
"""
import json
import os
import sys
import urllib.request

import numpy as np
import shapely
from scipy import ndimage
from rasterio import features
from affine import Affine
from shapely.geometry import shape, mapping, LineString, Point, Polygon, MultiPolygon
from shapely.ops import unary_union

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CACHE = os.path.join(ROOT, 'data-cache')
OUT = os.path.join(ROOT, 'web', 'public', 'data', 'gale', 'units.json')
OUT_PNG = os.path.join(ROOT, 'web', 'public', 'data', 'gale', 'units.png')   # the painted look: soft-edged tints, region box
CHECK = os.path.join(CACHE, 'geology-check.png')  # eyeball it after every run; not committed
WAYPOINTS = 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json'

CLAY_TOP_M = -4030.0          # rover elevation on sol 3209 where it left Glen Torridon for the mountain front
RIDGE_RELIEF_M = 4.0
RIDGE_AXIS = [(137.3835, -4.7505), (137.4035, -4.7755)]   # NW end -> SE (top) end, read off the relief map
RIDGE_HALF_WIDTH_M = 130.0
PED_OUTLINE = [  # lon, lat, clockwise from the west end; see the docstring
    (137.3620, -4.7462), (137.3680, -4.7438), (137.3743, -4.7404), (137.3807, -4.7366), (137.3857, -4.7377),
    (137.3900, -4.7400), (137.3950, -4.7430), (137.3942, -4.7459), (137.3923, -4.7488), (137.3904, -4.7518),
    (137.3857, -4.7501), (137.3807, -4.7518), (137.3756, -4.7556), (137.3705, -4.7594), (137.3640, -4.7610), (137.3600, -4.7540),
]
PED_APRON_BOX = (137.36, 137.40, -4.772, -4.733)
# Vera Rubin ridge crest, west -> east (relief map + the rover's sols 1800-2300 on the ridge). Units are drawn south of it.
VRR_LINE = [(137.30, -4.7415), (137.35, -4.7345), (137.378, -4.7285), (137.40, -4.7255), (137.43, -4.7215), (137.50, -4.7105)]
UNIT_LON = (137.335, 137.465)  # keep the band to the part of the mountain front that the map shows around the traverse

UNITS = [  # id, name, colour (PIA26042 palette as in Moss's reference image)
    ('sulfate', 'Sulfate-Bearing Unit', '#d9a82e'),
    ('clay', 'Clay-Bearing Unit', '#3fa34d'),
    ('pediment', 'Greenheugh Pediment', '#2bb3b1'),
    ('ridge', 'Gediz Vallis Ridge', '#d2453b'),
]


def chaikin(pts, rounds):
    """Corner-cutting on a closed ring: hand-traced vertices become a smooth outline."""
    for _ in range(rounds):
        out = []
        for i in range(len(pts)):
            (ax, ay), (bx, by) = pts[i], pts[(i + 1) % len(pts)]
            out += [(0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by), (0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by)]
        pts = out
    return pts


def load_waypoints():
    path = os.path.join(CACHE, 'msl_waypoints.json')
    if not os.path.exists(path):
        print('fetching', WAYPOINTS)
        urllib.request.urlretrieve(WAYPOINTS, path)
    feats = json.load(open(path, encoding='utf-8'))['features']
    return sorted((f['properties'] for f in feats), key=lambda p: p['sol'])


def at_sol(wps, sol):
    return next(p for p in wps if p['sol'] >= sol)


def main():
    cfg = json.load(open(os.path.join(ROOT, 'data', 'regions', 'gale.json'), encoding='utf-8'))
    lo0, lo1 = cfg['lon']
    la0, la1 = cfg['lat']
    dem = np.load(os.path.join(CACHE, 'gale_dem_msl_946x1186.npy'))[0].astype(np.float32)
    H, W = dem.shape
    dx, dy = (lo1 - lo0) / W, (la1 - la0) / H
    m_per_deg = np.pi * 3396190.0 / 180.0
    kx, ky = m_per_deg * np.cos(np.radians((la0 + la1) / 2)), m_per_deg
    cell_m = (dx * kx, dy * ky)
    to_px = lambda lon, lat: ((lon - lo0) / dx, (la1 - lat) / dy)
    px_to_ll = Affine(dx, 0, lo0, 0, -dy, la1)  # pixel (col,row) -> lon/lat
    wps = load_waypoints()

    relief = dem - ndimage.median_filter(dem, size=33)
    gy, gx = np.gradient(dem, cell_m[1], cell_m[0])
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    yy, xx = np.mgrid[0:H, 0:W]
    lon = lo0 + (xx + 0.5) * dx
    lat = la1 - (yy + 0.5) * dy

    def seed_mask(mask, pts, r=6):
        """Components of `mask` within r cells (75 m) of any seed: the rover stood at the unit's edge when it drove on."""
        lab, _ = ndimage.label(mask)
        ids = set()
        for x, y in (to_px(*p) for p in pts):
            win = lab[max(0, int(y) - r):int(y) + r + 1, max(0, int(x) - r):int(x) + r + 1]
            ids |= set(np.unique(win).tolist())
        ids -= {0}
        if not ids:
            raise SystemExit(f'no component under the seeds {pts}: loosen the thresholds')
        return np.isin(lab, list(ids))

    # south of Vera Rubin ridge
    vx = np.array([p[0] for p in VRR_LINE]); vy = np.array([p[1] for p in VRR_LINE])
    south = (lat < np.interp(lon, vx, vy)) & (lon >= UNIT_LON[0]) & (lon <= UNIT_LON[1])

    # ridge: corridor along the axis, raised ground, the part under the rover's sol-3940 position
    (ax, ay), (bx, by) = [((p[0] - lo0) * kx, (la1 - p[1]) * ky) for p in RIDGE_AXIS]
    X, Y = (lon - lo0) * kx, (la1 - lat) * ky
    t = np.clip(((X - ax) * (bx - ax) + (Y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2), -0.02, 1.02)
    dist = np.hypot(X - (ax + t * (bx - ax)), Y - (ay + t * (by - ay)))
    s3940 = at_sol(wps, 3940)
    ridge = ndimage.binary_closing((relief > RIDGE_RELIEF_M) & (dist < RIDGE_HALF_WIDTH_M), iterations=2)
    ridge = ndimage.binary_opening(ridge, iterations=1)
    ridge_axis_seeds = [(RIDGE_AXIS[0][0] + f * (RIDGE_AXIS[1][0] - RIDGE_AXIS[0][0]), RIDGE_AXIS[0][1] + f * (RIDGE_AXIS[1][1] - RIDGE_AXIS[0][1])) for f in np.linspace(0.05, 0.95, 19)]
    lab, _ = ndimage.label(ridge)
    keep = {lab[int(y), int(x)] for x, y in (to_px(*p) for p in ridge_axis_seeds)} - {0}
    ridge = np.isin(lab, list(keep))
    ridge = ndimage.binary_fill_holes(ndimage.binary_closing(ridge, iterations=3))
    # the ridge must actually reach the rover's sol-3940 position (sanity check on the axis)
    rx, ry = to_px(s3940['lon'], s3940['lat'])
    near = ridge[max(0, int(ry) - 12):int(ry) + 12, max(0, int(rx) - 12):int(rx) + 12].any()
    print(f"ridge: {ridge.sum() * cell_m[0] * cell_m[1] / 1e6:.2f} km2, reaches the rover's sol-{s3940['sol']} spot: {near}")

    # pediment: the traced outline (it must contain the rover's two drives onto it) + an apron around the ridge's lower half
    p1, p2 = at_sol(wps, 2702), at_sol(wps, 3413)
    outline = Polygon(chaikin(PED_OUTLINE, 3))
    for p in (p1, p2):
        d_m = outline.exterior.distance(Point(p['lon'], p['lat'])) * kx
        inside = outline.contains(Point(p['lon'], p['lat']))
        print(f"pediment check: rover sol {p['sol']} is {'inside' if inside else 'outside'}, {d_m:.0f} m from the traced edge")
        if not inside and d_m > 120:
            raise SystemExit('the traced pediment outline misses a place the rover drove onto it')
    ped = shapely.contains_xy(outline, lon, lat)
    box = (lon >= PED_APRON_BOX[0]) & (lon <= PED_APRON_BOX[1]) & (lat >= PED_APRON_BOX[2]) & (lat <= PED_APRON_BOX[3])
    ped |= ndimage.binary_dilation(ridge & (t < 0.55), iterations=8) & box
    ped = ndimage.binary_fill_holes(ndimage.binary_closing(ped, iterations=2)) & ~ridge
    print(f"pediment: {ped.sum() * cell_m[0] * cell_m[1] / 1e6:.2f} km2")

    clay = south & (dem < CLAY_TOP_M) & ~ped & ~ridge
    sulfate = south & (dem >= CLAY_TOP_M) & ~ped & ~ridge
    # drop specks: keep connected parts bigger than ~0.05 km2
    def clean(m, min_km2=0.05):
        m = ndimage.binary_opening(ndimage.binary_closing(m, iterations=2), iterations=2)
        lab, n = ndimage.label(m)
        sizes = ndimage.sum(m, lab, range(1, n + 1)) * cell_m[0] * cell_m[1] / 1e6
        return np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= min_km2])
    masks = {'sulfate': clean(sulfate, 0.15), 'clay': clean(clay, 0.15), 'pediment': ped, 'ridge': ridge}

    def to_geom(mask, smooth_px=1.2, simplify_px=0.5):
        polys = [shape(g) for g, v in features.shapes(mask.astype(np.uint8), mask=mask, transform=Affine.identity()) if v == 1]
        g = unary_union(polys).buffer(smooth_px, join_style=1).buffer(-smooth_px, join_style=1).simplify(simplify_px)
        return g

    def ll(g):
        return shapely.transform(g, lambda c: np.column_stack([np.round(lo0 + c[:, 0] * dx, 6), np.round(la1 - c[:, 1] * dy, 6)]))

    out = []
    for uid, name, colour in UNITS:
        g = to_geom(masks[uid])
        if g.is_empty:
            raise SystemExit(f'{uid} came out empty')
        biggest = max(g.geoms, key=lambda q: q.area) if isinstance(g, MultiPolygon) else g
        lp = biggest.representative_point() if uid != 'pediment' else biggest.centroid
        if not biggest.contains(lp):
            lp = biggest.representative_point()
        props = {'id': uid, 'name': name, 'color': colour, 'kind': 'unit', 'approx': True,
                 'label': [round(lo0 + lp.x * dx, 5), round(la1 - lp.y * dy, 5)],
                 'areaKm2': round(masks[uid].sum() * cell_m[0] * cell_m[1] / 1e6, 2)}
        if uid == 'ridge':
            ang = np.degrees(np.arctan2(-(by - ay), bx - ax))  # screen angle of the axis, north-up map
            props['labelAngle'] = round(float(-ang), 1)
            mid = [(RIDGE_AXIS[0][0] + RIDGE_AXIS[1][0]) / 2, (RIDGE_AXIS[0][1] + RIDGE_AXIS[1][1]) / 2]
            props['label'] = [round(mid[0], 5), round(mid[1], 5)]
        out.append({'type': 'Feature', 'properties': props, 'geometry': mapping(ll(g))})
        print(f"{uid:9s} {props['areaKm2']:6.2f} km2  label {props['label']}")

    # channel: the rover's own drive inside Gediz Vallis channel (sols 4040-4301), smoothed
    ch = [(p['lon'], p['lat']) for p in wps if 4040 <= p['sol'] <= 4301]
    line = LineString(ch).simplify(0.0002)
    cl = line.interpolate(0.55, normalized=True)
    out.append({'type': 'Feature',
                'properties': {'id': 'channel', 'name': 'Gediz Vallis Channel', 'color': '#ffffff', 'kind': 'channel', 'approx': True,
                               'label': [round(cl.x, 5), round(cl.y, 5)]},
                'geometry': {'type': 'LineString', 'coordinates': [[round(x, 6), round(y, 6)] for x, y in line.coords]}})

    fc = {'type': 'FeatureCollection',
          'properties': {
              'name': 'Approximate geologic units of lower Mount Sharp',
              'approx': True,
              'guide': 'NASA/JPL PIA26042, Curiosity\'s Path to Gediz Vallis Ridge and Beyond (https://photojournal.jpl.nasa.gov/catalog/PIA26042)',
              'method': 'Derived from the MSL Gale merged DEM v3 (USGS) by data/geology_gale.py; each unit seeded at a NASA/JPL MSL waypoint where Curiosity stood in it. Not an official geologic map.',
              'clayTopM': CLAY_TOP_M,
          },
          'features': out}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(fc, f, separators=(',', ':'))
    print('wrote', os.path.relpath(OUT, ROOT), f'{os.path.getsize(OUT) / 1024:.0f} KB')

    write_tints(masks)
    check_image(masks, cfg, wps, ch)


FEATHER_PX = 2.5   # Gaussian edge softening in DEM cells (12.5 m): PIA26042's units are painted with soft edges
TINT_ALPHA = 0.62  # the map layer's raster-opacity scales this further


def write_tints(masks):
    """RGBA image on the DEM grid (same corners as visible.jpg): each unit's colour with a feathered alpha."""
    from PIL import Image
    H, W = next(iter(masks.values())).shape
    rgb = np.zeros((H, W, 3), np.float32)
    a = np.zeros((H, W), np.float32)
    for uid, _, colour in UNITS:  # bottom to top: sulfate, clay, pediment, ridge
        c = np.array([int(colour[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
        al = ndimage.gaussian_filter(masks[uid].astype(np.float32), FEATHER_PX) * TINT_ALPHA
        rgb = rgb * (1 - al[..., None]) + c * al[..., None]   # premultiplied "over"
        a = a * (1 - al) + al
    out = np.zeros((H, W, 4), np.uint8)
    nz = a > 1e-4
    out[nz, :3] = np.clip(rgb[nz] / a[nz, None], 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(a * 255, 0, 255).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save(OUT_PNG, optimize=True)
    print('wrote', os.path.relpath(OUT_PNG, ROOT), f'{os.path.getsize(OUT_PNG) / 1024:.0f} KB')


def check_image(masks, cfg, wps, ch):
    """Top-down check picture: HiRISE + units + Curiosity's path, for the Result line and the docs."""
    from PIL import Image, ImageDraw
    hi = np.load(os.path.join(CACHE, 'gale_hirise_1634x2048.npy'))
    vk = np.load(os.path.join(CACHE, 'gale_viking_1634x2048.npy'))
    hi = np.nan_to_num(np.where(np.isnan(hi), vk, hi)).transpose(1, 2, 0)
    hi = (hi / max(1e-6, np.percentile(hi, 99.5)) * 255).clip(0, 255).astype(np.uint8)
    lo0, lo1 = cfg['lon']; la0, la1 = cfg['lat']
    LON, LAT = (137.34, 137.45), (-4.80, -4.70)
    Hh, Wh = hi.shape[:2]
    c = lambda a, h, w: a[int((la1 - LAT[1]) / (la1 - la0) * h):int((la1 - LAT[0]) / (la1 - la0) * h), int((LON[0] - lo0) / (lo1 - lo0) * w):int((LON[1] - lo0) / (lo1 - lo0) * w)]
    base = Image.fromarray(c(hi, Hh, Wh)).convert('RGBA')
    S = 2
    base = base.resize((base.width * S, base.height * S), Image.BILINEAR)
    for uid, _, colour in UNITS:
        m = c(masks[uid], *masks[uid].shape)
        rgb = tuple(int(colour[i:i + 2], 16) for i in (1, 3, 5))
        a = Image.fromarray((m * 110).astype(np.uint8)).resize(base.size, Image.NEAREST)
        layer = Image.new('RGBA', base.size, rgb + (0,)); layer.putalpha(a)
        base = Image.alpha_composite(base, layer)
    dr = ImageDraw.Draw(base)
    px = lambda lon, lat: ((lon - LON[0]) / (LON[1] - LON[0]) * base.width, (LAT[1] - lat) / (LAT[1] - LAT[0]) * base.height)
    t = json.load(open(os.path.join(ROOT, 'web', 'public', 'data', 'gale', 'traverse-detail.json'), encoding='utf-8'))
    for l in t['features'][0]['geometry']['coordinates']:
        dr.line([px(*q) for q in l], fill=(255, 255, 255, 255), width=2)
    dr.line([px(*q) for q in ch], fill=(255, 255, 255, 255), width=1)
    for uid, name, _ in UNITS:
        pass
    os.makedirs(os.path.dirname(CHECK), exist_ok=True)
    base.convert('RGB').save(CHECK)
    print('check picture', os.path.relpath(CHECK, ROOT), base.size)


if __name__ == '__main__':
    main()
