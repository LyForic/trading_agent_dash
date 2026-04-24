import { AnimatePresence, motion } from 'framer-motion';

/**
 * First-visit plaza onboarding. Gated on `localStorage.plazaOnboarded` —
 * once dismissed, never shown again. Kept short: a welcome line, a tiny
 * "how to navigate" hint, one dismiss button. Peer review consensus
 * was to avoid a full tutorial screen — there are no controls to learn,
 * just tap destinations.
 */
export function WelcomeModal({
  show,
  onDismiss,
}: {
  show: boolean;
  onDismiss: () => void;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="welcome-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="welcome-backdrop"
          onClick={onDismiss}
        >
          <motion.div
            key="welcome-card"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.3, ease: 'easeOut', delay: 0.05 }}
            className="welcome-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="welcome-card-eyebrow">The Lyforic Plaza</div>
            <h2 className="welcome-card-title">Welcome to the Trading Gym</h2>
            <p className="welcome-card-body">
              Three trading agents live here — each in their own house. Tap a
              house to drop in on that agent and see what they're trading,
              how they're doing, and whether they're winning or losing.
            </p>
            <p className="welcome-card-body welcome-card-body-muted">
              Tap the <strong>Trading Gym</strong> up top for the communal
              roster across all agents.
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="welcome-card-cta"
            >
              Start exploring →
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
