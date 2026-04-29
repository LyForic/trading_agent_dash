/**
 * Plaza lantern brightness modulation. Per `2026-04-21-design.md` §2.1
 * (ambient motion includes lamp flicker) + `2026-04-23-town-square-art-brief.md`
 * line 171 ("Code will modulate its brightness by total P&L"), the lamp
 * is a diegetic live-status indicator: brighter on portfolio gain,
 * dimmer on loss.
 *
 * Curve: linear, symmetric around 1.0, ±0.20 swing across a ±$100 cap.
 * Beyond ±$100 the value clamps so an outsized day doesn't blow out.
 * Non-finite inputs return baseline 1.0 (defensive — should not occur
 * in practice since `agent.total_pnl` is always a number, but isolates
 * the lamp from any future data corruption).
 *
 * Composes with the existing dusk/moonlit opacity rules and the
 * `lamp-flicker-*` keyframes via CSS `filter: brightness(...)` —
 * effective intensity ≈ opacity × brightness.
 */
export const LAMP_PNL_CAP = 100;
export const LAMP_BRIGHTNESS_RANGE = 0.2;

export function lampBrightnessScalar(totalPnl: number): number {
  if (!Number.isFinite(totalPnl)) return 1;
  const normalized = Math.max(-1, Math.min(1, totalPnl / LAMP_PNL_CAP));
  return 1 + normalized * LAMP_BRIGHTNESS_RANGE;
}
