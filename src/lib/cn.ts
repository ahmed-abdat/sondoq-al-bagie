import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Joins class names and lets later Tailwind classes win ("px-2 px-4" → "px-4"). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
