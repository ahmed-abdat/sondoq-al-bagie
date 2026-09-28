import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import type { Query } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";

/** Only queries whose key starts with "public" are saved on the phone (never committee data). */
export const PUBLIC_KEY = "public";
export const PERSIST_KEY = "sondoq-query-cache";
/** Saved data older than this is dropped instead of shown. */
export const PERSIST_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export function isPersistable(query: Pick<Query, "queryKey" | "state">): boolean {
  return query.queryKey[0] === PUBLIC_KEY && query.state.status === "success";
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
