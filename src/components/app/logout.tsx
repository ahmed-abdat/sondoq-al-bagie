"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { forgetCommitteePush } from "@/components/providers/committee-push";
import { useAct, useIsDemo } from "./act";
import { setCanceller } from "./viewer";

/** «خروج»: signs out and goes to /login; in demo mode there is no session to end. */
export function LogoutButton({ className, children }: { className: string; children: ReactNode }) {
  const demo = useIsDemo();
  const acts = useAct();
  if (demo)
    return (
      <Link href="/login" className={className} onClick={() => setCanceller(null)}>
        {children}
      </Link>
    );
  return (
    <form
      action={async () => {
        // stop this phone's payment notifications before the session ends
        await forgetCommitteePush(acts).catch(() => {});
        setCanceller(null);
        await logout();
      }}
    >
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
