import { battleMomentum } from '@/lib/battleProjection';
import type { OpenPosition } from '@/lib/types';

interface Props {
  entryPriceCents: number;
  currentPriceCents: number;
  side: OpenPosition['side'];
}

export function TugOfWarBar({ entryPriceCents, currentPriceCents, side }: Props) {
  const momentum = battleMomentum(entryPriceCents, currentPriceCents, side);
  const fillColor = momentum.favorsAgent ? 'var(--color-gain)' : 'var(--color-loss)';
  const transform =
    momentum.direction === 'center'
      ? 'translateX(0%) scaleX(0)'
      : `translateX(${momentum.direction === 'right' ? '0%' : '-100%'}) scaleX(${momentum.magnitude.toFixed(3)})`;

  return (
    <div
      className="battle-tug-bar"
      role="meter"
      aria-label="Battle momentum against entry price"
      aria-valuemin={-50}
      aria-valuemax={50}
      aria-valuenow={momentum.deltaCents}
    >
      <div className="battle-tug-center" aria-hidden />
      <div
        data-testid="battle-tug-fill"
        data-direction={momentum.direction}
        data-favors-agent={momentum.favorsAgent ? 'true' : 'false'}
        className="battle-tug-fill"
        style={{
          backgroundColor: momentum.direction === 'center' ? 'transparent' : fillColor,
          transformOrigin: momentum.direction === 'left' ? 'right' : 'left',
          transform,
        }}
      />
    </div>
  );
}
