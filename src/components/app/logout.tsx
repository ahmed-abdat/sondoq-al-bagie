"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { forgetCommitteePush } from "@/components/providers/committee-push";
import { useAct, useIsDemo } from "./act";

/** «خروج»: signs out; in demo mode there is no session, so it just goes home. */
export function LogoutButton({ className, children }: { className: string; children: ReactNode }) {
  const demo = useIsDemo();
  const acts = useAct();
  if (demo)
    return (
      <Link href="/" className={className}>
        {children}
      </Link>
    );
  return (
    <form
      action={async () => {
        // stop this phone's payment notifications before the session ends
        await forgetCommitteePush(acts).catch(() => {});
        await logout();
      }}
    >
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
