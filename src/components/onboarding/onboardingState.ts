const STORAGE_KEY = 'gym:onboarding:seen-v1';

export function shouldShowOnboarding(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markOnboardingSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // localStorage blocked — onboarding will replay; that's fine.
  }
}
