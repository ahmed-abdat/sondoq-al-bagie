/** Server cache tag of every public read (expired by committee writes). */
export const PUBLIC_TAG = "public";

/** TanStack Query key root of public data: the only queries saved on the phone (owned there). */
export { PUBLIC_KEY } from "@/lib/offline/persister";
