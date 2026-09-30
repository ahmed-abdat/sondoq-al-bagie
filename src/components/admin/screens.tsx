"use client";
// PROTOTYPE: the plainer screens every direction shares (members, statement, late, levy,
// expenses, more). Directions own home, record, campaigns list/page and reports.
import Link from "next/link";
import { useState } from "react";
import { Back, CATEGORY, Chips, day, Money, Num, Sheet, useP, X } from "./kit";

/* ───────── expenses ───────── */
export function ExpensesScreen() {
  const { d } = useP();
  const [f, setF] = useState<"all" | "fund" | "camp">("all");
  const [add, setAdd] = useState(false);
  const list = d.expenses.filter((e) =>
    f === "fund" ? !e.campaign : f === "camp" ? !!e.campaign : true,
  );
  return (
    <div className="pa-page">
      <Back to="more" label="المزيد" />
      <header className="pa-title">
        <h1>المصاريف</h1>
        <button
          type="button"
          className="pa-btn pa-btn-primary pa-btn-sm"
          onClick={() => setAdd(true)}
        >
          {X.plus(20)} سجّل مصروفًا
        </button>
      </header>
      <p className="pa-lead">
        صُرف هذا العام <Money v={d.expenses.reduce((s, e) => s + e.amount, 0)} />
      </p>
      <Chips
        label="تصفية"
        value={f}
        onChange={setF}
        options={[
          { k: "all", l: "الكل" },
          { k: "fund", l: "الصندوق" },
          { k: "camp", l: "التبرعات" },
        ]}
      />
      <ul className="pa-rows">
        {list.map((e) => (
          <li key={e.id}>
            <div className="pa-row pa-row-plain">
              <span className="pa-ic">{X.bag(22)}</span>
              <span className="pa-row-t">
                <b>{e.note}</b>
                <small>
                  {day(e.at)} ·{" "}
                  {e.campaign
                    ? d.campaigns.find((c) => c.id === e.campaign)?.title
                    : CATEGORY[e.category]}{" "}
                  · سجّله سيدي محمد
                </small>
              </span>
              <Money v={e.amount} unit={false} sign="−" />
            </div>
          </li>
        ))}
      </ul>
      <ExpenseSheet open={add} onClose={() => setAdd(false)} />
    </div>
  );
}
export function ExpenseSheet({
  open,
  onClose,
  campaign,
}: {
  open: boolean;
  onClose: () => void;
  campaign?: string;
}) {
  const { d, snack } = useP();
  const [cat, setCat] = useState<string>(campaign ? "camp" : "other");
  const [amt, setAmt] = useState("");
  const [what, setWhat] = useState("");
  const label = !amt ? "اكتب المبلغ" : !what ? "اكتب ماذا اشتُري" : "سجّل المصروف";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="سجّل مصروفًا"
      foot={
        <button
          type="button"
          className="pa-btn pa-btn-primary pa-btn-block"
          disabled={!amt || !what}
          onClick={() => {
            onClose();
            snack("سُجّل المصروف.");
          }}
        >
          {label}
        </button>
      }
    >
      <label className="pa-field pa-field-big">
        <span>المبلغ بالأوقية</span>
        <input
          inputMode="numeric"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          placeholder="0"
        />
      </label>
      <label className="pa-field">
        <span>ماذا اشتُري؟</span>
        <input
          value={what}
          onChange={(e) => setWhat(e.target.value)}
          placeholder="مثل: كرات وأقمصة للفريق"
        />
      </label>
      <p className="pa-label">من أين؟</p>
      <Chips
        label="النوع"
        value={cat}
        onChange={setCat}
        options={[
          { k: "teaching", l: "التدريس" },
          { k: "honoring", l: "التكريم" },
          { k: "sports", l: "الرياضة" },
          { k: "other", l: "أخرى" },
          ...d.campaigns.filter((c) => c.status === "open").map((c) => ({ k: c.id, l: c.title })),
        ]}
      />
      <button type="button" className="pa-btn pa-btn-tonal pa-btn-block">
        {X.image(20)} صورة الفاتورة (اختياري)
      </button>
    </Sheet>
  );
}

/* ───────── more ───────── */
export function MoreScreen({ sub }: { sub?: string }) {
  const { d, href } = useP();
  if (sub === "log") return <LogScreen />;
  if (sub === "account") return <AccountScreen />;
  if (sub === "users") return <UsersScreen />;
  const rows: { t: string; s: string; icon: keyof typeof X; to: string }[] = [
    { t: "المصاريف", s: "سجّل مصروفًا، وكل ما صُرف", icon: "bag", to: href("expenses") },
    { t: "سجل العمليات", s: "من سجّل ماذا، ومتى", icon: "list", to: href("more", { sub: "log" }) },
    { t: "المتأخرات", s: "من عليه رسوم أو نصيب لوحة", icon: "clock", to: href("late") },
    {
      t: "تسليم الصندوق",
      s: "عند تغيير أمين الصندوق",
      icon: "hand",
      to: href("more", { sub: "handover" }),
    },
    {
      t: "أرقام الصندوق",
      s: "بنكيلي، مصرفي، السداد",
      icon: "wallet",
      to: href("more", { sub: "wallets" }),
    },
    {
      t: "أعضاء اللجنة",
      s: "الحسابات والأدوار",
      icon: "people",
      to: href("more", { sub: "users" }),
    },
    {
      t: "الإعدادات",
      s: "الرسوم الشهرية، النسخ الاحتياطي",
      icon: "gear",
      to: href("more", { sub: "settings" }),
    },
    {
      t: "حسابي",
      s: `${d.me.name} · ${d.me.role} · الإشعارات`,
      icon: "user",
      to: href("more", { sub: "account" }),
    },
  ];
  return (
    <div className="pa-page">
      <header className="pa-title">
        <h1>المزيد</h1>
      </header>
      <ul className="pa-rows">
        {rows.map((r) => (
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
      <button type="button" className="pa-btn pa-btn-ghost pa-btn-block">
        خروج
      </button>
    </div>
  );
}
const LOG_ICON = {
  pay: "coins",
  ok: "check",
  no: "ban",
  exp: "bag",
  gift: "heart",
  edit: "edit",
  levy: "list",
} as const;
function LogScreen() {
  const { d } = useP();
  const [f, setF] = useState<string>("all");
  const people = ["all", ...new Set(d.log.map((l) => l.who))];
  return (
    <div className="pa-page">
      <Back to="more" label="المزيد" />
      <header className="pa-title">
        <h1>سجل العمليات</h1>
      </header>
      <Chips
        label="من"
        value={f}
        onChange={setF}
        options={people.map((p) => ({ k: p, l: p === "all" ? "الكل" : p }))}
      />
      <ul className="pa-rows">
        {d.log
          .filter((l) => f === "all" || l.who === f)
          .map((l, i) => (
            <li key={i}>
              <div className="pa-row pa-row-plain">
                <span
                  className={`pa-ic ${l.kind === "no" ? "pa-ic-rej" : l.kind === "ok" ? "pa-ic-g" : ""}`}
                >
                  {X[LOG_ICON[l.kind]](22)}
                </span>
                <span className="pa-row-t">
                  <b>{l.who}</b>
                  <span className="pa-row-body">{l.what}</span>
                  <small>
                    {day(l.at)} · <Num>{l.at.slice(11, 16)}</Num>
                  </small>
                </span>
              </div>
            </li>
          ))}
      </ul>
    </div>
  );
}
function AccountScreen() {
  const { d } = useP();
  const kinds = [
    { k: "rec", t: "دفعة سُجّلت", s: "مثل: سجّل يحيى دفعة محمد ولد أحمد" },
    { k: "cancel", t: "دفعة أُلغيت", s: "مع سبب الإلغاء" },
    { k: "exp", t: "مصروف جديد", s: "" },
    { k: "gift", t: "مساهمة في تبرع", s: "" },
    { k: "levy", t: "لوحة جديدة", s: "" },
  ];
  const [on, setOn] = useState<string[]>(["rec", "cancel", "levy"]);
  return (
    <div className="pa-page">
      <Back to="more" label="المزيد" />
      <header className="pa-title">
        <h1>حسابي</h1>
      </header>
      <p className="pa-lead">
        {d.me.name} · {d.me.role}
      </p>
      <section className="pa-sec">
        <h2>الإشعارات</h2>
        <p className="pa-hint">تصلك عندما يفعل غيرك في اللجنة شيئًا. لا تصلك عن عملك أنت.</p>
        <ul className="pa-switches">
          {kinds.map((k) => {
            const v = on.includes(k.k);
            return (
              <li key={k.k}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={v}
                  className="pa-switch-row"
                  onClick={() => setOn((s) => (v ? s.filter((x) => x !== k.k) : [...s, k.k]))}
                >
                  <span className="pa-row-t">
                    <b>{k.t}</b>
                    {k.s && <small>{k.s}</small>}
                  </span>
                  <span className={`pa-switch ${v ? "on" : ""}`} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="pa-sec">
        <h2>الحساب</h2>
        <ul className="pa-rows">
          <li>
            <button type="button" className="pa-row pa-row-plain">
              <span className="pa-ic">{X.lock(22)}</span>
              <span className="pa-row-t">
                <b>كلمة السر</b>
              </span>
            </button>
          </li>
          <li>
            <button type="button" className="pa-row pa-row-plain">
              <span className="pa-ic">{X.phone(22)}</span>
              <span className="pa-row-t">
                <b>ثبّت التطبيق على الهاتف</b>
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}
function UsersScreen() {
  const { d } = useP();
  return (
    <div className="pa-page">
      <Back to="more" label="المزيد" />
      <header className="pa-title">
        <h1>أعضاء اللجنة</h1>
        <button type="button" className="pa-btn pa-btn-soft pa-btn-sm">
          {X.plus(20)} أضف
        </button>
      </header>
      <p className="pa-hint">
        كل أعضاء اللجنة يسجّلون ويلغون. «المسؤول» وحده يضيف الحسابات ويغيّر كلمات السر.
      </p>
      <ul className="pa-rows">
        {d.users.map((u) => (
          <li key={u.login}>
            <div className="pa-row pa-row-plain">
              <span className="pa-ic">{X.user(22)}</span>
              <span className="pa-row-t">
                <b>{u.name}</b>
                <small>
                  {u.role} · {u.last ? `آخر دخول ${day(u.last)}` : "لم يدخل بعد"}
                </small>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
