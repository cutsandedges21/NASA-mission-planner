// Dot-matrix numerals for big instrument readouts (design ref: "data instrument" feel).
// Pure SVG, no font download, scales with its height.

const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['0', '0', '1', '0', '1', '0', '0'],
  '.': ['0', '0', '0', '0', '0', '1', '1'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '°': ['01100', '10010', '10010', '01100', '0', '0', '0'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ' ': ['000', '000', '000', '000', '000', '000', '000'],
};

/** Renders `text` (digits : . % ° - space) as glowing dots. `height` is the pixel height of the glyphs. */
export default function DotNum({
  text,
  height = 28,
  color = '#f4f4f5',
  dim = 'rgb(255 255 255 / 0.07)',
  className = '',
  label,
}: {
  text: string;
  height?: number;
  color?: string;
  dim?: string;
  className?: string;
  label?: string;
}) {
  const pitch = 10; // svg units per dot
  const r = 3.6;
  let x = 0;
  const dots: React.ReactNode[] = [];
  [...text].forEach((ch, ci) => {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    const w = g[0].length;
    g.forEach((row, y) => {
      for (let i = 0; i < w; i++) {
        const on = row[i] === '1';
        if (!on && w <= 1) continue;
        dots.push(<circle key={`${ci}-${y}-${i}`} cx={(x + i) * pitch + pitch / 2} cy={y * pitch + pitch / 2} r={r} fill={on ? color : dim} />);
      }
    });
    x += w + 1;
  });
  const W = Math.max(1, x - 1) * pitch;
  const H = 7 * pitch;
  return (
    <svg
      role="img"
      aria-label={label ?? text}
      viewBox={`0 0 ${W} ${H}`}
      height={height}
      width={(height * W) / H}
      className={className}
      style={{ filter: `drop-shadow(0 0 4px ${color}55)` }}
    >
      {dots}
    </svg>
  );
}
