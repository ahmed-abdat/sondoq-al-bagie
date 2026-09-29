"use client";
// «أنت»: what a member's personal link adds on top of the public pages. The card changes with the
// member's state (owner, r24): the whole year paid (thanks, no pay button), paid up to a month,
// late (one «ادفع الآن»), exempt. Months as the report's grid (✓ when paid, empty otherwise).
// Sheets: «أرسل صورة التحويل» (the committee record flow in member mode, for me or for others)
// and «ادفع الآن» (amount due, the fund's wallets, then «دفعت؟ أرسل صورة التحويل»).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { MemberLinkPaste } from "@/components/providers";
import { useIsDemo } from "./act";
import { Avatar, MemberNo } from "./bits";
import { fmt, groupLabel, monthCount } from "./derive";
import { I } from "./icons";
import { rememberDemoMember, useMemberAct, useMemberDemo } from "./member-act";
import { waitingLine, youCard, youDots } from "./member-model";
import {
  memberHome,
  memberSheetData,
  type MemberHome,
  type MemberSheetData,
} from "./member-view-action";
import { Num } from "./num";
import { PayTo } from "./pay-to";
import { RecordBody } from "./record";
import { Sheet } from "./sheet";
import { useSnack } from "./shell";
import { cardCache, forgetMemberCard } from "./member-card-cache";

export { forgetMemberCard };

/** Fetch the member's card data (null = no valid link here). `initial` comes from a dynamic page. */
function useMemberHome(initial?: MemberHome | null) {
  const [d, setD] = useState<MemberHome | null | undefined>(initial ?? cardCache.last);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (initial !== undefined && tick === 0) return;
    let live = true;
    memberHome()
      .then((v) => {
        cardCache.last = v;
        if (live) setD(v);
      })
      .catch(() => {}); // offline: keep what we had
    return () => {
      live = false;
    };
  }, [initial, tick]);
  return [d, () => setTick((n) => n + 1)] as const;
}

type SheetKind = "self" | "others" | "pay";

export function MemberCard({
  initial,
  onMe = false,
}: {
  /** from a dynamic page that already read the session (/me) */
  initial?: MemberHome | null;
  /** on «دفعاتي» itself: no link to it */
  onMe?: boolean;
}) {
  const [d, refresh] = useMemberHome(initial);
  const isDemo = useIsDemo();
  const demo = useMemberDemo();
  const say = useSnack();
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [data, setData] = useState<MemberSheetData | null | undefined>();
  const router = useRouter();
  const { memberSwitch } = useMemberAct();
  const [switching, setSwitching] = useState<string | null>(null);
  const switchTo = async (linkId: string, name: string) => {
    setSwitching(linkId);
    const r = await memberSwitch({ linkId });
    setSwitching(null);
    if (!r.ok) return say(r.message);
    setData(undefined); // «دفعت لهم سابقًا» belongs to the other person
    refresh();
    router.refresh();
    say(`هذا الهاتف الآن باسم ${name}`);
  };
  useEffect(() => {
    if (isDemo && d) rememberDemoMember(d.s);
  }, [isDemo, d]);

  const open = (k: SheetKind) => {
    setSheet(k);
    if (data) return;
    memberSheetData()
      .then(setData)
      .catch(() => setData(null));
  };

  if (d === undefined) return null;
  if (d === null) return onMe ? null : <MemberLinkPaste />;

  const { s } = d;
  const st = youCard(s, d.months, d.year);
  const dots = youDots(d.months);
  const paidNames = dots.filter((x) => x.state === "paid").map((x) => x.name);
  const waiting = d.waiting + (isDemo ? demo.sent.filter((x) => x.status === "pending").length : 0);
  return (
    <section className="bq-sec bq-you" aria-labelledby="bq-you-h">
      <div className="bq-you-head">
        <Avatar m={s} size={48} />
        <div className="bq-row-m">
          <p className="bq-you-k">أنت</p>
          <h2 id="bq-you-h" className="bq-you-t">
            {s.fullName}
          </h2>
          <p className="bq-hint">
            رقم <MemberNo m={s} /> · المجموعة {groupLabel(s.groupCode)}
          </p>
        </div>
      </div>
      {d.profiles.length > 1 && (
        <div className="bq-you-sw" role="group" aria-label="أشخاص آخرون على هذا الهاتف">
          <span className="bq-hint">تبديل:</span>
          {d.profiles
            .filter((p) => !p.active && p.memberId !== s.memberId)
            .map((p) => (
              <button
                key={p.linkId}
                type="button"
                className="bq-chip bq-press"
                disabled={!!switching}
                aria-label={`انتقل إلى ${p.fullName}`}
                onClick={() => void switchTo(p.linkId, p.fullName)}
              >
                {switching === p.linkId && <span className="bq-spin" aria-hidden="true" />}
                {p.fullName}
              </button>
            ))}
        </div>
      )}
      <p className={`bq-you-st ${st.kind === "late" ? "is-late" : "is-ok"}`}>
        {st.kind === "late" ? I.clock(20) : I.check(20)}
        <span>{st.text}</span>
      </p>
      {st.kind === "full" && <p className="bq-hint">شكرًا لك</p>}
      <div className="bq-you-grid">
        <ol
          className="bq-you-cells"
          role="img"
          aria-label={
            paidNames.length ? `أشهر ${d.year} المدفوعة: ${paidNames.join("، ")}` : `أشهر ${d.year}`
          }
        >
          {dots.map((x) => (
            <li key={x.month}>{x.state === "paid" ? <OkMark /> : null}</li>
          ))}
        </ol>
        <ol className="bq-you-nums" aria-hidden="true">
          {dots.map((x) => (
            <li key={x.month}>{x.month}</li>
          ))}
        </ol>
      </div>
      <p className="bq-you-key" aria-hidden="true">
        <OkMark /> مدفوع
      </p>
      {s.credit > 0 && (
        <p className="bq-hint">
          لك رصيد <Num>{fmt(s.credit)}</Num> أوقية.
        </p>
      )}
      {waiting > 0 && (
        <Link className="bq-you-wait bq-press" href="/me" transitionTypes={["tab-fwd"]}>
          {I.clock(18)} {waitingLine(waiting)}
        </Link>
      )}
      <div className="bq-btn-col bq-small-top">
        {st.kind === "late" && (
          <button
            type="button"
            className="bq-btn bq-btn-primary bq-btn-lg bq-press"
            onClick={() => open("pay")}
          >
            ادفع الآن
          </button>
        )}
        {st.kind === "upto" && (
          <button
            type="button"
            className="bq-btn bq-btn-soft bq-press"
            onClick={() => open("self")}
          >
            ادفع أشهرًا قادمة
          </button>
        )}
        <button
          type="button"
          className="bq-btn bq-btn-soft bq-press"
          onClick={() => open("others")}
        >
          ادفع عن شخص آخر
        </button>
      </div>
      {!onMe && (
        <Link className="bq-link bq-press" href="/me" transitionTypes={["tab-fwd"]}>
          دفعاتي
          {I.go(18)}
        </Link>
      )}

      {(sheet === "self" || sheet === "others") && (
        <Sheet key={sheet} label="أرسل صورة التحويل" onDone={() => setSheet(null)}>
          {data ? (
            <RecordBody
              members={data.members}
              ctx={data.ctx}
              accounts={data.accounts}
              campaigns={data.campaigns}
              member={{
                selfId: s.memberId,
                selfName: s.fullName,
                recent: data.recent,
                start: sheet,
              }}
              onDone={(t) => {
                setSheet(null);
                say(t);
                refresh();
              }}
            />
          ) : (
            <SheetWait failed={data === null} />
          )}
        </Sheet>
      )}
      {sheet === "pay" && (
        <Sheet key="pay" label="ادفع الآن" onDone={() => setSheet(null)}>
          <div className="bq-rec">
            <h2>ادفع الآن</h2>
            {s.amountOwed > 0 && (
              <p className="bq-lead">
                عليك <Num className="bq-strong">{fmt(s.amountOwed)}</Num> أوقية عن{" "}
                {monthCount(s.monthsBehind)}.
              </p>
            )}
            <p className="bq-rec-k">كيف أدفع؟ حوّل إلى أحد أرقام الصندوق</p>
            {data ? <PayTo accounts={data.accounts} /> : <SheetWait failed={data === null} />}
            <button
              type="button"
              className="bq-btn bq-btn-primary bq-btn-lg bq-press"
              onClick={() => setSheet("self")}
            >
              {I.image(20)} دفعت؟ أرسل صورة التحويل
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}

function SheetWait({ failed }: { failed: boolean }) {
  return failed ? (
    <p className="bq-alert" role="alert">
      تعذّر التحميل. تحقق من الإنترنت ثم أعد فتح النافذة.
    </p>
  ) : (
    <p className="bq-hint" role="status">
      <span className="bq-spin" aria-hidden="true" /> جارٍ التحميل…
    </p>
  );
}

/** The report's ✓ badge (green disc, white check). */
function OkMark() {
  return (
    <svg className="bq-okm" viewBox="0 0 32 32" width="18" height="18" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="var(--g7)" />
      <path
        d="M9 16l5 5 10-11"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
