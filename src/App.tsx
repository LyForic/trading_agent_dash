import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GaleWeatherProvider } from '@/lib/galeWeatherContext';
import { TownSquarePage } from './pages/TownSquarePage';
import { GymPage } from './pages/GymPage';

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
 */
export default function App() {
  return (
    <GaleWeatherProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TownSquarePage />} />
          <Route path="/*" element={<GymPage />} />
        </Routes>
      </BrowserRouter>
    </GaleWeatherProvider>
  );
}
