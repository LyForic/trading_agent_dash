import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

/**
 * Polyfill localStorage / sessionStorage for jsdom tests.
 *
 * Node 25 ships a native `localStorage` global that collides with jsdom's
 * implementation and leaves methods (clear/setItem/etc.) unbound when
 * `--localstorage-file` isn't provided. Replacing with a simple Map-backed
 * Storage implementation makes tests deterministic and hermetic.
 */
class MemStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

Object.defineProperty(window, 'localStorage', {
  value: new MemStorage(),
  writable: true,
});
Object.defineProperty(window, 'sessionStorage', {
  value: new MemStorage(),
  writable: true,
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.body.removeAttribute('data-mode');
  document.body.removeAttribute('data-room');
});
