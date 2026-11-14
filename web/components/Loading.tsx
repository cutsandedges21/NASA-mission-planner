// Loading screen, 1:1 with the planet-horizon reference (cosmos_907814177): deep night sky, a planet's
// glowing limb across the bottom, small mono greeting + bold name centred, a thin vertical line down to the
// horizon and a time label on it. Rendered while the planner's JavaScript loads (server-safe, no hooks).
export default function Loading() {
  return (
    <div className="ld">
      <div className="ld-sky" />
      <div className="ld-planet" />
      <div className="ld-copy">
        <div className="ld-hi">Preparing your EVA</div>
        <div className="ld-name">Gale Crater, Mars</div>
        <div className="ld-line" />
        <div className="ld-time">Loading NASA terrain…</div>
      </div>
    </div>
  );
}
