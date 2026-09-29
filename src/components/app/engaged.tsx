"use client";
import { useEffect } from "react";
import { markInstallEngaged } from "@/components/providers";

/** Mounting it counts as a meaningful action: the install invite may show. */
export function Engaged() {
  useEffect(() => markInstallEngaged(), []);
  return null;
}
