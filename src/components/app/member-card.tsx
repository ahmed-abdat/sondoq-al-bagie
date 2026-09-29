"use client";
// «أنت»: what a member's personal link adds on top of the public pages. The card (status, months
// as dots, credit, waiting submissions) and its two sheets: «أرسلت دفعة» (the committee record
// flow in member mode) and «ادفع الآن» (the fund's wallets and the amount due).
import Link from "next/link";
import { useEffect, useState } from "react";
import { MemberLinkPaste } from "@/components/providers";
import { useIsDemo } from "./act";
import { Avatar, MemberNo } from "./bits";
import { fmt, groupLabel } from "./derive";
import { I } from "./icons";
import { rememberDemoMember, useMemberDemo } from "./member-act";
import { DOT_WORD, waitingLine, youDots, youStatus } from "./member-model";
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

// the last answer, so moving between tabs does not flash the card away while it refreshes
let last: MemberHome | null | undefined;
/** After «خروج من هذا الجهاز»: forget the card. */
export function forgetMemberCard() {
  last = null;
}

/** Fetch the member's card data (null = no valid link here). `initial` comes from a dynamic page. */
function useMemberHome(initial?: MemberHome | null) {
  const [d, setD] = useState<MemberHome | null | undefined>(initial ?? last);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (initial !== undefined && tick === 0) return;
    let live = true;
    memberHome()
      .then((v) => {
        last = v;
        if (live) setD(v);
      })
      .catch(() => {}); // offline: keep what we had
    return () => {
      live = false;
    };
  }, [initial, tick]);
  return [d, () => setTick((n) => n + 1)] as const;
}

type SheetKind = "send" | "pay";

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
  const st = youStatus(s);
  const dots = youDots(d.months);
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
      <p className={`bq-you-st ${st.late ? "is-late" : "is-ok"}`}>
        {st.late ? I.clock(20) : I.check(20)}
        <span>{st.text}</span>
      </p>
      <ol className="bq-you-dots" aria-label={`أشهر ${d.year}`}>
        {dots.map((x) => (
          <li key={x.month} className={`is-${x.state}`}>
            <span className="bq-sr">
              {x.name}: {DOT_WORD[x.state]}
            </span>
          </li>
        ))}
      </ol>
      <p className="bq-you-key" aria-hidden="true">
        <span className="is-paid">مدفوع</span>
        <span className="is-late">متأخر</span>
        <span className="is-upcoming">لم يحن</span>
      </p>
      {s.credit > 0 && (
        <p className="bq-hint">
          لك رصيد <Num>{fmt(s.credit)}</Num> أوقية.
        </p>
      )}
      {waiting > 0 && (
        <p className="bq-you-wait">
          {I.clock(18)} {waitingLine(waiting)}
        </p>
      )}
      <div className="bq-btn-col bq-small-top">
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          onClick={() => open("send")}
        >
          {I.image(20)} أرسلت دفعة
        </button>
        <button type="button" className="bq-btn bq-btn-soft bq-press" onClick={() => open("pay")}>
          ادفع الآن
        </button>
      </div>
      {!onMe && (
        <Link className="bq-link bq-press" href="/me" transitionTypes={["tab-fwd"]}>
          دفعاتي
          {I.go(18)}
        </Link>
      )}

      {sheet === "send" && (
        <Sheet key="send" label="أرسلت دفعة" onDone={() => setSheet(null)}>
          {data ? (
            <RecordBody
              members={data.members}
              ctx={data.ctx}
              accounts={data.accounts}
              campaigns={data.campaigns}
              member={{ selfId: s.memberId, selfName: s.fullName, recent: data.recent }}
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
                عليك حتى الآن <Num className="bq-strong">{fmt(s.amountOwed)}</Num> أوقية.
              </p>
            )}
            <p className="bq-rec-k">حوّل إلى أحد أرقام الصندوق</p>
            {data ? <PayTo accounts={data.accounts} /> : <SheetWait failed={data === null} />}
            <p className="bq-hint">بعد التحويل اضغط «أرسلت دفعة» وأرفق صورة التحويل.</p>
            <button
              type="button"
              className="bq-btn bq-btn-primary bq-btn-lg bq-press"
              onClick={() => setSheet("send")}
            >
              أرسلت دفعة
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
