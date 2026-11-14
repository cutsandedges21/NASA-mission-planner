// Loading screen on the planet-horizon reference (cosmos_907814177): night sky, a planet's glowing limb
// across the bottom, small mono line + bold name centred, a thin line down to the horizon with the status.
// Used twice: as the JS-chunk fallback (no props) and over the planner until the NASA data has loaded.
export default function Loading({ out = false, status = 'Loading NASA terrain…' }: { out?: boolean; status?: string }) {
  return (
    <div className={`ld ${out ? 'ld-out' : ''}`} aria-hidden={out}>
      <div className="ld-sky" />
      <div className="ld-planet" />
      <div className="ld-copy">
        <div className="ld-hi">Preparing your EVA</div>
        <div className="ld-name">Gale Crater, Mars</div>
        <div className="ld-line" />
        <div className="ld-time">{status}</div>
      </div>
    </div>
  );
}
