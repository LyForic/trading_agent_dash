import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { GaleWeatherProvider } from '@/lib/galeWeatherContext';
import { WorldV2Page } from './pages/WorldV2Page';
import { TownSquarePage } from './pages/TownSquarePage';
import { GymPage } from './pages/GymPage';
import { TimeOfDayCog } from './components/chrome/TimeOfDayCog';

/**
 * Router + global providers.
 *
 *   /               → WorldV2Page (experimental living overworld)
 *   /town           → TownSquarePage (V1 plaza)
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
 */
function RoutedTimeOfDayCog() {
  const location = useLocation();
  return location.pathname === '/' ? null : <TimeOfDayCog />;
}

export default function App() {
  return (
    <GaleWeatherProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<WorldV2Page />} />
          <Route path="/town" element={<TownSquarePage />} />
          <Route path="/*" element={<GymPage />} />
        </Routes>
        <RoutedTimeOfDayCog />
      </BrowserRouter>
    </GaleWeatherProvider>
  );
}
