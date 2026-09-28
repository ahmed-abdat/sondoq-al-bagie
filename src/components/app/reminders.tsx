"use client";
// Committee late list: one WhatsApp reminder per member (private, with the amount) and one
// message for the members' group (no names, no amounts). Each opened link is logged.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAct } from "./act";
import { groupReminderText, reminderLink, type ReminderContext } from "@/lib/data/reminders";
import type { Arrear } from "@/lib/data/types";
import { waLink } from "@/lib/whatsapp";
import { Avatar } from "./bits";
import { fmt, monthsWord, remindedLabel, memberCode } from "./derive";
import { I } from "./icons";
import { Num, useNow } from "./num";

export function LateList({
  arrears,
  ctx,
}: {
  arrears: Arrear[];
  ctx: Omit<ReminderContext, "publicUrl">;
}) {
  const router = useRouter();
  const { logReminder } = useAct();
  const now = useNow();
  // reminded just now (before the server list catches up)
  const [sent, setSent] = useState<Record<string, string>>({});
  const [groupAt, setGroupAt] = useState<string | null>(null);
  const withUrl = (): ReminderContext => ({
    ...ctx,
    publicUrl: `${window.location.origin}/members`,
  });

  const remind = (a: Arrear) => {
    window.open(reminderLink(a, withUrl()), "_blank", "noopener");
    setSent((s) => ({ ...s, [a.memberId]: new Date().toISOString() }));
    void logReminder({ kind: "individual", memberId: a.memberId }).then(
      (r) => r.ok && router.refresh(),
    );
  };
  const group = () => {
    window.open(
      waLink(null, groupReminderText({ ...withUrl(), lateCount: arrears.length })),
      "_blank",
      "noopener",
    );
    setGroupAt(new Date().toISOString());
    void logReminder({ kind: "group" });
  };

  return (
    <>
      <button type="button" className="bq-row bq-press" onClick={group}>
        <span className="bq-disc is-in">{I.wa(22)}</span>
        <span className="bq-row-m">
          <span className="bq-row-t">تذكير في مجموعة الواتساب</span>
          <span className="bq-row-s">
            {groupAt ? "أُرسل الآن · " : ""}بلا أسماء ولا مبالغ · المتأخرون:{" "}
            <Num>{arrears.length}</Num>
          </span>
        </span>
        <span className="bq-chev">{I.go(18)}</span>
      </button>
      {arrears.length === 0 ? (
        <p className="bq-hint">لا يوجد متأخرون الآن.</p>
      ) : (
        <>
          <p className="bq-hint bq-list-count">
            الأكثر تأخرًا أولًا. التذكير يصل للعضو وحده مع المبلغ.
          </p>
          <ul className="bq-list">
            {arrears.map((a) => {
              const last = sent[a.memberId] ?? a.lastRemindedAt;
              return (
                <li key={a.memberId}>
                  <div className="bq-row">
                    <Avatar code={memberCode(a)} />
                    <span className="bq-row-m">
                      <span className="bq-row-t">{a.fullName}</span>
                      <span className="bq-row-s">
                        متأخر {monthsWord(a.monthsCount)} · <Num>{fmt(a.amountOwed)}</Num> أوقية
                      </span>
                      <span className={`bq-row-s ${sent[a.memberId] ? "is-ok" : ""}`}>
                        {a.phone ? (now ? remindedLabel(last, now) : last ? "ذُكّر من قبل" : "لم يُذكَّر بعد") : "لا يوجد رقم هاتف"}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="bq-icon-btn bq-press"
                      disabled={!a.phone}
                      onClick={() => remind(a)}
                      aria-label={`ذكّر ${a.fullName} عبر واتساب`}
                    >
                      {I.wa(22)}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
