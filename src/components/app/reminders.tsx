"use client";
// Committee late list: one WhatsApp reminder per member (private, with the amount) and one
// message for the members' group (no names, no amounts). Each opened link is logged.
// «ذكّر الجميع بالترتيب» walks the list one card at a time, like «روابط الأعضاء» (audit C5).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAct } from "./act";
import { groupReminderText, reminderLink, type ReminderContext } from "@/lib/data/reminders";
import type { Arrear } from "@/lib/data/types";
import { waLink } from "@/lib/whatsapp";
import { Avatar } from "./bits";
import { fmt, remindedLabel, unpaidSince } from "./derive";
import { I } from "./icons";
import { Num, useNow } from "./num";
import { useAfterReturn } from "./walk-return";

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
  const [walk, setWalk] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  // the next action first (QA pass 5): three names, the whole roster on demand
  const [showAll, setShowAll] = useState(false);
  // P9: the walk moves on when the page is back from WhatsApp; «تراجع» returns to that person
  const later = useAfterReturn();
  const [last, setLast] = useState<{ id: string; name: string } | null>(null);
  // the walk: members with a phone not reminded on this visit, most late first
  const queue = (skip: ReadonlySet<string>, done: Record<string, string>) =>
    arrears.filter((a) => a.phone && !done[a.memberId] && !skip.has(a.memberId));
  const left = queue(new Set(), sent).length;
  const cur = walk ? (arrears.find((a) => a.memberId === walk) ?? null) : null;
  const next = (skip: ReadonlySet<string>, done: Record<string, string>) =>
    setWalk(queue(skip, done)[0]?.memberId ?? null);
  const withUrl = (): ReminderContext => ({
    ...ctx,
    publicUrl: `${window.location.origin}/members`,
  });

  const remind = (a: Arrear, inWalk = false) => {
    window.open(
      reminderLink(a, { ...withUrl(), payUrl: `${window.location.origin}/?pay=1` }),
      "_blank",
      "noopener",
    );
    const done = { ...sent, [a.memberId]: new Date().toISOString() };
    setSent(done);
    if (inWalk)
      later(() => {
        setLast({ id: a.memberId, name: a.fullName });
        next(skipped, done);
      });
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
            {groupAt ? "فُتحت رسالة واتساب · " : ""}بلا أسماء ولا مبالغ · المتأخرون:{" "}
            <Num>{arrears.length}</Num>
          </span>
        </span>
        <span className="bq-chev">{I.go(18)}</span>
      </button>
      {arrears.length === 0 ? (
        <p className="bq-hint">لا يوجد متأخرون الآن.</p>
      ) : (
        <>
          {cur ? (
            <div className="bq-slip bq-ml-walk" aria-live="polite">
              <p className="bq-row-s">
                بالترتيب · بقي <Num>{left}</Num>
              </p>
              {last && (
                <p className="bq-row-s bq-ml-last">
                  <span>
                    فُتحت رسالة واتساب لـ {last.name} · التالي: {cur.fullName}
                  </span>
                  <button
                    type="button"
                    className="bq-link bq-link-s bq-press"
                    onClick={() => {
                      setWalk(last.id);
                      setLast(null);
                    }}
                  >
                    تراجع
                  </button>
                </p>
              )}
              <p className="bq-ml-walk-t">{cur.fullName}</p>
              <p className="bq-row-s">
                {unpaidSince(cur.months)} · عليه حتى الآن <Num>{fmt(cur.amountOwed)}</Num> أوقية
              </p>
              <div className="bq-ml-walk-btns">
                <button
                  type="button"
                  className="bq-btn bq-btn-primary bq-press"
                  onClick={() => remind(cur, true)}
                >
                  {I.wa(20)} افتح الرسالة في واتساب
                </button>
                <button
                  type="button"
                  className="bq-btn bq-btn-soft bq-press"
                  onClick={() => {
                    setLast(null);
                    const s = new Set(skipped).add(cur.memberId);
                    setSkipped(s);
                    next(s, sent);
                  }}
                >
                  تخطَّ
                </button>
                <button
                  type="button"
                  className="bq-btn bq-btn-ghost bq-press"
                  onClick={() => setWalk(null)}
                >
                  إيقاف
                </button>
              </div>
            </div>
          ) : (
            left > 0 && (
              <button
                type="button"
                className="bq-btn bq-btn-primary bq-btn-lg bq-press bq-small-top"
                onClick={() => {
                  setLast(null);
                  const s = new Set<string>();
                  setSkipped(s);
                  next(s, sent);
                }}
              >
                {I.wa(22)} ذكّر الجميع بالترتيب
              </button>
            )
          )}
          <p className="bq-hint bq-list-count">
            الأكثر تأخرًا أولًا. افتح رسالة كل عضو في واتساب وأرسلها له.
          </p>
          <ul className="bq-list">
            {(showAll ? arrears : arrears.slice(0, 3)).map((a) => {
              const last = sent[a.memberId] ?? a.lastRemindedAt;
              return (
                <li key={a.memberId}>
                  <div className="bq-row">
                    <Avatar m={a} />
                    <span className="bq-row-m">
                      <span className="bq-row-t">{a.fullName}</span>
                      <span className="bq-row-s">
                        {unpaidSince(a.months)} · عليه حتى الآن <Num>{fmt(a.amountOwed)}</Num> أوقية
                      </span>
                      <span className={`bq-row-s ${sent[a.memberId] ? "is-ok" : ""}`}>
                        {a.phone
                          ? sent[a.memberId]
                            ? "فُتحت رسالة واتساب"
                            : now
                              ? remindedLabel(last, now)
                              : last
                                ? "فُتحت له رسالة من قبل"
                                : "لم تُفتح له رسالة بعد"
                          : "لا يوجد رقم هاتف"}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="bq-icon-btn bq-press"
                      disabled={!a.phone}
                      onClick={() => remind(a)}
                      aria-label={`افتح رسالة التذكير في واتساب: ${a.fullName}`}
                    >
                      {I.wa(22)}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {arrears.length > 3 && (
            <button
              type="button"
              className="bq-link bq-press"
              aria-expanded={showAll}
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "عرض أقل" : `عرض كل المتأخرين (${arrears.length})`} {I.chev(18)}
            </button>
          )}
        </>
      )}
    </>
  );
}
