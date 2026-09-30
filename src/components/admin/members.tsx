"use client";
// «الأعضاء» (owner pick A): the list with search and filters; a member's page is his «كشف حساب»
// (member_statement): the year's months, what he owes, every payment with who recorded it.
// «شارك الكشف» sends the same statement as images, PDF or text. Cancelling is «مسؤول» only.
import Link from "next/link";
import { Fragment, useState } from "react";
import { useAct } from "@/components/app/act";
import type { MemberStatement } from "@/lib/data/report-types";
import { pastWords } from "./fees";
import {
  Avatar,
  Back,
  Chips,
  day,
  feesOwed,
  findMembers,
  levyOwed,
  levyShare,
  Money,
  MonthGrid,
  monthsWords,
  Num,
  owedAmount,
  owes,
  payStatus,
  useP,
  Wallet,
  X,
} from "./kit";
import { ReportSheet, useReport } from "./report-doc";
import { CancelSheet } from "./cancel-sheet";
import { AddMemberSheet, EditMemberSheet } from "./manage-sheets";
import type { PMember } from "./types";

/* ───────── the list ───────── */
/** everyone, who owes, or one «الفئة» (fee group) by its code */
type MF = string;
export function MembersScreen() {
  const { d, href, q: query } = useP();
  const [q, setQ] = useState("");
  const [f, setF] = useState<MF>(query.f === "owe" ? "owe" : "all");
  const [add, setAdd] = useState(false);
  const [share, setShare] = useState(false);
  const shown = d.members
    .filter((m) => m.status !== "left" && m.status !== "deceased")
    .filter((m) => (f === "owe" ? owes(m, d) : f === "all" ? true : m.feeGroup.code === f));
  const list = q.trim() ? findMembers(shown, q) : shown;
  const oweCount = d.members.filter((m) => owes(m, d)).length;
  const groups = [
    ...new Map(
      d.members.filter((m) => m.status === "active").map((m) => [m.feeGroup.code, m.feeGroup]),
    ).values(),
  ].sort((a, b) => a.code.localeCompare(b.code));
  return (
    <div className="pa-page">
      <header className="pa-title">
        <h1>الأعضاء</h1>
        {d.me.admin && (
          <button
            type="button"
            className="pa-btn pa-btn-soft pa-btn-sm"
            onClick={() => setAdd(true)}
          >
            {X.plus(20)} عضو جديد
          </button>
        )}
      </header>
      <label className="pa-search">
        {X.search(22)}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="اسم العضو أو رقمه، مثل ب 12"
          aria-label="ابحث عن عضو"
        />
      </label>
      <Chips
        label="تصفية"
        value={f}
        onChange={setF}
        options={[
          { k: "all", l: "الكل" },
          { k: "owe", l: `عليهم متأخرات (${oweCount})` },
          ...groups.map((g) => ({ k: g.code, l: `الفئة ${g.name}` })),
        ]}
      />
      {f === "owe" && (
        <button
          type="button"
          className="pa-btn pa-btn-soft pa-btn-block"
          onClick={() => setShare(true)}
        >
          {X.share(20)} شارك المتأخرات في المجموعة
        </button>
      )}
      <ul className="pa-rows">
        {list.map((m) => (
          <li key={m.ref}>
            <Link href={href(`members/${m.ref}`)} className="pa-row">
              <Avatar refs={m.ref} />
              <span className="pa-row-t">
                <b>{m.name}</b>
                <small>{payStatus(m)}</small>
              </span>
              {X.go(20)}
            </Link>
          </li>
        ))}
        {!list.length && <li className="pa-empty">لا أحد بهذا الاسم أو الرقم.</li>}
      </ul>
      {add && <AddMemberSheet onClose={() => setAdd(false)} />}
      <ReportSheet
        open={share}
        onClose={() => setShare(false)}
        title="شارك المتأخرات"
        req={{ kind: "late", year: d.year }}
      />
    </div>
  );
}

/* ───────── one member = «كشف حساب» ───────── */
export function MemberScreen({ refs }: { refs: string }) {
  const { d, href } = useP();
  // by paper ref («A-4») or by id (a notification opens /committee/members/<id>)
  const m = d.members.find((x) => x.ref === refs || x.id === refs);
  const [share, setShare] = useState(false);
  const [edit, setEdit] = useState(false);
  if (!m)
    return (
      <div className="pa-page">
        <Back to="members" label="الأعضاء" />
        <p className="pa-empty">لا يوجد عضو بهذا الرقم.</p>
      </div>
    );
  return (
    <div className="pa-page">
      <Back to="members" label="الأعضاء" />
      <header className="pa-member-h">
        <Avatar refs={m.ref} tone="g" />
        <div>
          <h1>{m.name}</h1>
          <p className="pa-sub">
            الفئة {m.feeGroup.name} · المستحقات الشهرية <Money v={m.fee} />
          </p>
          {m.phone && (
            <p className="pa-sub">
              <Num>{`+${m.phone.slice(0, 3)} ${m.phone.slice(3)}`}</Num>
            </p>
          )}
        </div>
      </header>
      <div className="pa-actions">
        {m.status === "active" && (
          <Link href={href("record", { m: m.ref })} className="pa-btn pa-btn-primary">
            {X.plus(20)} سجّل دفعة له
          </Link>
        )}
        <button type="button" className="pa-btn pa-btn-tonal" onClick={() => setShare(true)}>
          {X.share(20)} شارك الكشف
        </button>
      </div>
      <section className="pa-sec">
        <h2>
          سنة <Num>{d.year}</Num>
        </h2>
        <p className="pa-status">{payStatus(m)}</p>
        <MonthGrid m={m} />
      </section>
      <Owed m={m} />
      <Payments m={m} />
      {d.me.admin && (
        <button
          type="button"
          className="pa-btn pa-btn-ghost pa-btn-block"
          onClick={() => setEdit(true)}
        >
          {X.edit(20)} تعديل البيانات والحالة
        </button>
      )}
      {edit && <EditMemberSheet memberId={m.id} onClose={() => setEdit(false)} />}
      <ReportSheet
        open={share}
        onClose={() => setShare(false)}
        title="شارك كشف الحساب"
        req={{ kind: "member", memberId: m.id, year: d.year }}
      />
    </div>
  );
}

function Owed({ m }: { m: PMember }) {
  const { d } = useP();
  const lv = levyOwed(m, d);
  if (!owes(m, d))
    return (
      <section className="pa-sec">
        <h2>ما عليه الآن</h2>
        <p className="pa-quiet">لا شيء عليه. {X.check(18)}</p>
      </section>
    );
  const fees = feesOwed(m, d);
  const what = [
    m.pastLate.length ? pastWords(m.pastLate) : "",
    m.owed.length ? `${monthsWords(m.owed)}${m.pastLate.length ? ` ${d.year}` : ""}` : "",
  ]
    .filter(Boolean)
    .join("، و");
  return (
    <section className="pa-sec">
      <h2>ما عليه الآن</h2>
      <dl className="pa-dl pa-dl-owe">
        {fees > 0 && (
          <>
            <dt>مستحقات {what}</dt>
            <dd>
              <Money v={fees} />
            </dd>
          </>
        )}
        {lv.map((l) => (
          <Fragment key={l.id}>
            <dt>لوحة {l.title}</dt>
            <dd>
              <Money v={levyShare(l, m.ref)} />
            </dd>
          </Fragment>
        ))}
        <dt className="pa-sum-total">المجموع</dt>
        <dd className="pa-sum-total">
          <Money v={owedAmount(m, d)} />
        </dd>
      </dl>
    </section>
  );
}

const monthsOf = (keys: string[], year: number) => {
  const now = keys.filter((k) => k.startsWith(`${year}-`)).map((k) => Number(k.slice(5)));
  const past = keys.filter((k) => !k.startsWith(`${year}-`));
  return [past.length ? pastWords(past) : "", now.length ? monthsWords(now) : ""]
    .filter(Boolean)
    .join("، و");
};

/** Every payment of the year from the statement, with who recorded it; «مسؤول» can cancel. */
function Payments({ m }: { m: PMember }) {
  const { d } = useP();
  const r = useReport({ kind: "member", memberId: m.id, year: d.year });
  const [cancel, setCancel] = useState<MemberStatement["payments"][number] | null>(null);
  const st = r?.kind === "member" ? r.data : null;
  return (
    <section className="pa-sec">
      <h2>الدفعات</h2>
      {r === undefined ? (
        <p className="pa-hint" role="status">
          جارٍ التحميل…
        </p>
      ) : !st ? (
        <p className="pa-alert" role="alert">
          تعذّر تحميل الدفعات. تحقق من الإنترنت.
        </p>
      ) : !st.payments.length ? (
        <p className="pa-empty">لا دفعات هذا العام.</p>
      ) : (
        <ul className="pa-hist">
          {[...st.payments]
            .sort((a, b) => b.paidOn.localeCompare(a.paidOn))
            .map((p) => {
              const off = p.status === "cancelled" || p.status === "rejected";
              const what = [
                p.months.length ? `مستحقات ${monthsOf(p.months, d.year)}` : "",
                ...p.campaigns,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={p.paymentId} className={off ? "pa-hist-cancelled" : "pa-hist-confirmed"}>
                  <div className="pa-hist-top">
                    <b>{what || "دفعة"}</b>
                    <Money v={p.amount} />
                  </div>
                  <p className="pa-hist-meta">
                    {day(p.paidOn)} · <Wallet method={p.method} size={18} />
                  </p>
                  {p.recordedBy && <p className="pa-hist-who">سجّلها {p.recordedBy}</p>}
                  {off && (
                    <p className="pa-hist-rej">
                      <span className="pa-tag-rej">أُلغيت</span>
                      {p.cancelledBy ? ` ألغاها ${p.cancelledBy}.` : ""}
                      {p.reason ? ` السبب: ${p.reason}` : ""}
                    </p>
                  )}
                  {!off && d.me.admin && (
                    <button
                      type="button"
                      className="pa-btn pa-btn-ghost pa-btn-sm"
                      onClick={() => setCancel(p)}
                    >
                      ألغِ الدفعة
                    </button>
                  )}
                </li>
              );
            })}
        </ul>
      )}
      {cancel && <CancelPayment p={cancel} onClose={() => setCancel(null)} />}
    </section>
  );
}

/** «مسؤول» only: cancel with a reason; the months become unpaid again (the log names who, why). */
function CancelPayment({
  p,
  onClose,
}: {
  p: MemberStatement["payments"][number];
  onClose: () => void;
}) {
  const { cancelPayment } = useAct();
  return (
    <CancelSheet
      title="ألغِ الدفعة"
      onClose={onClose}
      done="أُلغيت الدفعة. عادت أشهرها غير مدفوعة."
      onCancel={(reason) =>
        cancelPayment({ id: p.paymentId, reason }).then((r) =>
          r.ok ? { ok: true as const } : { ok: false as const, message: r.message },
        )
      }
    >
      دفعة <Money v={p.amount} /> يوم {day(p.paidOn)}. لا تُحذف: تبقى في السجل مع السبب، وتعود
      أشهرها غير مدفوعة.
    </CancelSheet>
  );
}
