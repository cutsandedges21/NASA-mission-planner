"""Dust-storm climatology over our Gale region, from the Mars Dust Activity Database (T-35 part c).

Source: Battalio, M. & Wang, H. (2021) "The Mars Dust Activity Database (MDAD): A comprehensive
statistical study of dust storm sequences", Icarus 354, 114059. Data: Harvard Dataverse
doi:10.7910/DVN/F8R2JX (file MDAD.tab, CC0 1.0). Storms mapped by hand on MGS MOC and MRO MARCI
Mars Daily Global Maps, Mars Years 24-32 (8 Mars years).

Each MDAD row is one storm on one sol: centroid lon/lat, area (km²), min/max latitude. We count a
storm as "over the region" on that sol if the region's centre lies inside the storm's latitude range
and within the radius of a circle of the same area around the centroid (MDAD gives outlines only as
area + extent, so this is an approximation). Per 30° Ls bin:
    p = sols with at least one storm over the region / sols in the record
split into local (< 1.6e6 km², the MDAD/Cantor size class) and regional-or-larger storms.

Run from the repo root:  PYTHONUTF8=1 python data/dust_gale.py   (downloads MDAD.tab to data-cache/, 2.4 MB)
Output: web/public/data/gale/dust.json
"""
import csv
import json
import math
import os
import urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'data-cache', 'MDAD.tab')
URL = 'https://dataverse.harvard.edu/api/access/datafile/3607412?format=original'
OUT = os.path.join(ROOT, 'web', 'public', 'data', 'gale', 'dust.json')
META = os.path.join(ROOT, 'web', 'public', 'data', 'gale', 'meta.json')
R_MARS_KM = 3389.5
LOCAL_MAX_KM2 = 1.6e6
BIN = 30


def great_circle_km(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    c = math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dl)
    return R_MARS_KM * math.acos(max(-1.0, min(1.0, c)))


def main():
    if not os.path.exists(CACHE):
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        print('downloading MDAD.tab ...')
        urllib.request.urlretrieve(URL, CACHE)
    meta = json.load(open(META, encoding='utf8'))
    lon = (meta['lon'][0] + meta['lon'][1]) / 2
    lat = (meta['lat'][0] + meta['lat'][1]) / 2
    lon180 = lon - 360 if lon > 180 else lon

    sols = {}                     # (MY, subphase, sol) -> Ls
    hit = defaultdict(set)        # (MY, subphase, sol) -> {'local', 'regional'}
    rows = 0
    with open(CACHE, encoding='utf8', newline='') as f:
        for r in csv.DictReader(f):
            rows += 1
            key = (r['Mars Year'].strip(), r['Mission subphase'].strip(), r['Sol'].strip())
            ls = float(r['Ls'])
            sols[key] = ls
            area = float(r['Area (square km)'])
            clon, clat = float(r['Centroid longitude']), float(r['Centroid latitude'])
            lo, hi = float(r['Minimum latitude']), float(r['Maximum latitude'])
            if not (lo <= lat <= hi):
                continue
            if great_circle_km(clon, clat, lon180, lat) <= math.sqrt(area / math.pi):
                hit[key].add('local' if area < LOCAL_MAX_KM2 else 'regional')

    bins = []
    for b in range(0, 360, BIN):
        keys = [k for k, ls in sols.items() if b <= ls % 360 < b + BIN]
        n = len(keys)
        any_ = sum(1 for k in keys if hit.get(k))
        reg = sum(1 for k in keys if 'regional' in hit.get(k, ()))
        bins.append({
            'ls': [b, b + BIN], 'sols': n, 'solsWithStorm': any_, 'solsWithRegional': reg,
            'p': round(any_ / n, 4) if n else None,
            'pRegional': round(reg / n, 4) if n else None,
        })
    years = sorted({k[0] for k in sols})
    out = {
        'source': 'Mars Dust Activity Database (MDAD), Battalio & Wang 2021, Icarus 354, 114059; '
                  'Harvard Dataverse doi:10.7910/DVN/F8R2JX (CC0). MGS MOC + MRO MARCI daily global maps.',
        'region': {'lon': round(lon, 3), 'lat': round(lat, 3)},
        'marsYears': years, 'rows': rows, 'solsInRecord': len(sols), 'binDeg': BIN,
        'localMaxKm2': LOCAL_MAX_KM2,
        'method': 'A storm counts as over the region on a sol if the region centre is inside its latitude range and within '
                  'the radius of a circle of the same area around its centroid. p = sols with a storm over the region / sols in the record. '
                  'Sols on which MDAD lists no storm anywhere are missing from the record (p slightly high). During planet-encircling '
                  'storms (MY 25, MY 28) storm edges cannot be mapped, so those weeks are undercounted (p low in Ls 180-300).',
        'bins': bins,
    }
    json.dump(out, open(OUT, 'w', encoding='utf8'), indent=1)
    print(f'{rows} rows, {len(sols)} sols, MY {years[0]}-{years[-1]} -> {OUT}')
    for b in bins:
        print(f"  Ls {b['ls'][0]:3d}-{b['ls'][1]:3d}: {b['solsWithStorm']:3d}/{b['sols']:4d} sols  p={b['p']}  regional={b['pRegional']}")


if __name__ == '__main__':
    main()
