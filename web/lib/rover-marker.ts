// DOM element for the simulated astronaut on the map. Plain Tailwind classes (no globals.css edits),
// so the visual pass can restyle it freely.
export function createAstronautMarker(color = '#fb923c'): HTMLElement {
  const el = document.createElement('div');
  el.className = 'pointer-events-none relative h-6 w-6';
  el.innerHTML =
    `<span class="absolute inset-0 animate-ping rounded-full opacity-50" style="background:${color}"></span>` +
    `<span class="absolute inset-[5px] rounded-full border-2 border-white shadow-[0_0_14px_rgba(255,255,255,0.7)]" style="background:${color}"></span>`;
  return el;
}
