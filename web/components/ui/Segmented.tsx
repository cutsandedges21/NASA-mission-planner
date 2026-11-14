'use client';

// Segmented pill control: dark track, lighter active segment (design ref #3).
export default function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={`inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-black/40 p-0.5 text-xs font-medium ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-full px-3 py-1.5 transition ${value === o.value ? 'bg-white/15 text-white shadow-inner' : 'text-zinc-400 hover:text-white'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
