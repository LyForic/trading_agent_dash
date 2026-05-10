import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GaleWeatherProvider } from '@/lib/galeWeatherContext';
import { TownSquarePage } from './pages/TownSquarePage';
import { GymPage } from './pages/GymPage';
import { TimeOfDayCog } from './components/chrome/TimeOfDayCog';
import { OnboardingOverlay } from './components/onboarding/OnboardingOverlay';
import { shouldShowOnboarding } from './components/onboarding/onboardingState';

/**
 * Router + global providers.
 *
 *   /               → TownSquarePage (plaza, new default entry point)
 *   /gym            → GymPage (communal roster, URL-driven Focus Mode off)
 *   /apex|gale|metheus → GymPage (URL-driven Focus Mode on)
 *   anything else   → GymPage (any path outside '/' falls through)
 *
 * The Gym family shares a single `path="/*"` route so GymPage stays
 * mounted across /gym ↔ /apex ↔ /gale ↔ /metheus transitions. That
 * keeps WorldLayer alive and its CSS room-crossfade smooth. Only /
 * (the plaza) is a full scene swap — by design, it's a different world.
 *
 * TimeOfDayCog mounts once outside <Routes> so the floating settings
 * cog persists across navigation and writes body[data-mode] globally.
 *
 * OnboardingOverlay shows once on first visit — videos play before the
 * user reaches the gym, gating the dashboard until they tap through.
 */
export default function App() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setShowOnboarding(shouldShowOnboarding()), 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <GaleWeatherProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TownSquarePage />} />
          <Route path="/*" element={<GymPage />} />
        </Routes>
        <TimeOfDayCog />
        <OnboardingOverlay open={showOnboarding} onClose={() => setShowOnboarding(false)} />
      </BrowserRouter>
    </GaleWeatherProvider>
  );
}
