"use client";
// «روابط الأعضاء» (owner-approved prototype C): every active member's personal link, by group,
// with a WhatsApp button per row and «أرسل للجميع بالترتيب» (a card pinned on top walks through
// the members without a link). Sending creates the link (an old one stops; the URL is shown only
// once) and then opens WhatsApp in this tab: after an await a new window would be blocked on iOS.
// The app cannot know whether the message was sent (audit B10): rows say «جُهّز الرابط», and a
// link made on this page can be sent again as is («أرسل مرة أخرى») without stopping it.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import type { MemberLinkInfo } from "@/lib/data/member-types";
import type { MemberAdmin } from "@/lib/data/types";
import { waLink } from "@/lib/whatsapp";
import { useAct, useDemoState } from "./act";
import { MemberNo, Track } from "./bits";
import { groupLabel, searchMembers } from "./derive";
import { I } from "./icons";
import { linkMessage } from "./member-link-admin";
import {
  linkCounts,
  linkRows,
  nextInWalk,
  type LinkRow,
  type LinkState,
} from "./member-links-model";
import { Num } from "./num";
import { SearchField } from "./search-field";
import { Segmented } from "./segmented";
import { useSnack } from "./shell";
import { useAfterReturn } from "./walk-return";
import { SubHead } from "./views/committee";

const STATE_WORD: Record<LinkState, string> = {
  none: "بلا رابط",
  made: "جُهّز الرابط",
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
  // their URLs (in memory only), so a WhatsApp left without sending can be reopened as is
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [walk, setWalk] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  // P9: the walk moves on when the page is back from WhatsApp; «تراجع» returns to that person
  const later = useAfterReturn();
  const [last, setLast] = useState<{ id: string; name: string } | null>(null);
  const moveOn = (r: LinkRow) =>
    later(() => {
      setLast({ id: r.memberId, name: r.fullName });
      advance(r.memberId, skipped);
    });

  const linkOf = (id: string) =>
    made[id] ?? (id in demo.links ? demo.links[id] : (links[id] ?? null));
  const all = linkRows([...members, ...demo.members], linkOf);
  // owner pick «b» (r31): the group first (الكل / أ / ب); the walk, search and filter follow it
  const [g, setG] = useState<string>("all");
  const [f, setF] = useState<"none" | "made" | "all">("none");
  const [q, setQ] = useState("");
  const codes = [...new Set(all.map((r) => r.groupCode))];
  const rows = g === "all" ? all : all.filter((r) => r.groupCode === g);
  const counts = linkCounts(rows);
  const total = linkCounts(all);
  const shown = (() => {
    // links made on this page stay under «بلا رابط» so «أرسل مرة أخرى» stays at hand
    const byF =
      f === "all"
        ? rows
        : rows.filter((r) =>
            f === "none" ? r.state === "none" || !!urls[r.memberId] : r.state !== "none",
          );
    return q.trim() ? searchMembers(byF, q) : byF;
  })();
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
    setUrls((x) => ({ ...x, [r.memberId]: res.data.url }));
    if (inWalk) moveOn(r);
    router.refresh();
    openWhatsApp(waLink(r.phone, linkMessage(r.fullName, res.data.url)));
  };
  /** The same link again (nothing new is created, the link keeps working). */
  const resend = (r: LinkRow, url: string) =>
    openWhatsApp(waLink(r.phone, linkMessage(r.fullName, url)));

  const start = () => {
    setLast(null);
    const fresh = new Set<string>();
    setSkipped(fresh);
    setWalk(nextInWalk(rows, null, fresh));
  };

  return (
    <>
      <SubHead title="روابط الأعضاء" />
      <section className="bq-sec bq-sec-first">
        <div className="bq-ml-count">
          <p className="bq-row-s">
            <Num>{total.made}</Num> من <Num>{total.total}</Num> لهم رابط · بقي{" "}
            <Num>{total.left}</Num>
          </p>
          <Track f={total.total ? total.made / total.total : 0} />
        </div>
        <Segmented
          label="المجموعة"
          value={g}
          onChange={(k) => {
            setG(k);
            setWalk(null);
            setLast(null);
          }}
          items={[
            { k: "all", l: "الكل" },
            ...codes.map((c) => ({
              k: c,
              l: (
                <>
                  المجموعة {groupLabel(c)}{" "}
                  <Num>{all.filter((r) => r.groupCode === c && r.state === "none").length}</Num>
                </>
              ),
            })),
          ]}
        />
        {cur ? (
          <div className="bq-slip bq-ml-walk" aria-live="polite">
            <p className="bq-row-s">
              بالترتيب · بقي <Num>{counts.left}</Num>
            </p>
            {last && (
              <p className="bq-row-s bq-ml-last">
                <span>
                  جُهّز رابط {last.name} · التالي: {cur.fullName}
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
            <p className="bq-ml-walk-t">
              <MemberNo m={cur} /> · {cur.fullName}
            </p>
            {!cur.phone && <p className="bq-hint">بلا رقم هاتف: اختر في واتساب من يوصله له.</p>}
            <div className="bq-ml-walk-btns">
              <button
                type="button"
                className="bq-btn bq-btn-primary bq-press"
                disabled={!!busy || !online}
                onClick={() => {
                  const url = urls[cur.memberId];
                  if (!url || cur.state === "none") return void send(cur, true);
                  // back to someone whose link was made here: the same link, nothing stops
                  setLast(null);
                  resend(cur, url);
                  moveOn(cur);
                }}
              >
                {I.wa(20)}{" "}
                {busy === cur.memberId
                  ? "جارٍ الإنشاء…"
                  : urls[cur.memberId] && cur.state !== "none"
                    ? "أرسل مرة أخرى"
                    : "أرسل في واتساب"}
              </button>
              <button
                type="button"
                className="bq-btn bq-btn-soft bq-press"
                disabled={!!busy}
                onClick={() => {
                  setLast(null);
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
          <button
            type="button"
            className="bq-btn bq-btn-primary bq-btn-lg bq-press"
            disabled={!counts.left || !online}
            onClick={start}
          >
            {I.wa(22)}{" "}
            {g === "all" ? "أرسل للجميع بالترتيب" : `أرسل للمجموعة ${groupLabel(g)} بالترتيب`}
          </button>
        )}
        <OfflineWriteHint />

        <SearchField
          className="bq-small-top"
          value={q}
          onChange={setQ}
          members={rows}
          placeholder="ابحث بالاسم أو الرقم"
          label="ابحث في روابط الأعضاء"
          small
        />
        <div className="bq-chips bq-ml-filter" role="group" aria-label="تصفية">
          {(
            [
              { k: "none", l: "بلا رابط", n: counts.left },
              { k: "made", l: "جُهّز الرابط", n: counts.made },
              { k: "all", l: "الكل", n: counts.total },
            ] as const
          ).map((x) => (
            <button
              key={x.k}
              type="button"
              className="bq-chip bq-press"
              aria-pressed={f === x.k}
              onClick={() => setF(x.k)}
            >
              {x.l} <Num>{x.n}</Num>
            </button>
          ))}
        </div>
        <ul className="bq-list bq-ml-list">
          {shown.slice(0, 40).map((r) => (
            <li key={r.memberId} data-member={r.memberRef}>
              <div className="bq-ml-row" data-current={walk === r.memberId || undefined}>
                <span className="bq-ml-n">
                  <MemberNo m={r} scoped={g !== "all" && r.listCode === g} />
                </span>
                <span className="bq-row-m">
                  <span className="bq-ml-name">
                    {r.fullName}
                    {r.state !== "none" && (
                      // words, not ✓ (audit C6): ✓ means "paid" everywhere else
                      <span className={`bq-kind bq-ml-tick ${r.state === "using" ? "is-in" : ""}`}>
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
                ) : urls[r.memberId] && r.state === "made" ? (
                  <button
                    type="button"
                    className="bq-ml-new bq-press"
                    aria-label={`أرسل الرابط نفسه مرة أخرى: ${r.fullName}`}
                    disabled={!!busy}
                    onClick={() => resend(r, urls[r.memberId])}
                  >
                    {I.wa(18)} أرسل مرة أخرى
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
        {shown.length > 40 && (
          <p className="bq-hint">
            و<Num>{shown.length - 40}</Num> آخرون. ابحث أو اختر مجموعة.
          </p>
        )}
        {shown.length === 0 && <p className="bq-hint">لا أحد هنا.</p>}
      </section>
    </>
  );
}
