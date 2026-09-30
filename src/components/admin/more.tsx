"use client";
// «المزيد» and «سجل العمليات» (plan §4, §7.1: who did what, visible to all the committee).
import Link from "next/link";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/app/logout";
import { Back, Chips, committeeHref, day, Num, useP, X } from "./kit";
import { legacyPendingCount } from "./report-action";
import { CancelSheet } from "./cancel-sheet";
import { useAct } from "@/components/app/act";
import type { PLog } from "./types";

const LOG_ICON: Record<PLog["kind"], keyof typeof X> = {
  pay: "coins",
  ok: "check",
  no: "ban",
  exp: "bag",
  gift: "heart",
  edit: "edit",
  levy: "list",
};

export function LogRow({ l, who = true }: { l: PLog; who?: boolean }) {
  return (
    <div className="pa-row pa-row-plain">
      <span
        className={`pa-ic ${l.kind === "no" ? "pa-ic-rej" : l.kind === "gift" ? "pa-ic-gold" : l.kind === "pay" || l.kind === "ok" ? "pa-ic-g" : ""}`}
      >
        {X[LOG_ICON[l.kind]](22)}
      </span>
      <span className="pa-row-t">
        {who && <b>{l.who}</b>}
        <span className="pa-row-body">{l.what}</span>
        <small>
          {!who && `${l.who} · `}
          {day(l.at)} · <Num>{l.at.slice(11, 16)}</Num>
        </small>
      </span>
    </div>
  );
}

/**
 * «المزيد» is a menu: it needs no fund data, so it shows at once. The only count (old payments
 * not yet confirmed) is asked after it is on screen.
 */
export function MoreMenu({ me }: { me: { name: string; role: string; admin: boolean } }) {
  const href = committeeHref;
  const [pending, setPending] = useState(0);
  useEffect(() => {
    let live = true;
    legacyPendingCount()
      .then((n) => live && setPending(n))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const rows: { t: string; s: string; icon: keyof typeof X; to: string; admin?: boolean }[] = [
    { t: "المصاريف", s: "سجّل مصروفًا، وكل المصاريف", icon: "bag", to: href("expenses") },
    { t: "سجل العمليات", s: "من سجّل ماذا، ومتى", icon: "list", to: href("activity") },
    ...(pending
      ? [
          {
            t: `دفعات قديمة لم تُثبَّت (${pending})`,
            s: "سُجّلت قبل التحديث. ثبّتها لتُحسب.",
            icon: "coins" as const,
            to: href("review"),
          },
        ]
      : []),
    {
      t: "الإعدادات",
      s: me.admin ? "المحافظ، الفئات، النشاط، حسابات اللجنة، التسليم" : "المحافظ، الفئات، النشاط",
      icon: "gear",
      to: href("settings"),
    },
    { t: "حسابي", s: `${me.name} · ${me.role} · الإشعارات`, icon: "user", to: href("account") },
  ];
  return (
    <div className="pa-page">
      <header className="pa-title">
        <h1>المزيد</h1>
      </header>
      <ul className="pa-rows">
        {rows
          .filter((r) => !r.admin || me.admin)
          .map((r) => (
            <li key={r.t}>
              <Link href={r.to} className="pa-row">
                <span className="pa-ic">{X[r.icon](22)}</span>
                <span className="pa-row-t">
                  <b>{r.t}</b>
                  <small>{r.s}</small>
                </span>
                {X.go(20)}
              </Link>
            </li>
          ))}
      </ul>
      <LogoutButton className="pa-btn pa-btn-ghost pa-btn-block">خروج</LogoutButton>
    </div>
  );
}

export function ActivityScreen() {
  const { d } = useP();
  const SETTINGS = "__settings";
  const [f, setF] = useState<string>("all");
  const [cancel, setCancel] = useState<PLog | null>(null);
  const { cancelWalletTransfer } = useAct();
  const main = d.log.filter((l) => !l.settings);
  const people = ["all", ...new Set(main.map((l) => l.who))];
  const hasSettings = d.me.admin && d.log.some((l) => l.settings);
  const shown =
    f === SETTINGS
      ? d.log.filter((l) => l.settings)
      : main.filter((l) => f === "all" || l.who === f);
  return (
    <div className="pa-page">
      <Back to="more" label="المزيد" />
      <header className="pa-title">
        <h1>سجل العمليات</h1>
      </header>
      <p className="pa-lead">كل ما سجّلته اللجنة أو غيّرته، ومن فعله.</p>
      {(people.length > 2 || hasSettings) && (
        <Chips
          label="من"
          value={f}
          onChange={setF}
          options={[
            ...people.map((p) => ({ k: p, l: p === "all" ? "الكل" : p })),
            ...(hasSettings ? [{ k: SETTINGS, l: "تغييرات الإعدادات" }] : []),
          ]}
        />
      )}
      {shown.length ? (
        <ul className="pa-rows">
          {shown.map((l, i) => (
            <li key={i} className={l.transfer ? "pa-log-act" : undefined}>
              <LogRow l={l} />
              {d.me.admin && l.transfer && !l.transfer.cancelled && (
                <button
                  type="button"
                  className="r2-x"
                  aria-label={`ألغِ التحويل: ${l.what}`}
                  onClick={() => setCancel(l)}
                >
                  {X.x(20)}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pa-hint">لا عمليات بعد.</p>
      )}
      {cancel?.transfer && (
        <CancelSheet
          title="ألغِ التحويل"
          reasons={["خطأ في المبلغ", "خطأ في المحفظة", "لم يحدث"]}
          done="أُلغي التحويل."
          onClose={() => setCancel(null)}
          onCancel={(reason) =>
            cancelWalletTransfer({ id: cancel.transfer!.id, reason }).then((r) =>
              r.ok ? { ok: true as const } : { ok: false as const, message: r.message },
            )
          }
        >
          {cancel.what}. يبقى في السجل مع السبب، ويرجع المال إلى مكانه.
        </CancelSheet>
      )}
    </div>
  );
}
