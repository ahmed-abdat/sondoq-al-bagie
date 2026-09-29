"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { markInstallEngaged } from "@/components/providers";
import type { MemberIndex } from "@/lib/data/types";
import { Track } from "../bits";
import { memberLabel, searchMembers } from "../derive";
import dynamic from "next/dynamic";
import { EntryRow } from "../entry-row";

// the receipt, its stamp, QR and share code load only when a row is opened
const EntrySheetBody = dynamic(() => import("../entries").then((m) => m.EntrySheetBody), {
  ssr: false,
});
import { Hero, type HeroData } from "../hero";
import { I } from "../icons";
import { Avatar } from "../bits";
import { Num } from "../num";
import { rememberMember, useRecentMembers } from "../recent-members";
import { MemberSlot } from "../member-slot";
import { SearchField } from "../search-field";
import { Sheet, useSheet } from "../sheet";
import type { LedgerEntry } from "../types";

type S = { t: "entry"; e: LedgerEntry };
/** Only what a search result shows; keeps the home payload small. */
export type IndexMember = Pick<
  MemberIndex["members"][number],
  "memberRef" | "fullName" | "statusLabel"
>;

export function HomeView({
  hero,
  members,
  paidCount,
  activeCount,
  monthName,
  ledger,
  campaign,
}: {
  hero: HeroData;
  /** light search index (no months): a result opens the member on /members */
  members: IndexMember[];
  paidCount: number;
  /** FundSummary.membersActive */
  activeCount: number;
  monthName: string;
  ledger: LedgerEntry[];
  campaign: { title: string; pct: number } | null;
}) {
  const [q, setQ] = useState("");
  const router = useRouter();
  const recent = useRecentMembers(members);
  const res = useMemo(() => searchMembers(members, q), [members, q]);
  const sheet = useSheet<S>();
  const total = activeCount;
  const openEntry = (e: LedgerEntry, el: HTMLElement) =>
    sheet.open({ t: "entry", e }, e.receipt ? el : null, "bq-rc");
  const s = sheet.state;
  const se = s?.value.e ?? null;
  return (
    <>
      <div className="bq-mob-only">
        <Hero data={hero} variant="band" />
      </div>

      <MemberSlot />

      <section className="bq-sec bq-rv bq-find" data-rv="home-find" aria-labelledby="bq-find-h">
        <h2 id="bq-find-h">هل أنت منتظم في الدفع؟</h2>
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="اكتب اسمك أو رقمك"
          label="ابحث باسمك أو رقم عضويتك"
          members={members}
          onOpen={(m) => {
            rememberMember(m.memberRef);
            markInstallEngaged();
            router.push(`/members?m=${encodeURIComponent(m.memberRef)}`, {
              transitionTypes: ["tab-fwd"],
            });
          }}
        />
        {q.trim() ? (
          res.length ? (
            <>
              <ul className="bq-list" aria-live="polite">
                {res.slice(0, 5).map((m) => (
                  <IndexRow key={m.memberRef} m={m} />
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
          <>
            {recent.length > 0 && (
              <>
                <h3 className="bq-pick-h">آخر من بحثت عنهم</h3>
                <ul className="bq-list">
                  {recent.map((m) => (
                    <IndexRow key={m.memberRef} m={m} />
                  ))}
                </ul>
              </>
            )}
            <Link
              className="bq-link bq-press"
              href="/accounts#bq-pay"
              transitionTypes={["tab-fwd"]}
            >
              كيف أدفع الرسوم؟ {I.go(18)}
            </Link>
          </>
        )}
      </section>

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

/** A search result: tap to open the member's months on /members. */
function IndexRow({ m }: { m: IndexMember }) {
  const late = m.statusLabel === "متأخر";
  return (
    <li>
      <Link
        href={`/members?m=${encodeURIComponent(m.memberRef)}`}
        onClick={() => {
          rememberMember(m.memberRef);
          markInstallEngaged();
        }}
        className="bq-row bq-press"
        transitionTypes={["tab-fwd"]}
        aria-label={`${memberLabel(m)}، ${m.fullName}`}
      >
        <Avatar m={m} />
        <span className="bq-row-m">
          <span className="bq-row-t">{m.fullName}</span>
        </span>
        <span className={`bq-tag ${late ? "is-late" : "is-ok"}`}>
          {late ? I.clock(16) : I.check(16)}
          {m.statusLabel}
        </span>
      </Link>
    </li>
  );
}
