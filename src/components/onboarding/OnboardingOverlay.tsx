import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { markOnboardingSeen } from './onboardingState';

interface Slide {
  id: string;
  src: string;
  /** Still shown while the video decodes; also the fallback if a browser can't play h264. */
  poster: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    id: 'roster-pnl',
    src: '/onboarding/roster-pnl.mp4',
    poster: '/onboarding-stills/roster-pnl/01-card-default.png',
    title: 'Three agents. One scoreboard.',
    body: 'Track each agent across 24h, 7d, or lifetime — the same numbers we read.',
  },
  {
    id: 'battle-arena',
    src: '/onboarding/battle-arena.mp4',
    poster: '/onboarding-stills/battle-arena/03-sheet-open.png',
    title: 'Watch live battles unfold.',
    body: 'Tap an open position to see entry, size, and the price arc — all on a 30-minute delay.',
  },
  {
    id: 'trade-log',
    src: '/onboarding/trade-log.mp4',
    poster: '/onboarding-stills/trade-log/01-log.png',
    title: 'Every trade, on the record.',
    body: 'Settled wins, losses, and open positions in one scrollable log. No cherry-picking.',
  },
  {
    id: 'time-of-day',
    src: '/onboarding/time-of-day.mp4',
    poster: '/onboarding-stills/time-of-day/03-moonlit.png',
    title: 'Set the gym’s mood.',
    body: 'Daytime, dusk, or moonlit — the world reflects your time of day.',
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function OnboardingOverlay({ open, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      } else if (e.key === 'ArrowRight') {
        next();
      } else if (e.key === 'ArrowLeft') {
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  // Restart the video when the slide changes.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = 0;
    void v.play().catch(() => {});
  }, [index, open]);

  function next() {
    if (isLast) {
      handleClose();
    } else {
      setIndex((i) => i + 1);
    }
  }

  function handleClose() {
    markOnboardingSeen();
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="onboarding-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <button
            type="button"
            className="onboarding-skip"
            onClick={handleClose}
            aria-label="Skip onboarding"
          >
            Skip
          </button>

          <div className="onboarding-stage">
            <AnimatePresence mode="wait">
              <motion.video
                key={slide.id}
                ref={videoRef}
                className="onboarding-video"
                src={slide.src}
                poster={slide.poster}
                autoPlay
                muted
                playsInline
                onEnded={next}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              />
            </AnimatePresence>

            <div className="onboarding-copy">
              <h2 id="onboarding-title" className="onboarding-title">
                {slide.title}
              </h2>
              <p className="onboarding-body">{slide.body}</p>
            </div>

            <div className="onboarding-controls">
              <div className="onboarding-dots" role="tablist" aria-label="Onboarding step">
                {SLIDES.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Step ${i + 1}: ${s.title}`}
                    className={`onboarding-dot${i === index ? ' onboarding-dot--active' : ''}`}
                    onClick={() => setIndex(i)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="onboarding-next"
                onClick={next}
                autoFocus
              >
                {isLast ? 'Enter the gym' : 'Next'}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
