"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { forgetCommitteePush } from "@/components/providers/committee-push";
import { useAct, useIsDemo } from "./act";
import { setCanceller, setCommitteeViewer } from "./viewer";
import { DEMO_COMMITTEE_COOKIE } from "./demo";
import { clearMoney } from "./money";

/** «خروج»: signs out; in demo mode there is no session, so it just goes home. */
export function LogoutButton({ className, children }: { className: string; children: ReactNode }) {
  const demo = useIsDemo();
  const acts = useAct();
  if (demo)
    return (
      <Link
        href="/"
        className={className}
        onClick={() => {
          document.cookie = `${DEMO_COMMITTEE_COOKIE}=; path=/; max-age=0`;
          delete document.documentElement.dataset.money;
          setCommitteeViewer(false);
          setCanceller(null);
          clearMoney();
        }}
      >
        {children}
      </Link>
    );
  return (
    <form
      action={async () => {
        // stop this phone's payment notifications before the session ends
        await forgetCommitteePush(acts).catch(() => {});
        // committee-only controls on public pages (report share, cancel) go with the session
        setCommitteeViewer(false);
        setCanceller(null);
        clearMoney();
        delete document.documentElement.dataset.money;
        await logout();
      }}
    >
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
