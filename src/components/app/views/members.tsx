"use client";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { MemberStatus } from "@/lib/data/types";
import { byMostLate, groupLabel, memberState, searchMembers, type MState } from "../derive";
import { I } from "../icons";
import { MemberRow, MemberSheetBody, type MemberCtx } from "../member";
import { Num } from "../num";
import { Segmented } from "../segmented";
import { Sheet, useSheet } from "../sheet";

type Filter = "all" | "late" | "none" | `g:${string}`;
const GROUPS: { k: MState; l: string }[] = [
  { k: "ahead", l: "دفعوا كل السنة" },
  { k: "ok", l: "منتظمون" },
  { k: "late", l: "متأخرون" },
  { k: "off", l: "لا تُستحق عليهم رسوم الآن" },
];
const match = (m: MemberStatus, f: Filter) =>
  f === "all" ||
  (f === "late"
    ? memberState(m) === "late"
    : f === "none"
      ? m.status === "active" && m.monthsPaidThisYear === 0
      : m.groupCode === f.slice(2));

function parseFilter(v: string | null): Filter {
  if (v === "late" || v === "none") return v;
  if (v && /^[A-Za-z]$/.test(v)) return `g:${v.toUpperCase()}`;
  return "all";
}

/** Reads ?filter= (late · none · A · B). Wrap in <Suspense> with <MembersView/> as the fallback. */
export function MembersFromUrl(props: { members: MemberStatus[]; ctx: MemberCtx }) {
  const f = parseFilter(useSearchParams().get("filter"));
  return <MembersView key={f} {...props} initial={f} />;
}

export function MembersView({
  members,
  ctx,
  initial = "all",
}: {
  members: MemberStatus[];
  ctx: MemberCtx;
  initial?: Filter;
}) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<Filter>(initial);
  const [shut, setShut] = useState<Partial<Record<MState, boolean>>>({});
  const sheet = useSheet<MemberStatus>();
  const groups = useMemo(() => [...new Set(members.map((m) => m.groupCode))].sort(), [members]);
  const list = useMemo(() => {
    const byQ = q.trim() ? searchMembers(members, q) : members;
    const l = byQ.filter((m) => match(m, f));
    return f === "late" || f === "none" ? [...l].sort(byMostLate) : l;
  }, [members, q, f]);
  const count = (k: Filter) => members.filter((m) => match(m, k)).length;
  const grouped = !q.trim() && (f === "all" || f.startsWith("g:"));
  const pick = (m: MemberStatus, from: HTMLElement | null) => sheet.open(m, from, "bq-av");
  const s = sheet.state;
  return (
    <>
      <header className="bq-page-h">
        <h1>الأعضاء</h1>
      </header>
      <div className="bq-sec bq-sec-first">
        <label className="bq-search">
          {I.search(24)}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="اكتب رقمًا أو اسمًا"
            aria-label="ابحث عن عضو بالرقم أو الاسم"
            type="search"
          />
          {q && (
            <button
              type="button"
              className="bq-press"
              onClick={() => setQ("")}
              aria-label="امسح البحث"
            >
              {I.x(20)}
            </button>
          )}
        </label>
        <div className="bq-gap-12" />
        <Segmented<Filter>
          label="تصفية الأعضاء"
          value={f}
          onChange={setF}
          items={[
            {
              k: "all",
              l: (
                <>
                  الكل{" "}
                  {/* same number as «X من N» on the home page: active members */}
                  <Num className="bq-seg-n">{members.filter((m) => m.status === "active").length}</Num>
                </>
              ),
            },
            {
              k: "late",
              l: (
                <>
                  المتأخرون <Num className="bq-seg-n">{count("late")}</Num>
                </>
              ),
            },
            ...groups.map((g) => ({ k: `g:${g}` as Filter, l: `الفئة ${groupLabel(g)}` })),
            ...(initial === "none"
              ? [
                  {
                    k: "none" as Filter,
                    l: (
                      <>
                        لم يدفع أي شهر <Num className="bq-seg-n">{count("none")}</Num>
                      </>
                    ),
                  },
                ]
              : []),
          ]}
        />
        {f === "none" && (
          <p className="bq-hint bq-list-count">أعضاء لم يدفعوا أي شهر هذا العام، للمتابعة معهم.</p>
        )}
        {f === "late" && <p className="bq-hint bq-list-count">الأكثر تأخرًا أولًا.</p>}
        {list.length === 0 ? (
          <div className="bq-empty">
            <p className="bq-empty-t">
              {q.trim()
                ? "لم نجد عضوًا بهذا الرقم أو الاسم"
                : members.length
                  ? "لا أحد في هذه القائمة"
                  : "لم يُسجَّل أعضاء بعد"}
            </p>
            {members.length > 0 && (
              <button
                type="button"
                className="bq-btn bq-btn-soft bq-press"
                onClick={() => {
                  setQ("");
                  setF("all");
                }}
              >
                عرض كل الأعضاء
              </button>
            )}
          </div>
        ) : grouped ? (
          GROUPS.map((g) => {
            const items = list.filter((m) => memberState(m) === g.k);
            if (!items.length) return null;
            const open = !shut[g.k];
            return (
              <section key={g.k} className="bq-group" aria-label={g.l}>
                <button
                  type="button"
                  className="bq-group-h bq-press"
                  aria-expanded={open}
                  onClick={() => setShut((x) => ({ ...x, [g.k]: open }))}
                >
                  <span className="bq-group-t">{g.l}</span>
                  <Num className="bq-group-n">{items.length}</Num>
                  <span className="bq-group-i">{I.chev(20)}</span>
                </button>
                {open && (
                  <ul className="bq-list">
                    {(g.k === "late" ? [...items].sort(byMostLate) : items).map((m) => (
                      <MemberRow key={m.memberId} m={m} onPick={pick} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        ) : (
          <>
            <p className="bq-hint bq-list-count" aria-live="polite">
              يظهر <Num>{list.length}</Num>{" "}
              {list.length > 2 && list.length <= 10 ? "أعضاء" : "عضوًا"}
            </p>
            <ul className="bq-list">
              {list.map((m) => (
                <MemberRow key={m.memberId} m={m} onPick={pick} />
              ))}
            </ul>
          </>
        )}
      </div>
      {s && (
        <Sheet
          key={s.value.memberId}
          label={s.value.fullName}
          vt={s.vt}
          onDone={sheet.done}
          tryVTClose={sheet.tryVTClose}
        >
          <MemberSheetBody m={s.value} ctx={ctx} vt={s.vt} />
        </Sheet>
      )}
    </>
  );
}
