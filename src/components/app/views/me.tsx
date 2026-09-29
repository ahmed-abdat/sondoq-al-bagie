"use client";
// «دفعاتي» (/me): only for a browser that opened a member's personal link. My payments, the ones
// I sent for others, and my submissions waiting for the committee or rejected with the reason.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { waLink } from "@/lib/whatsapp";
import { MethodBadge } from "../bits";
import { dayWords, fmt } from "../derive";
import { I } from "../icons";
import { MemberLinkPaste } from "@/components/providers";
import { forgetMemberOnThisDevice, MemberPushToggle } from "@/components/providers/member-push";
import { useMemberAct, useMemberDemo } from "../member-act";
import { forgetMemberCard, MemberCard } from "../member-card";
import { coverLines, historySections } from "../member-model";
import type { MemberHistoryItem } from "@/lib/data/member-types";
import type { MemberHome } from "../member-view-action";
import { Num } from "../num";
import { verifyPath } from "../receipt-model";
import { SITE_URL } from "../site";

export function MeView({
  home,
  history: server,
}: {
  home: MemberHome | null;
  history: MemberHistoryItem[];
}) {
  const demo = useMemberDemo();
  if (!home)
    return (
      <>
        <header className="bq-page-h">
          <h1>دفعاتي</h1>
        </header>
        <section className="bq-sec bq-sec-first">
          <div className="bq-empty">
            <span className="bq-disc">{I.lock(22)}</span>
            <p className="bq-empty-t">هذه الصفحة لمن فتح رابطه الخاص</p>
            <p className="bq-hint">
              اطلب رابطك من اللجنة، ثم افتحه على هذا الجهاز لترى دفعاتك وترسل دفعة جديدة.
            </p>
          </div>
          <MemberLinkPaste />
          <Link className="bq-link bq-press" href="/" transitionTypes={["tab-back"]}>
            إلى الصفحة الرئيسية {I.go(18)}
          </Link>
        </section>
      </>
    );

  const me = home.s.memberId;
  const who = { me, myName: home.s.fullName };
  const all = [...demo.sent.filter((x) => !server.some((y) => y.id === x.id)), ...server];
  const s = historySections(all);
  return (
    <>
      <header className="bq-page-h">
        <h1>دفعاتي</h1>
        <p className="bq-lead">لا يراها غيرك. الصفحات العامة تبقى كما هي للجميع.</p>
      </header>
      <MemberCard initial={home} onMe />

      {s.waiting.length > 0 && (
        <Group id="bq-me-wait" title="بانتظار التأكيد" items={s.waiting} {...who} />
      )}
      {s.rejected.length > 0 && <Group id="bq-me-rej" title="مرفوضة" items={s.rejected} {...who} />}
      <Group
        id="bq-me-mine"
        title="دفعاتي المؤكَّدة"
        items={s.mine}
        {...who}
        empty="لا توجد دفعات مؤكَّدة عنك بعد."
      />
      {s.forOthers.length > 0 && (
        <Group id="bq-me-others" title="دفعات أرسلتها لغيري" items={s.forOthers} {...who} />
      )}

      <section className="bq-sec" aria-labelledby="bq-me-dev">
        <h2 id="bq-me-dev">هذا الجهاز</h2>
        <MemberPushToggle />
        <SignOut name={home.s.fullName} others={home.profiles.length - 1} />
      </section>
    </>
  );
}

function Group({
  id,
  title,
  items,
  me,
  myName,
  empty,
}: {
  id: string;
  title: string;
  items: MemberHistoryItem[];
  me: string;
  myName: string;
  empty?: string;
}) {
  return (
    <section className="bq-sec" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {items.length ? (
        <ul className="bq-list">
          {items.map((x) => (
            <HistoryRow key={x.id} x={x} me={me} myName={myName} />
          ))}
        </ul>
      ) : (
        empty && <p className="bq-hint">{empty}</p>
      )}
    </section>
  );
}

function HistoryRow({ x, me, myName }: { x: MemberHistoryItem; me: string; myName: string }) {
  const lines = coverLines(x, me);
  const code = x.receiptCode;
  const url = code ? `${SITE_URL}${verifyPath(code)}` : "";
  return (
    <li className="bq-me-row">
      <span className={`bq-disc ${x.status === "confirmed" ? "is-in" : ""}`} aria-hidden="true">
        {x.status === "confirmed" ? I.check(22) : x.status === "rejected" ? I.ban(22) : I.clock(22)}
      </span>
      <span className="bq-row-m">
        <span className="bq-row-t">
          <Num>{fmt(x.amount)}</Num> أوقية
        </span>
        <span className="bq-row-s bq-row-sm">
          <MethodBadge method={x.method} size={20} label={false} />
          <span>
            {dayWords(x.paidOn)}
            {x.payerName && x.payerName !== myName ? ` · الدافع: ${x.payerName}` : ""}
          </span>
        </span>
        {lines.map((l) => (
          <span key={l} className="bq-row-s">
            {l}
          </span>
        ))}
        {x.status === "rejected" && (
          <span className="bq-me-rej">
            <span className="bq-kind is-rej">مرفوض</span>
            {x.rejectReason ? `السبب: ${x.rejectReason}` : "رفضتها اللجنة."}
          </span>
        )}
        {x.status === "pending" && (
          <span className="bq-row-s">تراجعها اللجنة وتؤكدها بعد مطابقة الصورة.</span>
        )}
        {code && (
          <span className="bq-me-acts">
            <Link className="bq-link bq-link-s bq-press" href={verifyPath(code)}>
              الوصل {I.go(16)}
            </Link>
            {url && (
              <a
                className="bq-link bq-link-s bq-press"
                href={waLink(null, `وصل دفعتي في صندوق الرابطة:\n${url}`)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {I.wa(18)} مشاركة
              </a>
            )}
          </span>
        )}
      </span>
    </li>
  );
}

/** «خروج من هذا الجهاز»: this browser forgets the link (the link itself keeps working). */
function SignOut({ name, others }: { name: string; others: number }) {
  const router = useRouter();
  const online = useOnline();
  const { memberSignOut } = useMemberAct();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!ask)
    return (
      <button
        type="button"
        className="bq-btn bq-btn-tonal bq-press bq-small-top"
        onClick={() => setAsk(true)}
      >
        {I.out(20)} إزالة {name} من هذا الهاتف
      </button>
    );
  return (
    <div className="bq-rej bq-small-top">
      <p className="bq-lead">
        لن يظهر {name} على هذا الهاتف بعد الآن.
        {others > 0 ? " يبقى الآخرون كما هم." : ""} تبقى رسالة اللجنة التي فيها الرابط، ويمكن فتحه
        من جديد.
      </p>
      {err && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
      <div className="bq-slip-btns">
        <button
          type="button"
          className="bq-btn bq-btn-tonal bq-press"
          disabled={busy || !online}
          onClick={async () => {
            setBusy(true);
            setErr("");
            // the last person on this phone: member notifications stop here too
            const endpoint =
              others === 0 ? await forgetMemberOnThisDevice().catch(() => undefined) : undefined;
            const r = await memberSignOut({ endpoint });
            setBusy(false);
            if (!r.ok) return setErr(r.message);
            forgetMemberCard();
            router.replace("/");
            router.refresh();
          }}
        >
          {busy ? "جارٍ الإزالة…" : "نعم، أزِله"}
        </button>
        <button
          type="button"
          className="bq-btn bq-btn-ghost bq-press"
          onClick={() => setAsk(false)}
        >
          رجوع
        </button>
      </div>
      <OfflineWriteHint />
    </div>
  );
}
