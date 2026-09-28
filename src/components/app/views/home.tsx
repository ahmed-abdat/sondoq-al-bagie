"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { InstallCard } from "@/components/providers";
import type { MemberStatus } from "@/lib/data/types";
import { Track } from "../bits";
import { searchMembers } from "../derive";
import dynamic from "next/dynamic";
import { EntryRow } from "../entry-row";

// the receipt, its stamp, QR and share code load only when a row is opened
const EntrySheetBody = dynamic(() => import("../entries").then((m) => m.EntrySheetBody), {
  ssr: false,
});
import { Hero, type HeroData } from "../hero";
import { I } from "../icons";
import { MemberRow, MemberSheetBody, type MemberCtx } from "../member";
import { Num } from "../num";
import { Sheet, useSheet } from "../sheet";
import type { LedgerEntry } from "../types";

type S = { t: "member"; m: MemberStatus } | { t: "entry"; e: LedgerEntry };

export function HomeView({
  hero,
  members,
  ctx,
  paidCount,
  activeCount,
  monthName,
  ledger,
  campaign,
}: {
  hero: HeroData;
  members: MemberStatus[];
  ctx: MemberCtx;
  paidCount: number;
  /** FundSummary.membersActive */
  activeCount: number;
  monthName: string;
  ledger: LedgerEntry[];
  campaign: { title: string; pct: number } | null;
}) {
  const [q, setQ] = useState("");
  const res = useMemo(() => searchMembers(members, q), [members, q]);
  const sheet = useSheet<S>();
  // same source as the members page: the active members in the list
  const total = members.filter((m) => m.status === "active").length || activeCount;
  const pick = (m: MemberStatus, from: HTMLElement | null) =>
    sheet.open({ t: "member", m }, from, "bq-av");
  const openEntry = (e: LedgerEntry, el: HTMLElement) =>
    sheet.open({ t: "entry", e }, e.receipt ? el : null, "bq-rc");
  const s = sheet.state;
  const sm = s?.value.t === "member" ? s.value.m : null;
  const se = s?.value.t === "entry" ? s.value.e : null;
  return (
    <>
      <div className="bq-mob-only">
        <Hero data={hero} variant="band" />
      </div>

      <section className="bq-sec bq-rv bq-find" data-rv="home-find" aria-labelledby="bq-find-h">
        <h2 id="bq-find-h">هل أنت منتظم في الدفع؟</h2>
        <label className="bq-search">
          {I.search(24)}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="اكتب اسمك أو رقمك"
            aria-label="ابحث باسمك أو رقم عضويتك"
            type="search"
            enterKeyHint="search"
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
        {q.trim() ? (
          res.length ? (
            <>
              <ul className="bq-list" aria-live="polite">
                {res.slice(0, 5).map((m) => (
                  <MemberRow key={m.memberId} m={m} onPick={pick} />
                ))}
              </ul>
              {res.length > 5 && (
                <p className="bq-hint">
                  وجدنا <Num>{res.length}</Num> أسماء. اكتب الاسم كاملًا ليظهر اسمك.
                </p>
              )}
            </>
          ) : (
            <div className="bq-empty" aria-live="polite">
              <p className="bq-empty-t">لم نجد عضوًا بهذا الاسم أو الرقم</p>
              <p className="bq-hint">جرّب جزءًا من الاسم فقط، مثل «محمد».</p>
            </div>
          )
        ) : (
          <Link className="bq-link bq-press" href="/accounts#bq-pay" transitionTypes={["tab-fwd"]}>
            كيف أدفع الرسوم؟ {I.go(18)}
          </Link>
        )}
      </section>

      <InstallCard className="bq-sec-tight" />

      {total > 0 && (
        <section className="bq-sec bq-rv" data-rv="home-count" aria-labelledby="bq-count-h">
          <h2 id="bq-count-h" className="bq-count">
            <Num className="bq-count-n">{paidCount}</Num> من <Num>{total}</Num> عضوًا دفعوا رسوم{" "}
            {monthName}
          </h2>
          <Track f={paidCount / total} label={`${paidCount} دفعوا من ${total}`} />
          <p className="bq-track-k">
            <span className="is-ok">{I.check(18)} دفعوا</span>
            <span>{I.clock(18)} لم يدفعوا بعد</span>
          </p>
          <Link
            className="bq-link bq-press"
            href="/members?filter=late"
            transitionTypes={["tab-fwd"]}
          >
            عرض المتأخرين
            {I.go(18)}
          </Link>
        </section>
      )}

      <section className="bq-sec bq-rv" data-rv="home-ops" aria-labelledby="bq-ops-h">
        <h2 id="bq-ops-h">آخر العمليات</h2>
        {ledger.length ? (
          <ul className="bq-list">
            {ledger.slice(0, 3).map((e) => (
              <EntryRow key={e.id} e={e} onOpen={openEntry} />
            ))}
          </ul>
        ) : (
          <p className="bq-hint">
            {hero.collected > 0
              ? "سُجّلت دفعات هذا العام من السجل الورقي. ستظهر هنا الدفعات الجديدة."
              : "لا توجد عمليات مؤكَّدة بعد."}
          </p>
        )}
        <Link className="bq-link bq-press" href="/accounts#bq-ops" transitionTypes={["tab-fwd"]}>
          عرض كل العمليات
          {I.go(18)}
        </Link>
      </section>

      {campaign && (
        <section
          className="bq-sec bq-rv bq-sec-tight"
          data-rv="home-camp"
          aria-label="الحملة المفتوحة"
        >
          <Link className="bq-camp-row bq-press" href="/donations" transitionTypes={["tab-fwd"]}>
            <span className="bq-disc is-gold">{I.heart(22)}</span>
            <span className="bq-row-m">
              <span className="bq-row-t">حملة: {campaign.title}</span>
              <Track f={campaign.pct / 100} />
            </span>
            <Num className="bq-camp-pct">{campaign.pct}%</Num>
            <span className="bq-chev">{I.go(18)}</span>
          </Link>
        </section>
      )}

      {s && sm && (
        <Sheet
          key={`m${sm.memberId}`}
          label={sm.fullName}
          vt={s.vt}
          onDone={sheet.done}
          tryVTClose={sheet.tryVTClose}
        >
          <MemberSheetBody m={sm} ctx={ctx} vt={s.vt} />
        </Sheet>
      )}
      {s && se && (
        <Sheet
          key={`e${se.id}`}
          label={se.title}
          vt={s.vt}
          onDone={sheet.done}
          tryVTClose={sheet.tryVTClose}
        >
          <EntrySheetBody e={se} vt={s.vt} />
        </Sheet>
      )}
    </>
  );
}
