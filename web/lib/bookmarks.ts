'use client';
// Bookmarks: places on Mars the user saves to come back to later ("Google Maps for Mars").
// Shown on the landing page (Choose a target) and as Quick targets in the planner. Stored in this
// browser only (localStorage), shared by every component through one tiny store.
import { useSyncExternalStore } from 'react';

export type Bookmark = { id: string; name: string; lon: number; lat: number };

const KEY = 'eva-planner-bookmarks-v1';
const EMPTY: Bookmark[] = [];
let cache: Bookmark[] | null = null;
const listeners = new Set<() => void>();

function read(): Bookmark[] {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(raw)
      ? raw.filter((b) => b && typeof b.name === 'string' && Number.isFinite(b.lon) && Number.isFinite(b.lat))
      : [];
  } catch {
    cache = [];
  }
  return cache!;
}

function write(list: Bookmark[]) {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* private window / storage blocked: keep them for this visit only */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      l();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener('storage', onStorage);
  };
}

/** All bookmarks, re-rendering when any component adds or removes one. */
export function useBookmarks(): Bookmark[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Normalise longitude to −180…180 (MapLibre) and validate. Returns null when out of range. */
export function normalise(lon: number, lat: number): [number, number] | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lat < -90 || lat > 90) return null;
  const l = ((((lon + 180) % 360) + 360) % 360) - 180;
  return [Math.round(l * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];
}

export function addBookmark(name: string, lon: number, lat: number): Bookmark | null {
  const p = normalise(lon, lat);
  if (!p) return null;
  const b: Bookmark = { id: `bm-${Date.now().toString(36)}`, name: name.trim() || fmtCoord(p[0], p[1]), lon: p[0], lat: p[1] };
  write([...read(), b]);
  return b;
}

export function removeBookmark(id: string) {
  write(read().filter((b) => b.id !== id));
}

/** "4.5895° S, 137.4417° E" (planetocentric, east-positive 0–360 like NASA Trek). */
export function fmtCoord(lon: number, lat: number) {
  return `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}, ${(((lon % 360) + 360) % 360).toFixed(4)}° E`;
}

/**
 * Parse what people type: "−4.59, 137.44", "4.59 S 137.44 E", "137.44E -4.59" … Latitude first unless the
 * letters say otherwise; longitudes may be 0–360 °E or −180–180. Returns [lon, lat] or null.
 */
export function parseCoords(text: string): [number, number] | null {
  const t = text.trim().toUpperCase().replace(/[°,;]/g, ' ');
  const parts = [...t.matchAll(/([+-−]?\d+(?:\.\d+)?)\s*([NSEW])?/g)].map((m) => ({ v: parseFloat(m[1].replace('−', '-')), h: m[2] }));
  if (parts.length !== 2) return null;
  let lat: number | null = null, lon: number | null = null;
  for (const p of parts) {
    if (p.h === 'N' || p.h === 'S') lat = p.h === 'S' ? -Math.abs(p.v) : Math.abs(p.v);
    else if (p.h === 'E' || p.h === 'W') lon = p.h === 'W' ? -Math.abs(p.v) : Math.abs(p.v);
  }
  if (lat === null && lon === null) [lat, lon] = [parts[0].v, parts[1].v];
  else if (lat === null) lat = parts.find((p) => !p.h || p.h === 'N' || p.h === 'S')!.v;
  else if (lon === null) lon = parts.find((p) => !p.h || p.h === 'E' || p.h === 'W')!.v;
  return normalise(lon!, lat!);
}
