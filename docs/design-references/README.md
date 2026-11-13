# Design references (from Moss, Fri 13 Nov)

**Build first, style later.** These guide the polish pass (T-16, Saturday afternoon). Don't restyle anything before Tier 1 works.

## Files
- `cosmos_*.webp`: 7 reference images (described below)
- `cosmos_1151528239.mp4`: 57 s Figma tutorial (portrait). Only seconds 0–8 show the result. The rest is build steps.
- `video-key-frame-effect.jpg`: the finished effect in 3 states (kept from the video)
- `video-key-frame-spec.jpg`: the Figma sizes (kept). All other extracted frames were deleted to save space.

## What the video shows: expanding "pill card" gallery
- A row of 5 tall cards with fully rounded ends: **170 × 582 px, corner radius 102**, image fill, clipped.
- The active/hovered card **widens to 466 px** (the others stay 170) and reveals a title + 2-line description over the image.
- The **whole page background colour changes to match the active card** (teal → purple → orange…), using Figma Smart Animate.
- **Where it fits our app:** the science-site picker. One pill per POI (Yellowknife Bay, Pahrump Hills, Vera Rubin Ridge, Glen Torridon, Woodland Bay) with a real NASA rover photo. Hovering expands it to show "why it matters". It could also work as the SAFE / FAST / SCIENCE route chooser, with the UI accent tinting to the route colour.

## Visual direction across the 6 images
1. **Near-black canvas** (#07–#0c), starfield specks, and **a planet glowing on its horizon**: an atmosphere arc or eclipse-style white halo behind a dark globe. Use this for the landing / intro (Mars rising at the bottom, glow on the limb).
2. **Floating dark glass panels** with big radii (16–28 px), thin 1 px light borders, blur. Already roughly what `.panel` does.
3. **Segmented pill controls** (dark track, lighter active segment) for toggles like 2D/3D, layers, Genres/Moods-style tabs.
4. **One bright accent** used sparingly on active states: gold/yellow (#f5c84b-ish) in one reference, white in others. For us: Mars orange or gold for active, keeping green/amber/violet for the three routes.
5. **Dot-matrix numerals** for big stats (EVA time, O₂ %). The "data instrument" feel.
6. **Huge vertical type** ("MARS" set letter by letter) beside a half-visible planet: an onboarding / hero idea.
7. **"Flight to Mars" hero** (`cosmos_718343697.webp`): big Mars on the right with thin orbit rings and **callout labels pinned to the planet** by dotted lines ("Diameter 6,800 km", "72 F to -271 F", "Two small moons"), a large bold title left, and a **countdown in big digits** (days / hours / min / sec). For us: label the terrain with live callouts (slope, O₂ at this point, distance), and a big "EVA ends in 1:42:10 / sunset in…" countdown in the simulation.
8. **Compact control card** docked bottom-centre over a full-bleed globe/map (radio-globe reference). Good layout for phones: map full screen, one card at the bottom.

## Not to copy
References are for mood and patterns. Don't copy any one design wholesale, and don't use their brand marks or photos. Use real NASA imagery (rover photos, HiRISE) in place of their pictures.
