import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { GaleWeatherProvider } from '@/lib/galeWeatherContext';
import { WorldV2Page } from './pages/WorldV2Page';
import { TownSquarePage } from './pages/TownSquarePage';
import { GymPage } from './pages/GymPage';
import { TimeOfDayCog } from './components/chrome/TimeOfDayCog';
import { useTimeOfDayPreference } from './lib/useTimeOfDayPreference';

const DEV_EDITOR_ROUTES = import.meta.env.DEV;

const WorldV2ManifestEditorPage = DEV_EDITOR_ROUTES
  ? lazy(() => import('./pages/WorldV2ManifestEditorPage').then((module) => ({ default: module.WorldV2ManifestEditorPage })))
  : null;
const WorldV2SpriteFrameEditorPage = DEV_EDITOR_ROUTES
  ? lazy(() => import('./pages/WorldV2SpriteFrameEditorPage').then((module) => ({ default: module.WorldV2SpriteFrameEditorPage })))
  : null;
const WorldV2WalkCycleEditorPage = DEV_EDITOR_ROUTES
  ? lazy(() => import('./pages/WorldV2WalkCycleEditorPage').then((module) => ({ default: module.WorldV2WalkCycleEditorPage })))
  : null;

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
 * Time-of-day mode sync mounts outside route content for legacy/editor
 * routes. The live world owns its mode directly so Phaser can receive it.
 */
function TimeOfDayModeSync() {
  useTimeOfDayPreference();
  return null;
}

function RoutedTimeOfDayControl() {
  const location = useLocation();
  if (location.pathname === '/') return null;

  return (DEV_EDITOR_ROUTES && location.pathname === '/world-v2/manifest-editor')
    || (DEV_EDITOR_ROUTES && location.pathname === '/world-v2/sprite-frame-editor')
    || (DEV_EDITOR_ROUTES && location.pathname === '/world-v2/walk-cycle-editor')
    ? <TimeOfDayModeSync />
    : <TimeOfDayCog />;
}

export default function App() {
  return (
    <GaleWeatherProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<WorldV2Page />} />
          {DEV_EDITOR_ROUTES && WorldV2ManifestEditorPage ? (
            <Route
              path="/world-v2/manifest-editor"
              element={<Suspense fallback={null}><WorldV2ManifestEditorPage /></Suspense>}
            />
          ) : null}
          {DEV_EDITOR_ROUTES && WorldV2SpriteFrameEditorPage ? (
            <Route
              path="/world-v2/sprite-frame-editor"
              element={<Suspense fallback={null}><WorldV2SpriteFrameEditorPage /></Suspense>}
            />
          ) : null}
          {DEV_EDITOR_ROUTES && WorldV2WalkCycleEditorPage ? (
            <Route
              path="/world-v2/walk-cycle-editor"
              element={<Suspense fallback={null}><WorldV2WalkCycleEditorPage /></Suspense>}
            />
          ) : null}
          <Route path="/town" element={<TownSquarePage />} />
          <Route path="/*" element={<GymPage />} />
        </Routes>
        <RoutedTimeOfDayControl />
      </BrowserRouter>
    </GaleWeatherProvider>
  );
}
