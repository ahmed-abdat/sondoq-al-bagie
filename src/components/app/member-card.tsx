"use client";
// «أنت»: what a member's personal link adds on top of the public pages. The card changes with the
// member's state (owner, r24): the whole year paid (thanks, no pay button), paid up to a month,
// late (one «ادفع الآن»), exempt. Months as the report's grid (✓ when paid, empty otherwise).
// Sheets: «أرسل صورة التحويل» (the committee record flow in member mode, for me or for others)
// and «ادفع الآن» (amount due, the fund's wallets, then «دفعت؟ أرسل صورة التحويل»).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MemberLinkPaste } from "@/components/providers";
import { useIsDemo } from "./act";
import { Avatar, MemberNo, PaidCheck } from "./bits";
import { fmt, groupLabel, monthCount } from "./derive";
import { I } from "./icons";
import { rememberDemoMember, useMemberAct, useMemberDemo } from "./member-act";
import { pendingCounts, waitingLine, youCard, youDots } from "./member-model";
import {
  memberHome,
  memberSheetData,
  type MemberHome,
  type MemberSheetData,
} from "./member-view-action";
import { Num } from "./num";
import { PayTo } from "./pay-to";
import { RecordBody, type SendAgain } from "./record";
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

type SheetKind = "self" | "others" | "pay" | "again";

export function MemberCard({
  initial,
  onMe = false,
  again = null,
  onAgainDone,
  welcome = false,
  openPay = false,
}: {
  /** from a dynamic page that already read the session (/me) */
  initial?: MemberHome | null;
  /** on «دفعاتي» itself: no link to it */
  onMe?: boolean;
  /** «أرسلها من جديد» on /me: open the send sheet with this rejected payment's rows */
  again?: { key: string; rows: SendAgain } | null;
  onAgainDone?: () => void;
  /** home, first open of the personal link (/?welcome=1) */
  welcome?: boolean;
  /** home from a personal reminder (/?pay=1): open «ادفع الآن» once when there is something due */
  openPay?: boolean;
}) {
  const [d, refresh] = useMemberHome(initial);
  const isDemo = useIsDemo();
  const demo = useMemberDemo();
  const say = useSnack();
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [data, setData] = useState<MemberSheetData | null | undefined>();
  // «ادفع الآن» → wallet → back (P3): one big «أرفق صورة التحويل»; the picked file goes along
  const [back, setBack] = useState(false);
  const [file, setFile] = useState<File | undefined>();
  useEffect(() => {
    if (sheet !== "pay") return;
    let left = false;
    const on = () => {
      if (document.visibilityState === "hidden") left = true;
      else if (left) setBack(true);
    };
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [sheet]);
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

  // first open of the personal link (audit M5): greet once and bring the card into view
  const cardRef = useRef<HTMLElement>(null);
  const loaded = d !== undefined && d !== null;
  useEffect(() => {
    if (!welcome || !loaded) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    cardRef.current?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [welcome, loaded]);

  // «أرسلها من جديد» on /me: open the send sheet once per tap (state adjusted during render)
  const [againKey, setAgainKey] = useState<string | null>(null);
  if (again && again.key !== againKey) {
    setAgainKey(again.key);
    setSheet("again");
  }
  // /?pay=1 (a personal reminder): open «ادفع الآن» once, when the card says late
  const [payShown, setPayShown] = useState(false);
  if (openPay && !payShown && d) {
    setPayShown(true);
    const mine = d.waitingMine + (isDemo ? pendingCounts(demo.sent, d.s.memberId).mine : 0);
    if (youCard(d.s, d.months, d.year, mine).kind === "late") setSheet("pay");
  }
  useEffect(() => {
    if (!payShown) return;
    const u = new URL(window.location.href);
    if (u.searchParams.has("pay")) {
      u.searchParams.delete("pay");
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    }
  }, [payShown]);
  useEffect(() => {
    if ((sheet !== "again" && !(sheet === "pay" && openPay)) || data !== undefined) return;
    memberSheetData()
      .then(setData)
      .catch(() => setData(null));
  }, [sheet, data, openPay]);

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
  const local = isDemo ? pendingCounts(demo.sent, s.memberId) : { sent: 0, mine: 0 };
  const waiting = d.waiting + local.sent;
  const st = youCard(s, d.months, d.year, d.waitingMine + local.mine);
  const dots = youDots(d.months);
  const paidNames = dots.filter((x) => x.state === "paid").map((x) => x.name);
  return (
    <section className="bq-sec bq-you" aria-labelledby="bq-you-h" ref={cardRef}>
      {welcome && (
        <p className="bq-you-hi">
          أهلًا {s.fullName.split(" ")[0]}. هذا رابطك الخاص: تجد هنا أشهرك وترسل صورة تحويلك.
        </p>
      )}
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
          <span className="bq-hint">على هذا الهاتف أيضًا:</span>
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
        {st.kind === "late" || st.kind === "pending" ? I.clock(20) : I.check(20)}
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
            <li key={x.month}>{x.state === "paid" ? <PaidCheck /> : null}</li>
          ))}
        </ol>
        <ol className="bq-you-nums" aria-hidden="true">
          {dots.map((x) => (
            <li key={x.month}>{x.month}</li>
          ))}
        </ol>
      </div>
      <p className="bq-you-key" aria-hidden="true">
        <PaidCheck /> مدفوع
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

      {(sheet === "self" || sheet === "others" || sheet === "again") && (
        <Sheet
          key={sheet}
          label="أرسل صورة التحويل"
          onDone={() => {
            setSheet(null);
            setFile(undefined);
            if (sheet === "again") onAgainDone?.();
          }}
        >
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
                start: sheet === "again" ? "self" : sheet,
                again: sheet === "again" ? (again?.rows ?? undefined) : undefined,
                file: sheet === "self" ? file : undefined,
              }}
              onDone={(t) => {
                setFile(undefined);
                if (sheet === "again") onAgainDone?.();
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
        <Sheet
          key="pay"
          label="ادفع الآن"
          onDone={() => {
            setSheet(null);
            setBack(false);
          }}
        >
          {back ? (
            <div className="bq-rec bq-pay-back">
              <h2>أرسل صورة التحويل</h2>
              <p className="bq-lead">حوّلت المال؟ اختر صورة التحويل من المعرض.</p>
              <label className="bq-btn bq-btn-primary bq-btn-lg bq-press">
                {I.image(22)} أرفق صورة التحويل
                <input
                  type="file"
                  accept="image/*"
                  className="bq-sr"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    setFile(f);
                    setBack(false);
                    setSheet("self");
                  }}
                />
              </label>
              <button type="button" className="bq-link bq-press" onClick={() => setBack(false)}>
                عرض أرقام الصندوق
              </button>
            </div>
          ) : (
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
          )}
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
