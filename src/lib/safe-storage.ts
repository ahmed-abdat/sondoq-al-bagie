/**
 * localStorage wrapped in try/catch (Safari private mode, quota, disabled storage).
 * Falls back to an in-memory map so the app still works for the session.
 * Only for small per-device conveniences, never for data that must persist.
 */
export interface SafeStorage {
  getItem(name: string): string | null;
  setItem(name: string, value: string): void;
  removeItem(name: string): void;
}

const memory = new Map<string, string>();

export const safeStorage: SafeStorage = {
  getItem(name) {
    try {
      return window.localStorage.getItem(name) ?? memory.get(name) ?? null;
    } catch {
      return memory.get(name) ?? null;
    }
  },
  setItem(name, value) {
    memory.set(name, value);
    try {
      window.localStorage.setItem(name, value);
    } catch {
      /* in-memory fallback already holds the value */
    }
  },
  removeItem(name) {
    memory.delete(name);
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};
