"use client";
// The five tabs (plan §4): bottom bar on phones, start-side rail from 1024px.
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { committeeHref, X } from "./kit";
import "./admin.css";

export type Tab = "home" | "members" | "gifts" | "reports" | "more" | null;
const TABS: { k: Exclude<Tab, null>; l: string; path: string; icon: keyof typeof X }[] = [
  { k: "home", l: "الرئيسية", path: "", icon: "home" },
  { k: "members", l: "الأعضاء", path: "members", icon: "people" },
  { k: "gifts", l: "التبرعات", path: "campaigns", icon: "heart" },
  { k: "reports", l: "التقارير", path: "reports", icon: "chart" },
  { k: "more", l: "المزيد", path: "more", icon: "dots" },
];
export function tabOf(path: string[]): Tab {
  const p = path[0] ?? "";
  if (p === "") return "home";
  if (p === "members" || p === "late") return "members";
  if (p === "campaigns") return "gifts";
  if (p === "reports") return "reports";
  if (p === "record") return null;
  return "more";
}

export function Shell({
  tab,
  children,
  above,
  fab,
  bare,
  className = "",
}: {
  tab: Tab;
  children: ReactNode;
  /** a fixed bar above the nav (direction A's «سجّل دفعة») */
  above?: ReactNode;
  fab?: ReactNode;
  /** full-screen task: no nav at all */
  bare?: boolean;
  className?: string;
}) {
  const href = committeeHref;
  return (
    <div className={`pa ${bare ? "pa-bare" : ""} ${above ? "pa-has-above" : ""} ${className}`}>
      {!bare && (
        <nav className="pa-nav" aria-label="التنقل">
          {/* the install bar (providers/install.tsx) stays above `.bq-bnav` while it is shown */}
          <span className="bq-bnav pa-nav-mark" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pa-nav-logo" src="/logo.jpg" alt="صندوق الرابطة" width={44} height={44} />
          {TABS.map((t) => (
            <Link
              key={t.k}
              href={href(t.path)}
              className={`pa-nav-i ${tab === t.k ? "on" : ""}`}
              aria-current={tab === t.k ? "page" : undefined}
            >
              <span className="pa-nav-pill">{X[t.icon](24)}</span>
              <span className="pa-nav-l">{t.l}</span>
            </Link>
          ))}
        </nav>
      )}
      <main className="pa-main">{children}</main>
      {above && <div className="pa-above">{above}</div>}
      {fab}
    </div>
  );
}

/** The frame of every committee page: the tab comes from the URL. */
export function CommitteeShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const parts = path
    .replace(/^\/committee\/?/, "")
    .split("/")
    .filter(Boolean);
  return <Shell tab={path.startsWith("/committee") ? tabOf(parts) : null}>{children}</Shell>;
}
