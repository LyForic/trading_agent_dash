import { useEffect } from 'react';

/**
 * The fixed world behind all content. Four layered elements, each scoped
 * per mode via CSS selectors in globals.css:
 *
 *   1. Base color — reads --world-bg (daytime cream, dusk indigo, moonlit navy)
 *   2. Wood-plank texture — barely-visible horizontal banding, gives the
 *      world an implied surface (strongest in dusk/moonlit)
 *   3. Window — top-right, with stars and a moon (moonlit only); hidden
 *      entirely in daytime (we're indoors with the sun elsewhere)
 *   4. Lamp glow — bottom-right amber radial, gives dusk/moonlit the
 *      "someone's desk lamp is on" feel. Brighter in dusk, softer in
 *      moonlit (only ambient light left at 2am)
 *
 * Per spec §2.1 and R4's Phase 2 feedback: these placeholder atmospheric
 * elements should have landed with Phase 1. Pulling them in now so the
 * dashboard doesn't feel like a flat color dashboard while Phase 3/4
 * (per-room scroll swap, weather-live window) get built on top.
 *
 * All elements are inline CSS/SVG — no commissioned pixel art required.
 * Phase 4 will swap the window into a weather-reactive component; this
 * is scaffolding, not final art.
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
          Visible only in dusk and moonlit (daytime we're facing away). */}
      <div
        className="gym-window absolute top-24 right-6 w-28 h-36 transition-opacity duration-300"
        style={{ imageRendering: 'pixelated' }}
      >
        {/* Outer wooden frame */}
        <div
          className="absolute inset-0 rounded-sm"
          style={{
            border: '4px solid hsl(28 35% 22%)',
            boxShadow:
              '0 3px 0 hsl(28 35% 16%), inset 0 0 0 1px hsl(28 35% 35%)',
          }}
        />

        {/* Glass pane with mode-dependent gradient */}
        <div className="gym-window-pane absolute inset-1 overflow-hidden">
          {/* Cross-pane divider: horizontal */}
          <div
            className="absolute left-0 right-0"
            style={{
              top: 'calc(50% - 1.5px)',
              height: '3px',
              backgroundColor: 'hsl(28 35% 22%)',
            }}
          />
          {/* Cross-pane divider: vertical */}
          <div
            className="absolute top-0 bottom-0"
            style={{
              left: 'calc(50% - 1.5px)',
              width: '3px',
              backgroundColor: 'hsl(28 35% 22%)',
            }}
          />

          {/* Stars — low-opacity pixel dots. Positions chosen to sit in the
              4 window quadrants without bumping into the cross panes. */}
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

          {/* Moon — moonlit only, soft pale-blue disc in upper-right quadrant */}
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

      {/* Lamp glow — bottom-right radial amber. Amber hue ties to Metheus
          accent (the agent in whose "room" the lamp lives). */}
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
