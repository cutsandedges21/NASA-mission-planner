'use client';
// The "+" form for a new bookmark: a name and coordinates (typed, or picked on the map when the
// planner offers it). Used on the landing page and in the planner's Quick targets.
import { useState } from 'react';
import { addBookmark, parseCoords, type Bookmark } from '@/lib/bookmarks';

export default function AddBookmark({
  onDone,
  onPickOnMap,
  initial,
  dark = true,
}: {
  onDone: (b: Bookmark | null) => void;
  /** Offer "pick on the map" (planner only). */
  onPickOnMap?: () => void;
  /** Pre-filled coordinates, e.g. from a map click. */
  initial?: [number, number] | null;
  dark?: boolean;
}) {
  const [name, setName] = useState('');
  const [coords, setCoords] = useState(initial ? `${initial[1].toFixed(5)}, ${initial[0].toFixed(5)}` : '');
  const parsed = parseCoords(coords);
  const bad = coords.trim() !== '' && !parsed;

  const save = () => {
    if (!parsed) return;
    onDone(addBookmark(name, parsed[0], parsed[1]));
  };

  return (
    <form
      className={`bm-form ${dark ? '' : 'bm-form-light'}`}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label className="bm-k" htmlFor="bm-name">Name</label>
      <input id="bm-name" className="bm-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Habitat site B" maxLength={40} autoFocus />
      <label className="bm-k" htmlFor="bm-coords">Coordinates (lat, lon)</label>
      <input
        id="bm-coords"
        className={`bm-in ${bad ? 'bm-bad' : ''}`}
        value={coords}
        onChange={(e) => setCoords(e.target.value)}
        placeholder="-4.6627, 137.3775   or   4.66 S 137.38 E"
        inputMode="decimal"
      />
      <p className="bm-hint">{bad ? 'Type latitude then longitude, e.g. -4.66, 137.38' : 'Planetocentric degrees; longitude 0–360 °E or −180–180.'}</p>
      <div className="bm-row">
        {onPickOnMap && (
          <button type="button" className="bm-btn bm-ghost" onClick={onPickOnMap}>
            Pick on the map
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className="bm-btn bm-ghost" onClick={() => onDone(null)}>
          Cancel
        </button>
        <button type="submit" className="bm-btn" disabled={!parsed}>
          Save
        </button>
      </div>
    </form>
  );
}
