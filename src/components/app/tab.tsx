import { ViewTransition, type ReactNode } from "react";

const DIR = { "tab-fwd": "tab-fwd", "tab-back": "tab-back", default: "none" } as const;

/**
 * Wraps a tab's content: on a tab change the old page fades out and the new one slides in
 * reading direction (types set by the nav links). Nav and aside are named in CSS so they stay live.
 */
export function Tab({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter={DIR} exit={DIR} default="none">
      <div className="bq-tab">{children}</div>
    </ViewTransition>
  );
}
