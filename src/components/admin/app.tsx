"use client";
// The committee app (committee-only, owner picks 2026-09-30): home «الصندوق أولًا», members,
// التبرعات, التقارير and المزيد, on one data model (AdminData) built on the server.
import { Campaign, Campaigns, Home } from "./dir-b";
import { Provider } from "./kit";
import { RecordScreen } from "./record";
import { Reports3 } from "./reports3";
import { ExpensesScreen, LateScreen, LevyScreen, MemberScreen, MembersScreen } from "./screens";
import { ActivityScreen, MoreScreen } from "./more";
import type { PData } from "./types";

export function AdminApp({
  path,
  q,
  data,
}: {
  path: string[];
  q: Record<string, string | undefined>;
  data: PData;
}) {
  const [p0, p1] = path;
  const body = !p0 ? (
    <Home />
  ) : p0 === "record" ? (
    <RecordScreen key={JSON.stringify(q)} />
  ) : p0 === "members" ? (
    p1 ? (
      <MemberScreen refs={decodeURIComponent(p1)} />
    ) : (
      <MembersScreen />
    )
  ) : p0 === "late" ? (
    <LateScreen />
  ) : p0 === "campaigns" ? (
    p1 ? (
      p1.startsWith("l") ? (
        <LevyScreen id={p1} />
      ) : (
        <Campaign id={p1} />
      )
    ) : (
      <Campaigns />
    )
  ) : p0 === "reports" ? (
    <Reports3 />
  ) : p0 === "expenses" ? (
    <ExpensesScreen />
  ) : p0 === "activity" ? (
    <ActivityScreen />
  ) : (
    <MoreScreen />
  );
  return (
    <Provider d={data} q={q}>
      {body}
    </Provider>
  );
}
