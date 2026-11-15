#!/usr/bin/env python3
"""
Bake one Mars region into the web app's data contract (docs/ARCHITECTURE.md).

One generic region stage driven by data/regions/<id>.json: reads each NASA/USGS source through a
window (projected sources such as the 1 m MSL DEM are reprojected onto a lon/lat grid) and exports
exactly meta.json / elev.i16 / slope.png / visible.jpg / thermal.jpg / pois.json. --synthetic tests
the export without network, --check validates the output.

Usage (from the repo root, on a machine that can reach the USGS bucket):
    pip install rasterio numpy pillow scipy
    python data/build_region.py gale               # 1 m MSL DEM (best)
    python data/build_region.py gale --dem hrsc    # 200 m HRSC+MOLA fallback (faster)
    python data/build_region.py gale --check       # validate web/public/data/gale/
    python data/build_region.py gale --synthetic   # no network: fake terrain, tests the export only

Raw reads are cached in data-cache/ (git-ignored), so re-runs only redo the export.
"""

import argparse
import datetime
import json
import math
import os
import sys
import time

import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
# Windows consoles default to a legacy code page that can't print → or °: force UTF-8 output.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "EMPTY_DIR")
os.environ.setdefault("GDAL_HTTP_MULTIRANGE", "YES")
os.environ.setdefault("GDAL_HTTP_MERGE_CONSECUTIVE_RANGES", "YES")
os.environ.setdefault("GDAL_CACHEMAX", "1024")
os.environ.setdefault("VSI_CACHE", "TRUE")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "data-cache")
S3 = "https://asc-pds-services.s3.us-west-2.amazonaws.com/"
VSI = "/vsicurl/" + S3
R_MARS = 3396190.0  # IAU Mars 2000 sphere (m)
M_PER_DEG = R_MARS * math.pi / 180.0
OVERSAMPLE = 2  # DEM read at 2x the grid resolution; slope.png = max slope inside each cell
MAX_TOTAL_MB = 15


def log(*a):
    print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)


# --------------------------------------------------------------------------- image helpers
def percentile_stretch(a, lo=1, hi=99, mask=None):
    """Scale `a` so the lo..hi percentiles of its valid pixels span 0..1 (clipped). Returns (scaled, low, high)."""
    valid = a[mask] if mask is not None else a[np.isfinite(a)]
    if valid.size == 0:
        return np.zeros_like(a), 0.0, 1.0
    low, high = np.percentile(valid, [lo, hi])
    scaled = np.clip((a - low) / max(high - low, 1e-6), 0, 1)
    return scaled, float(low), float(high)


def fill_from_nearest(a, holes):
    """Give every hole the value of the nearest valid cell (Euclidean distance transform)."""
    if not holes.any():
        return a
    _, nearest = ndimage.distance_transform_edt(holes, return_indices=True)
    return a[tuple(nearest)]


# --------------------------------------------------------------------------- grid
def region_grid(cfg):
    lon0, lon1 = cfg["lon"]
    lat0, lat1 = cfg["lat"]
    latc = math.radians((lat0 + lat1) / 2)
    wm = (lon1 - lon0) * M_PER_DEG * math.cos(latc)
    hm = (lat1 - lat0) * M_PER_DEG
    W = int(round(wm / cfg["cellTargetM"]))
    H = int(round(hm / cfg["cellTargetM"]))
    return W, H, wm / W, hm / H


def image_size(W, H, max_px):
    s = max_px / max(W, H)
    return int(round(W * s)), int(round(H * s))


# --------------------------------------------------------------------------- reading (needs rasterio + network)
def read_to_grid(key, cfg, out_w, out_h, bands=(1,), cache_tag=None):
    """Read `key` from the USGS bucket and resample it onto the region's lon/lat grid
    (out_h x out_w, row 0 = north). Only the window around the region is fetched; with
    overviews (COGs) GDAL reads a matching overview level. Returns float32 (bands, h, w), NaN = no data."""
    if cache_tag:
        p = os.path.join(CACHE, f"{cfg['id']}_{cache_tag}_{out_w}x{out_h}.npy")
        if os.path.exists(p):
            log("cache hit", os.path.basename(p))
            return np.load(p)
    import rasterio
    import rasterio.windows
    from affine import Affine
    from rasterio.crs import CRS
    from rasterio.enums import Resampling
    from rasterio.transform import from_bounds
    from rasterio.warp import reproject, transform_bounds

    geo_crs = CRS.from_proj4(f"+proj=longlat +R={R_MARS} +no_defs")
    lon0, lon1 = cfg["lon"]
    lat0, lat1 = cfg["lat"]
    dst_tr = from_bounds(lon0, lat0, lon1, lat1, out_w, out_h)
    t0 = time.time()
    with rasterio.open(VSI + key) as src:
        log(f"open {key}: {src.width}x{src.height}, crs={src.crs.to_string()[:60]}…, "
            f"blocks={src.block_shapes[0]}, overviews={src.overviews(1)}")
        pad = 0.03 * max(lon1 - lon0, lat1 - lat0)
        l, b, r, t = transform_bounds(geo_crs, src.crs, lon0 - pad, lat0 - pad, lon1 + pad, lat1 + pad, densify_pts=21)
        win = rasterio.windows.from_bounds(l, b, r, t, src.transform)
        win = win.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
        win = win.round_offsets().round_lengths()
        # read at ~1.5x the output resolution (average resampling, uses overviews when present)
        scale = max(1.0, min(win.width / (out_w * 1.5), win.height / (out_h * 1.5)))
        rh, rw = max(1, int(math.ceil(win.height / scale))), max(1, int(math.ceil(win.width / scale)))
        if not src.overviews(1) and src.block_shapes[0][0] == 1:
            est = win.height * src.width * np.dtype(src.dtypes[0]).itemsize / 1e9
            log(f"WARNING: no overviews + striped file: about {est:.1f} GB must be read. "
                f"If this is too slow, Ctrl-C and re-run with --dem hrsc.")
        log(f"reading window {int(win.width)}x{int(win.height)} px → {rw}x{rh}")
        arr = src.read(list(bands), window=win, out_shape=(len(bands), rh, rw),
                       resampling=Resampling.average, masked=True)
        src_tr = src.window_transform(win) * Affine.scale(win.width / rw, win.height / rh)
        src_crs = src.crs
    out = np.full((len(bands), out_h, out_w), np.nan, np.float32)
    for i in range(len(bands)):
        a = arr[i].astype(np.float32).filled(np.nan)
        reproject(a, out[i], src_transform=src_tr, src_crs=src_crs, src_nodata=np.nan,
                  dst_transform=dst_tr, dst_crs=geo_crs, dst_nodata=np.nan,
                  resampling=Resampling.bilinear)
    log(f"done {key.split('/')[-1]} in {time.time() - t0:.0f} s")
    if cache_tag:
        os.makedirs(CACHE, exist_ok=True)
        np.save(p, out)
    return out


def fetch_real(cfg, dem_choice):
    W, H, _, _ = region_grid(cfg)
    ds = cfg["datasets"]
    dem_key = "dem_msl" if dem_choice == "msl" else "dem_hrsc"
    dem = read_to_grid(ds[dem_key]["key"], cfg, W * OVERSAMPLE, H * OVERSAMPLE, cache_tag=dem_key)[0]
    iw, ih = image_size(W, H, cfg["imageMaxPx"])
    vis = read_to_grid(ds["hirise_color"]["key"], cfg, iw, ih, bands=(1, 2, 3), cache_tag="hirise")
    vik = read_to_grid(ds["viking_color"]["key"], cfg, iw, ih, bands=(1, 2, 3), cache_tag="viking")
    tw, th = image_size(W, H, cfg["thermalMaxPx"])
    thermal = read_to_grid(ds["themis_night"]["key"], cfg, tw, th, cache_tag="themis")[0]
    return dict(dem=dem, dem_key=dem_key, visible=vis, viking=vik, thermal=thermal)


def fetch_synthetic(cfg):
    """Fake inputs with the same shapes as the real ones, for testing the export without network."""
    W, H, cx, cy = region_grid(cfg)
    rng = np.random.default_rng(1)
    w2, h2 = W * OVERSAMPLE, H * OVERSAMPLE
    yy, xx = np.mgrid[0:h2, 0:w2].astype(np.float32)
    dem = -4500 + 900 * (yy / h2) ** 2  # rises to the south (Mount Sharp)
    dem += 60 * np.exp(-(((xx - w2 * 0.3) ** 2 + (yy - h2 * 0.62) ** 2) / (2 * (w2 * 0.05) ** 2)))  # ridge-ish bump
    dem += ndimage.gaussian_filter(rng.normal(0, 25, (h2, w2)), 3)
    dem[:3, :5] = np.nan  # a few no-data cells
    iw, ih = image_size(W, H, cfg["imageMaxPx"])
    vis = np.full((3, ih, iw), np.nan, np.float32)
    vis[:, : ih * 2 // 3] = rng.uniform(60, 200, (3, ih * 2 // 3, iw))  # HiRISE covers the north 2/3 only
    vik = rng.uniform(80, 160, (3, ih, iw)).astype(np.float32)
    tw, th = image_size(W, H, cfg["thermalMaxPx"])
    thermal = ndimage.gaussian_filter(rng.uniform(0, 255, (th, tw)), 4).astype(np.float32)
    return dict(dem=dem.astype(np.float32), dem_key="synthetic", visible=vis, viking=vik, thermal=thermal)


# --------------------------------------------------------------------------- export (numpy only)
def export(cfg, raw, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    W, H, cx, cy = region_grid(cfg)
    o = OVERSAMPLE

    # elevation: fill holes, average-pool to the grid
    fine = raw["dem"].astype(np.float32)
    bad = ~np.isfinite(fine)
    if bad.all():
        sys.exit("DEM read returned no data for this region")
    if bad.any():
        log(f"filling {bad.mean() * 100:.2f} % no-data DEM cells")
        fine = fill_from_nearest(np.where(bad, 0, fine), bad)
    elev = fine.reshape(H, o, W, o).mean(axis=(1, 3))
    elev_i16 = np.clip(np.round(elev), -32768, 32767).astype("<i2")
    elev_i16.tofile(os.path.join(out_dir, "elev.i16"))

    # slope: from the 2x finer DEM, max per grid cell → this doubles as the planner's fineSlope
    gy, gx = np.gradient(fine, cy / o, cx / o)
    sl = np.degrees(np.arctan(np.hypot(gx, gy))).reshape(H, o, W, o).max(axis=(1, 3))
    Image.fromarray(np.clip(np.round(sl * 4), 0, 255).astype(np.uint8), "L").save(
        os.path.join(out_dir, "slope.png"), optimize=True)

    # visible: HiRISE colour where it exists, Viking colour underneath
    vis, vik = raw["visible"], raw["viking"]
    hmask = np.all(np.isfinite(vis), axis=0) & (np.nan_to_num(vis).max(axis=0) > 0)
    rgb = np.zeros(vis.shape[1:] + (3,), np.float32)
    for b in range(3):
        sv, _, _ = percentile_stretch(np.nan_to_num(vik[b]), 0.5, 99.5, np.isfinite(vik[b]))
        rgb[..., b] = sv
        if hmask.any():
            sh, _, _ = percentile_stretch(np.nan_to_num(vis[b]), 0.5, 99.5, hmask)
            rgb[..., b] = np.where(hmask, sh, rgb[..., b])
    hirise_pct = float(hmask.mean() * 100)
    Image.fromarray((rgb * 255 + 0.5).astype(np.uint8)).save(
        os.path.join(out_dir, "visible.jpg"), quality=85, optimize=True, progressive=True)

    # thermal: greyscale, stretched locally (THEMIS mosaics are normalised image by image).
    # The web app false-colours it (web/lib/trek.ts), so only the grey level matters. No data = black.
    th = raw["thermal"]
    ok = np.isfinite(th) & (th > 0)
    grey, _, _ = percentile_stretch(np.nan_to_num(th), 1, 99.5, ok)
    grey[~ok] = 0
    Image.fromarray((grey * 255 + 0.5).astype(np.uint8), "L").save(
        os.path.join(out_dir, "thermal.jpg"), quality=85, optimize=True, progressive=True)

    # POIs
    pois = [{k: p[k] for k in ("id", "name", "lon", "lat", "why", "source", "approx") if k in p} for p in cfg["pois"]]
    with open(os.path.join(out_dir, "pois.json"), "w", encoding="utf-8") as f:
        json.dump(pois, f, indent=2, ensure_ascii=False)

    # meta
    ds = cfg["datasets"]

    def src(layer, key, note=None):
        d = ds[key]
        e = {"layer": layer, "dataset": d["dataset"], "mission": d["mission"], "resolution": d["resolution"],
             "url": d.get("url", S3 + d["key"]), "file": S3 + d["key"]}
        if note:
            e["note"] = note
        return e

    dem_key = raw["dem_key"]
    sources = []
    if dem_key == "synthetic":
        sources.append({"layer": "elev", "dataset": "SYNTHETIC test terrain (not real)", "mission": "none", "url": ""})
    else:
        sources.append(src("elev", dem_key, f"resampled to {cx:.1f} x {cy:.1f} m cells"))
        sources.append(src("slope", dem_key, f"max slope inside each cell, from the DEM at {cx / o:.1f} m"))
    sources.append(src("visible", "hirise_color", f"covers {hirise_pct:.0f} % of the region"))
    sources.append(src("visible", "viking_color", "fills gaps outside HiRISE coverage"))
    sources.append(src("thermal", "themis_night", "local percentile stretch; brighter = warmer at night (rockier)"))

    meta = {
        "id": cfg["id"], "name": cfg["name"],
        "lon": cfg["lon"], "lat": cfg["lat"],
        "width": W, "height": H,
        "cellM": [round(cx, 3), round(cy, 3)],
        "elevRange": [int(elev_i16.min()), int(elev_i16.max())],
        "slopeScale": 4,
        "slopeNote": "slope.png = max slope (deg x 4) inside each cell; pass it to planMission as fineSlope",
        "visibleSize": list(image_size(W, H, cfg["imageMaxPx"])),
        "thermalSize": list(image_size(W, H, cfg["thermalMaxPx"])),
        "base": cfg.get("base"),
        "synthetic": dem_key == "synthetic",
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "credits": "Data: NASA / JPL / USGS / ESA.",
        "sources": sources,
    }
    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    log(f"exported {W}x{H} grid, cells {cx:.1f} x {cy:.1f} m, elevation {meta['elevRange']} m, "
        f"max slope {sl.max():.1f}°, HiRISE coverage {hirise_pct:.0f} %")


# --------------------------------------------------------------------------- check
def check(out_dir):
    errs = []
    need = ["meta.json", "elev.i16", "slope.png", "visible.jpg", "thermal.jpg", "pois.json"]
    for n in need:
        if not os.path.exists(os.path.join(out_dir, n)):
            errs.append(f"missing {n}")
    if errs:
        return errs
    m = json.load(open(os.path.join(out_dir, "meta.json"), encoding="utf-8"))
    W, H = m["width"], m["height"]
    size = os.path.getsize(os.path.join(out_dir, "elev.i16"))
    if size != W * H * 2:
        errs.append(f"elev.i16 is {size} bytes, expected {W * H * 2}")
    e = np.fromfile(os.path.join(out_dir, "elev.i16"), "<i2")
    if not (-9000 < e.min() <= e.max() < 22000):
        errs.append(f"implausible elevations {e.min()}..{e.max()}")
    if [int(e.min()), int(e.max())] != m["elevRange"]:
        errs.append("elevRange does not match elev.i16")
    if Image.open(os.path.join(out_dir, "slope.png")).size != (W, H):
        errs.append("slope.png size != grid")
    if list(Image.open(os.path.join(out_dir, "visible.jpg")).size) != m["visibleSize"]:
        errs.append("visible.jpg size != meta.visibleSize")
    for n in ("visible.jpg", "thermal.jpg"):
        if max(Image.open(os.path.join(out_dir, n)).size) > 2048:
            errs.append(f"{n} larger than 2048 px")
    pois = json.load(open(os.path.join(out_dir, "pois.json"), encoding="utf-8"))
    for p in pois:
        if not (m["lon"][0] <= p["lon"] <= m["lon"][1] and m["lat"][0] <= p["lat"] <= m["lat"][1]):
            errs.append(f"POI {p['id']} outside bounds")
    for s in m["sources"]:
        if not s.get("url") and not m.get("synthetic"):
            errs.append(f"source {s['layer']} has no url")
    total = sum(os.path.getsize(os.path.join(out_dir, n)) for n in need) / 1e6
    if total > MAX_TOTAL_MB:
        errs.append(f"total {total:.1f} MB > {MAX_TOTAL_MB} MB")
    log(f"check: {W}x{H}, {len(pois)} POIs, total {total:.2f} MB, elevation {e.min()}..{e.max()} m"
        + (", SYNTHETIC" if m.get("synthetic") else ""))
    return errs


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("region", help="region id: reads data/regions/<id>.json")
    ap.add_argument("--dem", choices=["msl", "hrsc"], default="msl", help="msl = 1 m MSL Gale DEM (default), hrsc = 200 m global fallback")
    ap.add_argument("--out", help="output folder (default web/public/data/<id>)")
    ap.add_argument("--synthetic", action="store_true", help="fake inputs, no network: tests the export only")
    ap.add_argument("--check", action="store_true", help="only validate an existing output folder")
    a = ap.parse_args()
    cfg = json.load(open(os.path.join(ROOT, "data", "regions", a.region + ".json"), encoding="utf-8"))
    out_dir = a.out or os.path.join(ROOT, "web", "public", "data", cfg["id"])
    if not a.check:
        W, H, cx, cy = region_grid(cfg)
        log(f"region {cfg['id']}: {W}x{H} cells of {cx:.1f} x {cy:.1f} m → {out_dir}")
        raw = fetch_synthetic(cfg) if a.synthetic else fetch_real(cfg, a.dem)
        export(cfg, raw, out_dir)
    errs = check(out_dir)
    if errs:
        for e in errs:
            log("FAIL:", e)
        sys.exit(1)
    log("OK")


if __name__ == "__main__":
    main()
