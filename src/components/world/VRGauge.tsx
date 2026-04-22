/**
 * Apex's desk prop. A small dial showing current Variance Ratio —
 * his actual trade trigger. Idles below 1.2 (drought), glows orange
 * when VR crosses the threshold (Apex wakes up). For V1 this renders
 * a static gauge with the needle at ~0.7 (current market state per
 * the mock). Phase 4+ can wire live VR from a Supabase read.
 *
 * Visibility: only rendered visible when body[data-room="apex"]
 * (see globals.css). Fixed-position behind content, at top-left.
 */
export function VRGauge() {
  const vrValue = 0.7;              // mock; wire to real telemetry later
  const threshold = 1.2;            // Apex's trade-trigger threshold
  const maxDisplayed = 2.0;
  // Map VR value (0→2) to needle angle (-90° left → +90° right).
  const needleAngle = (vrValue / maxDisplayed) * 180 - 90;
  const armed = vrValue >= threshold;

  return (
    <div
      className="gym-vr-gauge absolute top-28 left-6 w-20 h-20 transition-opacity duration-500"
      style={{ imageRendering: 'pixelated' }}
      aria-hidden
    >
      <svg viewBox="0 0 80 80" className="w-full h-full">
        {/* Wooden backing disc */}
        <circle cx="40" cy="40" r="38" fill="hsl(28 35% 22%)" stroke="hsl(28 35% 12%)" strokeWidth="2" />
        <circle cx="40" cy="40" r="32" fill="hsl(36 33% 92%)" stroke="hsl(28 35% 35%)" strokeWidth="1" />

        {/* Tick marks around the dial */}
        {Array.from({ length: 11 }).map((_, i) => {
          const angle = (i / 10) * 180 - 90;
          const rad = (angle * Math.PI) / 180;
          const x1 = 40 + Math.cos(rad) * 26;
          const y1 = 40 + Math.sin(rad) * 26;
          const x2 = 40 + Math.cos(rad) * 30;
          const y2 = 40 + Math.sin(rad) * 30;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(25 25% 18%)" strokeWidth="1" />;
        })}

        {/* Trigger-zone arc — at VR 1.2 and beyond, shaded Apex-blue */}
        {(() => {
          const startAngle = (threshold / maxDisplayed) * 180 - 90;
          const startRad = (startAngle * Math.PI) / 180;
          const sx = 40 + Math.cos(startRad) * 30;
          const sy = 40 + Math.sin(startRad) * 30;
          const ex = 40 + Math.cos((90 * Math.PI) / 180) * 30;
          const ey = 40 + Math.sin((90 * Math.PI) / 180) * 30;
          return (
            <path
              d={`M ${sx} ${sy} A 30 30 0 0 1 ${ex} ${ey}`}
              stroke="hsl(200 68% 54%)"
              strokeWidth="3"
              fill="none"
              opacity="0.6"
            />
          );
        })()}

        {/* Needle */}
        <line
          x1="40"
          y1="40"
          x2={40 + Math.cos((needleAngle * Math.PI) / 180) * 24}
          y2={40 + Math.sin((needleAngle * Math.PI) / 180) * 24}
          stroke={armed ? 'hsl(25 85% 50%)' : 'hsl(25 25% 18%)'}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="40" cy="40" r="3" fill="hsl(28 35% 22%)" />

        {/* "VR" label */}
        <text x="40" y="60" fontSize="7" textAnchor="middle" fill="hsl(25 25% 18%)" fontFamily="monospace">
          VR {vrValue.toFixed(1)}
        </text>
      </svg>
    </div>
  );
}
