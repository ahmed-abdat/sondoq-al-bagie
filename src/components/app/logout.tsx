"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { useIsDemo } from "./act";

/** «خروج»: signs out; in demo mode there is no session, so it just goes home. */
export function LogoutButton({ className, children }: { className: string; children: ReactNode }) {
  const demo = useIsDemo();
  if (demo)
    return (
      <Link href="/" className={className}>
        {children}
      </Link>
    );
  return (
    <form action={logout}>
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
