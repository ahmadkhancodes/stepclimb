/** Version distance as four flat steps: navy-ink fill for what is covered, amber for the majors you are behind. */
export function RunwayBar({ behind, steps = 4 }: { behind: number; steps?: number }) {
  const late = Math.min(steps, Math.max(0, behind));
  const label = late === 0 ? "Current" : `${late} ${late === 1 ? "major" : "majors"} behind`;
  return (
    <svg width={steps * 14 - 2} height="8" role="img" aria-label={label} className="block shrink-0">
      {Array.from({ length: steps }, (_, i) => (
        <rect key={i} x={i * 14} y="0" width="12" height="8" className={i < steps - late ? "fill-action" : "fill-amber"} />
      ))}
    </svg>
  );
}
