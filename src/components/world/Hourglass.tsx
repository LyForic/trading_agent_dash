/**
 * Metheus's desk prop. An hourglass visualizes his staleness-exploitation
 * edge — his alpha is in the slow drift when market pricing hasn't caught
 * up yet. Sand trickles down slowly (30s loop). Placeholder fidelity for
 * V1; a commissioned pixel-art version can replace this.
 *
 * Visibility: scoped via body[data-room="metheus"] in globals.css. When
 * Metheus moves from "arriving_soon" to live (Justin's schema lands),
 * the hourglass still reads as "the long-arc agent's space" so the
 * visual identity persists across data states.
 */
export function Hourglass() {
  return (
    <div
      className="gym-hourglass absolute top-28 left-6 w-20 h-24 transition-opacity duration-500"
      style={{ imageRendering: 'pixelated' }}
      aria-hidden
    >
      <svg viewBox="0 0 60 80" className="w-full h-full">
        {/* Wooden frame */}
        <path
          d="M 10 6 L 50 6 L 50 10 L 10 10 Z"
          fill="hsl(28 35% 22%)"
          stroke="hsl(28 35% 14%)"
          strokeWidth="1"
        />
        <path
          d="M 10 70 L 50 70 L 50 74 L 10 74 Z"
          fill="hsl(28 35% 22%)"
          stroke="hsl(28 35% 14%)"
          strokeWidth="1"
        />
        {/* Side posts */}
        <line x1="12" y1="10" x2="12" y2="70" stroke="hsl(28 35% 30%)" strokeWidth="2" />
        <line x1="48" y1="10" x2="48" y2="70" stroke="hsl(28 35% 30%)" strokeWidth="2" />

        {/* Glass outline — figure-8 shape */}
        <path
          d="M 18 12 L 42 12 L 28 38 L 42 66 L 18 66 L 32 38 Z"
          fill="hsl(42 40% 90%)"
          fillOpacity="0.15"
          stroke="hsl(42 60% 80%)"
          strokeWidth="1"
        />

        {/* Upper sand — shrinks from full over 30s */}
        <path
          className="gym-hourglass-upper"
          d="M 20 14 L 40 14 L 30 36 Z"
          fill="hsl(35 75% 55%)"
        />
        {/* Lower sand — grows over 30s */}
        <path
          className="gym-hourglass-lower"
          d="M 30 40 L 40 64 L 20 64 Z"
          fill="hsl(35 75% 55%)"
          opacity="0.9"
        />
        {/* Sand stream in the middle */}
        <line
          x1="30"
          y1="37"
          x2="30"
          y2="42"
          stroke="hsl(35 75% 55%)"
          strokeWidth="1.5"
          className="gym-hourglass-stream"
        />

        {/* Label */}
        <text
          x="30"
          y="80"
          fontSize="6"
          textAnchor="middle"
          fill="hsl(25 25% 18%)"
          fontFamily="monospace"
        >
          STALENESS
        </text>
      </svg>
    </div>
  );
}
