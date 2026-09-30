"use client";
// PROTOTYPE direction B «الصندوق أولًا»: the balance is the first thing; two big buttons; the
// record flow is ONE long page with a sticky summary footer; reports are 7 cards + a period row.
import Link from "next/link";
import { useState } from "react";
import {
  Avatar,
  Back,
  Bar,
  Chips,
  day,
  FakeShot,
  fmt,
  MemberSearch,
  Money,
  MonthPick,
  month,
  monthsWords,
  Num,
  OCR,
  owes,
  payStatus,
  REPORTS,
  ReceiptCard,
  ReportPaper,
  Seg,
  useP,
  useRecord,
  Wallet,
  X,
  type ReportKind,
} from "./kit";
import { ExpenseSheet, NewGiftSheet, ShareSheet } from "./screens";
import type { PLog } from "./types";
import "./dir-b.css";

const LOG_ICON: Record<PLog["kind"], keyof typeof X> = {
  pay: "coins",
  ok: "check",
  no: "ban",
  exp: "bag",
  gift: "heart",
  edit: "edit",
  levy: "list",
};

/* ───────── home ───────── */
export function Home() {
  const { d, href } = useP();
  const [exp, setExp] = useState(false);
  const [share, setShare] = useState(false);
  const active = d.members.filter((m) => m.status === "active");
  const paid = active.filter((m) => m.paid.includes(d.due)).length;
  const left = active.length - paid;
  const openC = d.campaigns.filter((c) => c.status === "open");
  const openL = d.levies.filter((l) => l.status === "open");
  const lateCount = d.members.filter((m) => owes(m, d)).length;
  return (
    <div className="pa-page pb-home">
      <section className="pb-hero" aria-label="الصندوق">
        <div className="pb-hero-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="" width={40} height={40} />
          <span>
            <b>صندوق الرابطة</b>
            <small>
              {d.me.name} · {d.me.role}
            </small>
          </span>
        </div>
        <p className="pb-hero-l">في الصندوق</p>
        <p className="pb-hero-n">
          <Num>{fmt(d.balance)}</Num>
          <span> أوقية</span>
        </p>
        <p className="pb-hero-m">
          هذا الشهر: دخل <Num>{fmt(d.monthIn)}</Num> · صرف <Num>{fmt(d.monthOut)}</Num>
        </p>
      </section>
      <div className="pb-big">
        <Link href={href("record")} className="pa-btn pa-btn-primary pb-big-btn">
          {X.plus(24)} سجّل دفعة
        </Link>
        <button
          type="button"
          className="pa-btn pa-btn-tonal pb-big-btn"
          onClick={() => setExp(true)}
        >
          {X.bag(24)} سجّل مصروفًا
        </button>
      </div>

      <section className="pa-sec">
        <h2>رسوم سبتمبر</h2>
        <Link href={href("late")} className="pb-month">
          <span className="pb-month-t">
            دفع <Num>{paid}</Num> عضوًا، وبقي <Num>{left}</Num>
          </span>
          <Bar value={paid} max={active.length} />
          <span className="pb-month-s">
            عليهم رسوم أو نصيب لوحة: <Num>{lateCount}</Num> عضوًا {X.go(18)}
          </span>
        </Link>
        <button
          type="button"
          className="pa-btn pa-btn-soft pa-btn-block"
          onClick={() => setShare(true)}
        >
          {X.share(20)} شارك المتأخرات في المجموعة
        </button>
      </section>

      <section className="pa-sec">
        <div className="pa-sec-h">
          <h2>آخر العمليات</h2>
          <Link href={href("more", { sub: "log" })} className="pa-link">
            عرض الكل {X.go(18)}
          </Link>
        </div>
        <ul className="pa-rows">
          {d.log.slice(0, 5).map((l, i) => (
            <li key={i}>
              <div className="pa-row pa-row-plain">
                <span
                  className={`pa-ic ${l.kind === "no" ? "pa-ic-rej" : l.kind === "gift" ? "pa-ic-gold" : l.kind === "pay" ? "pa-ic-g" : ""}`}
                >
                  {X[LOG_ICON[l.kind]](22)}
                </span>
                <span className="pa-row-t">
                  <span className="pa-row-body">{l.what}</span>
                  <small>
                    {l.who} · {day(l.at)} · <Num>{l.at.slice(11, 16)}</Num>
                  </small>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="pa-sec">
        <div className="pa-sec-h">
          <h2>التبرعات المفتوحة</h2>
          <Link href={href("campaigns")} className="pa-link">
            الكل {X.go(18)}
          </Link>
        </div>
        <ul className="pa-rows">
          {openC.map((c) => (
            <li key={c.id}>
              <Link href={href(`campaigns/${c.id}`)} className="pa-row">
                <span className="pa-ic pa-ic-gold">{X.heart(22)}</span>
                <span className="pa-row-t">
                  <b>{c.title}</b>
                  <small>
                    جُمع <Money v={c.collected} /> من <Money v={c.target} />
                  </small>
                  <Bar value={c.collected} max={c.target} gold />
                </span>
              </Link>
            </li>
          ))}
          {openL.map((l) => (
            <li key={l.id}>
              <Link href={href(`campaigns/${l.id}`)} className="pa-row">
                <span className="pa-ic pa-ic-g">{X.list(22)}</span>
                <span className="pa-row-t">
                  <b>لوحة {l.title}</b>
                  <small>
                    دفع <Num>{l.paidRefs.length}</Num> عضوًا، وبقي{" "}
                    <Num>{l.refs.length - l.paidRefs.length}</Num>
                  </small>
                </span>
                {X.go(20)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <ExpenseSheet open={exp} onClose={() => setExp(false)} />
      <ShareSheet open={share} onClose={() => setShare(false)} what="المتأخرات" />
    </div>
  );
}

/* ───────── campaigns (التبرعات) ───────── */
export function Campaigns() {
  const { d, href } = useP();
  const [kind, setKind] = useState<"gift" | "levy">("gift");
  const [add, setAdd] = useState(false);
  const open = d.campaigns.filter((c) => c.status === "open");
  const closed = d.campaigns.filter((c) => c.status === "closed");
  return (
    <div className="pa-page">
      <header className="pa-title">
        <h1>التبرعات</h1>
        <button
          type="button"
          className="pa-btn pa-btn-primary pa-btn-sm"
          onClick={() => setAdd(true)}
        >
          {X.plus(20)} جديد
        </button>
      </header>
      <Seg
        label="النوع"
        value={kind}
        onChange={setKind}
        options={[
          { k: "gift", l: `تبرعات (${d.campaigns.length})` },
          { k: "levy", l: `لوحات (${d.levies.length})` },
        ]}
      />
      {kind === "gift" ? (
        <>
          <p className="pa-hint">يساهم من يريد، من الأعضاء أو من خارج الرابطة.</p>
          <ul className="pb-camps">
            {open.map((c) => (
              <li key={c.id}>
                <Link href={href(`campaigns/${c.id}`)} className="pb-camp">
                  <b>{c.title}</b>
                  <span className="pb-camp-n">
                    <Money v={c.collected} />
                    <small>
                      {" "}
                      من <Money v={c.target} />
                    </small>
                  </span>
                  <Bar value={c.collected} max={c.target} gold />
                  <small>
                    المساهمون: <Num>{c.gifts.length}</Num> · آخر يوم{" "}
                    {c.deadline ? day(c.deadline) : "بلا موعد"}
                  </small>
                </Link>
              </li>
            ))}
          </ul>
          {closed.length > 0 && (
            <section className="pa-sec">
              <h2>مغلقة</h2>
              <ul className="pa-rows">
                {closed.map((c) => (
                  <li key={c.id}>
                    <Link href={href(`campaigns/${c.id}`)} className="pa-row">
                      <span className="pa-ic">{X.heart(22)}</span>
                      <span className="pa-row-t">
                        <b>{c.title}</b>
                        <small>
                          جُمع <Money v={c.collected} /> · أُغلقت{" "}
                          {c.closedOn ? day(c.closedOn) : ""}
                        </small>
                      </span>
                      {X.go(20)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          <p className="pa-hint">مبلغ ثابت على كل عضو. من لم يدفع يبقى عليه دينًا.</p>
          <ul className="pa-rows">
            {d.levies.map((l) => (
              <li key={l.id}>
                <Link href={href(`campaigns/${l.id}`)} className="pa-row">
                  <span className="pa-ic pa-ic-g">{X.list(22)}</span>
                  <span className="pa-row-t">
                    <b>{l.title}</b>
                    <small>
                      <Money v={l.perMember} /> على كل عضو · {l.scope}
                      {l.status === "closed" ? " · مغلقة" : ""}
                    </small>
                    <small>
                      دفع <Num>{l.paidRefs.length}</Num> عضوًا، وبقي{" "}
                      <Num>{l.refs.length - l.paidRefs.length}</Num>
                    </small>
                  </span>
                  {X.go(20)}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <NewGiftSheet key={kind} open={add} onClose={() => setAdd(false)} kind={kind} />
    </div>
  );
}

export function Campaign({ id }: { id: string }) {
  const { d, href, snack } = useP();
  const c = d.campaigns.find((x) => x.id === id);
  const [exp, setExp] = useState(false);
  const [share, setShare] = useState(false);
  if (!c) return <p className="pa-empty">لا يوجد تبرع بهذا الرقم.</p>;
  const left = c.collected - c.spent;
  return (
    <div className="pa-page">
      <Back to="campaigns" label="التبرعات" />
      <header className="pa-camp-h">
        <span className="pa-kind">{c.status === "open" ? "تبرع مفتوح" : "تبرع مغلق"}</span>
        <h1>{c.title}</h1>
        <p className="pa-sub">{c.purpose}</p>
      </header>
      <section className="pa-tonal pb-camp-sum">
        <p className="pb-camp-big">
          <Money v={c.collected} />
          <small>
            {" "}
            جُمع من <Money v={c.target} />
          </small>
        </p>
        <Bar value={c.collected} max={c.target} gold />
        <div className="pa-kv3">
          <span>
            <small>صُرف</small>
            <Money v={c.spent} />
          </span>
          <span>
            <small>بقي في التبرع</small>
            <Money v={left} />
          </span>
          <span>
            <small>آخر يوم</small>
            <b>{c.deadline ? day(c.deadline) : "بلا موعد"}</b>
          </span>
        </div>
      </section>
      <div className="pa-actions">
        {c.status === "open" && (
          <Link href={href("record", { c: c.id })} className="pa-btn pa-btn-primary">
            {X.plus(20)} سجّل مساهمة
          </Link>
        )}
        {c.status === "open" && (
          <button type="button" className="pa-btn pa-btn-tonal" onClick={() => setExp(true)}>
            {X.bag(20)} سجّل مصروفًا
          </button>
        )}
        <button type="button" className="pa-btn pa-btn-tonal" onClick={() => setShare(true)}>
          {X.share(20)} شارك التقرير
        </button>
      </div>
      <section className="pa-sec">
        <h2>
          المساهمون (<Num>{c.gifts.length}</Num>)
        </h2>
        <ul className="pa-rows">
          {c.gifts.map((g, i) => (
            <li key={i}>
              <div className="pa-row pa-row-plain">
                {g.ref ? (
                  <Avatar refs={g.ref} />
                ) : (
                  <span className="pa-ic pa-ic-gold">{X.heart(22)}</span>
                )}
                <span className="pa-row-t">
                  <b>{g.name}</b>
                  <small className="pb-inline">
                    {day(g.at)} · <Wallet method={g.method} size={18} />
                  </small>
                </span>
                <Money v={g.amount} unit={false} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="pa-sec">
        <h2>المصاريف</h2>
        {c.spends.length ? (
          <ul className="pa-rows">
            {c.spends.map((s, i) => (
              <li key={i}>
                <div className="pa-row pa-row-plain">
                  <span className="pa-ic">{X.bag(22)}</span>
                  <span className="pa-row-t">
                    <b>{s.note}</b>
                    <small>{day(s.at)} · سجّله سيدي محمد</small>
                  </span>
                  <Money v={s.amount} unit={false} sign="−" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pa-quiet">لم يُصرف منه شيء بعد.</p>
        )}
      </section>
      {c.status === "open" && (
        <button
          type="button"
          className="pa-btn pa-btn-ghost pa-btn-block"
          onClick={() => snack(`أُغلق التبرع. الباقي (${fmt(left)} أوقية) يذهب إلى الصندوق.`)}
        >
          أغلق التبرع
        </button>
      )}
      <ExpenseSheet open={exp} onClose={() => setExp(false)} campaign={c.id} />
      <ShareSheet open={share} onClose={() => setShare(false)} what={`تقرير ${c.title}`} />
    </div>
  );
}
