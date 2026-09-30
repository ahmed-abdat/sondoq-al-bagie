import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Query } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";
import { PERSIST_KEY, PUBLIC_VIEWS } from "./cache-rules";

/**
 * Only ["public", <amount-free view>] queries are saved on the phone: never committee data, never
 * money (docs/MONEY-PRIVACY.md), even if a money read is ever put under a "public" key.
 */
export const PUBLIC_KEY = "public";
/** Saved data older than this is dropped instead of shown. */
export const PERSIST_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export function isPersistable(query: Pick<Query, "queryKey" | "state">): boolean {
  const [scope, name] = query.queryKey;
  return (
    scope === PUBLIC_KEY &&
    (PUBLIC_VIEWS as readonly unknown[]).includes(name) &&
    query.state.status === "success"
  );
}

/** IndexedDB storage; every call is guarded so private mode / quota errors never break the app. */
const idbStorage = {
  getItem: async (key: string) => {
    try {
      return (await get<string>(key)) ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await set(key, value);
    } catch {
      /* quota or blocked storage: keep working without the offline copy */
    }
  },
  removeItem: async (key: string) => {
    try {
      await del(key);
    } catch {
      /* ignore */
    }
  },
};

export function createIdbPersister() {
  return createAsyncStoragePersister({ storage: idbStorage, key: PERSIST_KEY, throttleTime: 2000 });
}
