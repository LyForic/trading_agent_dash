import { useEffect, useRef } from 'react';

interface SpriteAnimatorProps {
  src: string;
  frameCount: number;
  fps: number;
  className?: string;
}

export function SpriteAnimator({ src, frameCount, fps, className }: SpriteAnimatorProps) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const sheetRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let frame = 0;
    let timer: number | undefined;

    const renderFrame = (nextFrame: number) => {
      frame = nextFrame;
      if (viewportRef.current) {
        viewportRef.current.dataset.frame = String(frame);
        viewportRef.current.parentElement?.setAttribute('data-frame', String(frame));
      }
      if (sheetRef.current) {
        sheetRef.current.style.transform = `translate3d(-${frame * (100 / frameCount)}%, 0, 0)`;
      }
    };

    const stop = () => {
      if (timer === undefined) return;
      window.clearInterval(timer);
      timer = undefined;
    };

    const sync = () => {
      stop();
      renderFrame(0);
      if (prefersReducedMotion() || frameCount <= 1 || fps <= 0) return;
      timer = window.setInterval(() => {
        renderFrame((frame + 1) % frameCount);
      }, 1000 / fps);
    };

    const media = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    media?.addEventListener('change', sync);
    sync();

    return () => {
      stop();
      media?.removeEventListener('change', sync);
    };
  }, [fps, frameCount, src]);

  return (
    <span ref={viewportRef} className={`sprite-animator ${className ?? ''}`} data-frame="0">
      <img
        ref={sheetRef}
        src={src}
        alt=""
        draggable={false}
        className="sprite-animator__sheet"
        style={{
          width: `${frameCount * 100}%`,
          transform: 'translate3d(-0%, 0, 0)',
        }}
      />
    </span>
  );
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
