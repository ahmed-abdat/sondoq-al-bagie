"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { markInstallEngaged } from "@/components/providers";
import type { MemberIndex, MemberStatus } from "@/lib/data/types";
import { Track } from "../bits";
import { memberLabel, memberNoun, namesCount, searchMembers } from "../derive";
import dynamic from "next/dynamic";
import { EntryRow } from "../entry-row";

// the receipt, its stamp, QR and share code load only when a row is opened
const EntrySheetBody = dynamic(() => import("../entries").then((m) => m.EntrySheetBody), {
  ssr: false,
});
import { Hero, type HeroData } from "../hero";
import { I } from "../icons";
import { Avatar, StatusTag } from "../bits";
import { Num } from "../num";
import { useMoney } from "../money";
import { rememberMember, useRecentMembers } from "../recent-members";
import { MemberSlot } from "../member-slot";
import { SearchField } from "../search-field";
import { Sheet, useSheet } from "../sheet";
import type { LedgerEntry } from "../types";

type S = { t: "entry"; e: LedgerEntry };
/** Only what a search result shows; keeps the home payload small. */
export type IndexMember = Pick<MemberIndex["members"][number], "memberRef" | "fullName"> &
  Pick<MemberStatus, "status" | "monthsBehind" | "monthsPaidThisYear"> & {
    /** this year's month code and older late months, for «دفع حتى <شهر>» */
    months?: string;
    pastLate?: string[];
  };

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
  campaign: { campaignId: string; title: string } | null;
}) {
  // money privacy: amounts, receipt codes and the campaign's progress only for members/committee
  const money = useMoney();
  const rows = money ? money.ledger : ledger;
  const camp =
    money && campaign ? money.campaigns.find((c) => c.campaignId === campaign.campaignId) : null;
  const pct = camp?.targetAmount
    ? Math.min(100, Math.round((camp.collected / camp.targetAmount) * 100))
    : null;
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
        <h2 id="bq-find-h">ابحث عن شخص باسمه أو رقمه</h2>
        <SearchField
          value={q}
          onChange={setQ}
          placeholder="اكتب الاسم أو الرقم، مثل ب 12"
          label="ابحث باسمك أو رقم عضويتك"
          members={members}
          onFocus={liftSearch}
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
                <p className="bq-hint">وجدنا {namesCount(res.length)}. اكتب اسمك كاملًا أو رقمك.</p>
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
            <Num className="bq-count-n">{paidCount}</Num> من <Num>{total}</Num> {memberNoun(total)} دفعوا رسوم{" "}
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
        {rows.length ? (
          <ul className="bq-list">
            {rows.slice(0, 3).map((e) => (
              <EntryRow key={e.id} e={e} onOpen={openEntry} />
            ))}
          </ul>
        ) : (
          <p className="bq-hint">
            {paidCount > 0
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
              {pct !== null && <Track f={pct / 100} />}
            </span>
            {pct !== null && <Num className="bq-camp-pct">{pct}%</Num>}
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

/**
 * Audit V1: on a phone the keyboard covers the results under the hero; bring the question and
 * the field to the top once the keyboard is opening.
 */
function liftSearch() {
  if (!matchMedia("(max-width: 599.98px)").matches) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  setTimeout(
    () =>
      document
        .getElementById("bq-find-h")
        ?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" }),
    250,
  );
}

/** A search result: tap to open the member's months on /members. */
function IndexRow({ m }: { m: IndexMember }) {
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
        <StatusTag m={m} />
      </Link>
    </li>
  );
}
