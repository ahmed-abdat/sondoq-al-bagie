"use client";
// «روابط الأعضاء» (owner-approved prototype C): every active member's personal link, by group,
// with a WhatsApp button per row and «أرسل للجميع بالترتيب» (a card pinned on top walks through
// the members without a link). Sending creates the link (an old one stops; the URL is shown only
// once) and then opens WhatsApp in this tab: after an await a new window would be blocked on iOS.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import type { MemberLinkInfo } from "@/lib/data/member-types";
import type { MemberAdmin } from "@/lib/data/types";
import { waLink } from "@/lib/whatsapp";
import { useAct, useDemoState } from "./act";
import { MemberNo } from "./bits";
import { groupLabel } from "./derive";
import { I } from "./icons";
import { linkMessage } from "./member-link-admin";
import {
  linkCounts,
  linkGroups,
  linkRows,
  nextInWalk,
  type LinkRow,
  type LinkState,
} from "./member-links-model";
import { Num } from "./num";
import { useSnack } from "./shell";
import { SubHead } from "./views/committee";

const STATE_WORD: Record<LinkState, string> = {
  none: "لم يُرسل",
  sent: "أُرسل",
  using: "فتحه",
};

/** Open WhatsApp in this tab (a popup after an await is blocked on iOS Safari). */
function openWhatsApp(url: string) {
  window.location.href = url;
}

export function MemberLinksPage({
  members,
  links,
}: {
  members: MemberAdmin[];
  /** active links by member id */
  links: Record<string, MemberLinkInfo>;
}) {
  const router = useRouter();
  const online = useOnline();
  const say = useSnack();
  const demo = useDemoState();
  const { createMemberLink } = useAct();
  // links made on this page, before the server refresh arrives
  const [made, setMade] = useState<Record<string, MemberLinkInfo>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [walk, setWalk] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());

  const linkOf = (id: string) =>
    made[id] ?? (id in demo.links ? demo.links[id] : (links[id] ?? null));
  const rows = linkRows([...members, ...demo.members], linkOf);
  const counts = linkCounts(rows);
  const cur = walk ? (rows.find((r) => r.memberId === walk) ?? null) : null;

  const advance = (from: string, skip: ReadonlySet<string>) => {
    const next = nextInWalk(rows, from, skip);
    setWalk(next);
    if (!next) say("انتهى الإرسال بالترتيب");
  };

  const send = async (r: LinkRow, inWalk = false) => {
    if (busy) return;
    setConfirm(null);
    setBusy(r.memberId);
    const res = await createMemberLink({ memberId: r.memberId });
    setBusy(null);
    if (!res.ok) {
      if (res.message) say(res.message);
      return;
    }
    setMade((x) => ({
      ...x,
      [r.memberId]: { memberId: r.memberId, createdAt: new Date().toISOString(), lastUsedAt: null },
    }));
    if (inWalk) advance(r.memberId, skipped);
    router.refresh();
    openWhatsApp(waLink(r.phone, linkMessage(r.fullName, res.data.url)));
  };

  const start = () => {
    const fresh = new Set<string>();
    setSkipped(fresh);
    setWalk(nextInWalk(rows, null, fresh));
  };

  return (
    <>
      <SubHead title="روابط الأعضاء" />
      <section className="bq-sec bq-sec-first">
        {cur ? (
          <div className="bq-slip bq-ml-walk" aria-live="polite">
            <p className="bq-row-s">
              بالترتيب · بقي <Num>{counts.left}</Num>
            </p>
            <p className="bq-ml-walk-t">
              <MemberNo m={cur} /> · {cur.fullName}
            </p>
            {!cur.phone && <p className="bq-hint">بلا رقم هاتف: اختر في واتساب من يوصله له.</p>}
            <div className="bq-ml-walk-btns">
              <button
                type="button"
                className="bq-btn bq-btn-primary bq-press"
                disabled={!!busy || !online}
                onClick={() => void send(cur, true)}
              >
                {I.wa(20)} {busy === cur.memberId ? "جارٍ الإنشاء…" : "أرسل في واتساب"}
              </button>
              <button
                type="button"
                className="bq-btn bq-btn-soft bq-press"
                disabled={!!busy}
                onClick={() => {
                  const s = new Set(skipped).add(cur.memberId);
                  setSkipped(s);
                  advance(cur.memberId, s);
                }}
              >
                تخطَّ
              </button>
              <button
                type="button"
                className="bq-btn bq-btn-ghost bq-press"
                disabled={!!busy}
                onClick={() => setWalk(null)}
              >
                إيقاف
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="bq-row-s bq-ml-count">
              <Num>{counts.sent}</Num> من <Num>{counts.total}</Num> أُرسل · بقي{" "}
              <Num>{counts.left}</Num>
            </p>
            <button
              type="button"
              className="bq-btn bq-btn-primary bq-btn-lg bq-press"
              disabled={!counts.left || !online}
              onClick={start}
            >
              {I.wa(22)} أرسل للجميع بالترتيب
            </button>
          </>
        )}
        <OfflineWriteHint />

        {linkGroups(rows).map((g) => (
          <section key={g.code} className="bq-group" aria-label={`المجموعة ${groupLabel(g.code)}`}>
            <h2 className="bq-group-h">
              <span className="bq-group-t">المجموعة {groupLabel(g.code)}</span>
              <span className="bq-group-n bq-num">
                {g.sent}/{g.items.length}
              </span>
            </h2>
            <ul className="bq-list">
              {g.items.map((r) => (
                <li key={r.memberId} data-member={r.memberRef}>
                  <div className="bq-ml-row" data-current={walk === r.memberId || undefined}>
                    <span className="bq-ml-n">
                      <MemberNo m={r} scoped={r.listCode === g.code} />
                    </span>
                    <span className="bq-row-m">
                      <span className="bq-ml-name">
                        {r.fullName}
                        {r.state !== "none" && (
                          // words, not ✓ (audit C6): ✓ means "paid" everywhere else
                          <span
                            className={`bq-kind bq-ml-tick ${r.state === "using" ? "is-in" : ""}`}
                          >
                            {STATE_WORD[r.state]}
                          </span>
                        )}
                      </span>
                      {!r.phone && <span className="bq-row-s">بلا رقم هاتف</span>}
                    </span>
                    {r.state === "none" ? (
                      <button
                        type="button"
                        className="bq-ml-wa bq-press"
                        aria-label={`أرسل الرابط في واتساب: ${r.fullName}`}
                        disabled={!!busy || !online}
                        onClick={() => void send(r)}
                      >
                        {busy === r.memberId ? I.dots(20) : I.wa(22)}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="bq-ml-new bq-press"
                        aria-label={`رابط جديد: ${r.fullName}`}
                        aria-expanded={confirm === r.memberId}
                        disabled={!!busy || !online}
                        onClick={() => setConfirm(confirm === r.memberId ? null : r.memberId)}
                      >
                        {busy === r.memberId ? I.dots(18) : I.wa(18)} رابط جديد
                      </button>
                    )}
                  </div>
                  {confirm === r.memberId && (
                    <div className="bq-ml-confirm" role="group" aria-label="رابط جديد">
                      <p>سيتوقف الرابط القديم. أرسل رابطًا جديدًا؟</p>
                      <div className="bq-slip-btns">
                        <button
                          type="button"
                          className="bq-btn bq-btn-primary bq-press"
                          disabled={!!busy || !online}
                          onClick={() => void send(r)}
                        >
                          {I.wa(20)} أرسل رابطًا جديدًا
                        </button>
                        <button
                          type="button"
                          className="bq-btn bq-btn-ghost bq-press"
                          onClick={() => setConfirm(null)}
                        >
                          رجوع
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </section>
    </>
  );
}
