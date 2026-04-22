import { useEffect } from 'react';

/**
 * Fixed world behind all content. Current scope (post-Phase-3 revert):
 *
 *   1. Base color — reads --world-bg (daytime cream, dusk indigo, moonlit navy)
 *   2. Wood-plank texture — barely-visible horizontal banding
 *   3. Window — top-right, gradient + stars (dusk/moonlit) + moon (moonlit)
 *   4. Lamp glow — bottom-right amber radial, dusk/moonlit only
 *
 * Deliberately minimal. The full "cozy Stardew interior" requires drawn
 * room backgrounds (960×540 PNG per agent) which are out-of-scope for
 * Claude Code to generate. Those land in Phase 3.1 once Brandon's
 * PixelLab work or commissioned art delivers. At that point this layer
 * gets one additional element — a fixed background image crossfaded per
 * body[data-room]; the time-of-day tokens become tint overlays instead
 * of bg replacements.
 *
 * Until then, this scaffolding gives "evening room with a window and a
 * lamp" without pretending to be three distinct rooms.
 */
export function WorldLayer() {
  useEffect(() => {
    const onVisibility = () => {
      document.body.classList.toggle('tab-hidden', document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none overflow-hidden"
    >
      {/* Base color layer */}
      <div
        className="absolute inset-0 transition-colors duration-300"
        style={{ backgroundColor: 'var(--world-bg)' }}
      />

      {/* Wood-plank texture — horizontal repeating gradient, very low opacity.
          Gives the world a surface feel without being a literal wood image. */}
      <div
        className="gym-wood absolute inset-0 transition-opacity duration-300"
        style={{
          backgroundImage: `repeating-linear-gradient(
            0deg,
            transparent 0 72px,
            rgba(120, 80, 40, 0.14) 72px 74px,
            transparent 74px 148px,
            rgba(120, 80, 40, 0.07) 148px 150px
          )`,
          mixBlendMode: 'overlay',
        }}
      />

      {/* Window — top right. Inner glass gradient + cross panes + stars.
          Visible only in dusk and moonlit (daytime we're facing away).
          Will be replaced with a weather-reactive component in Phase 4. */}
      <div
        className="gym-window absolute top-24 right-6 w-28 h-36 transition-opacity duration-300"
        style={{ imageRendering: 'pixelated' }}
      >
        <div
          className="absolute inset-0 rounded-sm"
          style={{
            border: '4px solid hsl(28 35% 22%)',
            boxShadow:
              '0 3px 0 hsl(28 35% 16%), inset 0 0 0 1px hsl(28 35% 35%)',
          }}
        />
        <div className="gym-window-pane absolute inset-1 overflow-hidden">
          <div
            className="absolute left-0 right-0"
            style={{
              top: 'calc(50% - 1.5px)',
              height: '3px',
              backgroundColor: 'hsl(28 35% 22%)',
            }}
          />
          <div
            className="absolute top-0 bottom-0"
            style={{
              left: 'calc(50% - 1.5px)',
              width: '3px',
              backgroundColor: 'hsl(28 35% 22%)',
            }}
          />
          {[
            { top: '12%', left: '22%' },
            { top: '18%', left: '70%' },
            { top: '28%', left: '40%' },
            { top: '35%', left: '82%' },
            { top: '40%', left: '15%' },
          ].map((s, i) => (
            <span
              key={i}
              className="gym-star absolute"
              style={{
                top: s.top,
                left: s.left,
                width: '2px',
                height: '2px',
              }}
            />
          ))}
          <span
            className="gym-moon absolute transition-opacity duration-300"
            style={{
              top: '14%',
              right: '18%',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 35% 35%, hsl(48 80% 92%) 0%, hsl(48 50% 75%) 70%, transparent 100%)',
              boxShadow: '0 0 8px rgba(220, 220, 255, 0.4)',
            }}
          />
        </div>
      </div>

      {/* Lamp glow — bottom-right radial amber */}
      <div
        className="gym-lamp-glow absolute transition-opacity duration-300"
        style={{
          bottom: '-10%',
          right: '-10%',
          width: '60vh',
          height: '60vh',
          background:
            'radial-gradient(circle at 65% 65%, color-mix(in srgb, var(--color-metheus) 50%, transparent) 0%, color-mix(in srgb, var(--color-metheus) 12%, transparent) 40%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
