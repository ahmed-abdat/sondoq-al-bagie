"use client";
// PROTOTYPE: the plainer screens every direction shares (members, statement, late, levy,
// expenses, more). Directions own home, record, campaigns list/page and reports.
import Link from "next/link";
import { useState } from "react";
import {
  Avatar,
  Back,
  Bar,
  CATEGORY,
  Chips,
  day,
  levyOwed,
  memberHistory,
  Money,
  MonthGrid,
  MonthStrip,
  monthsWords,
  Num,
  owedAmount,
  owes,
  payStatus,
  Seg,
  Sheet,
  StripHead,
  findMembers,
  useP,
  Wallet,
  X,
} from "./kit";
import type { PLevy } from "./types";

/* ───────── members ───────── */
type MF = "all" | "owe" | "A" | "B";
export function MembersScreen({ strip = true }: { strip?: boolean }) {
  const { d, href } = useP();
  const [q, setQ] = useState("");
  const [f, setF] = useState<MF>("all");
  const shown = d.members
    .filter((m) => m.status !== "left")
    .filter((m) => (f === "owe" ? owes(m, d) : f === "A" || f === "B" ? m.group === f : true));
  const list = q.trim() ? findMembers(shown, q) : shown;
  const oweCount = d.members.filter((m) => owes(m, d)).length;
  return (
    <div className="pa-page">
      <header className="pa-title">
        <h1>الأعضاء</h1>
        <button type="button" className="pa-btn pa-btn-soft pa-btn-sm">
          {X.plus(20)} عضو جديد
        </button>
      </header>
      <label className="pa-search">
        {X.search(22)}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="اسم العضو أو رقمه"
          aria-label="ابحث عن عضو"
        />
      </label>
      <Chips
        label="تصفية"
        value={f}
        onChange={setF}
        options={[
          { k: "all", l: "الكل" },
          { k: "owe", l: `عليهم رسوم (${oweCount})` },
          { k: "A", l: "المجموعة أ" },
          { k: "B", l: "المجموعة ب" },
        ]}
      />
      {f === "owe" && (
        <Link href={href("late")} className="pa-btn pa-btn-soft pa-btn-block">
          {X.share(20)} شارك المتأخرات في المجموعة
        </Link>
      )}
      {strip && (
        <div className="pa-strip-row">
          <span />
          <StripHead />
        </div>
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
              {strip && m.status === "active" && <MonthStrip m={m} />}
            </Link>
          </li>
        ))}
        {!list.length && <li className="pa-empty">لا أحد بهذا الاسم. جرّب رقمه في الورقة.</li>}
      </ul>
    </div>
  );
}

/* ───────── one member = «كشف حساب» ───────── */
export function MemberScreen({ refs, actionsTop }: { refs: string; actionsTop?: boolean }) {
  const { d, href, snack } = useP();
  const m = d.members.find((x) => x.ref === refs);
  const [share, setShare] = useState(false);
  if (!m) return <p className="pa-empty">لا يوجد عضو بهذا الرقم.</p>;
  const hist = memberHistory(m, d);
  const lv = levyOwed(m, d);
  const late = owes(m, d);
  const actions = (
    <div className="pa-actions">
      <Link href={href("record", { m: m.ref })} className="pa-btn pa-btn-primary">
        {X.plus(20)} سجّل دفعة له
      </Link>
      <button type="button" className="pa-btn pa-btn-tonal" onClick={() => setShare(true)}>
        {X.share(20)} شارك الكشف
      </button>
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
            المجموعة {m.group === "A" ? "أ" : "ب"} · الرسوم الشهرية <Money v={m.fee} />
          </p>
          <p className="pa-sub">
            {m.phone ? (
              <Num>{`+${m.phone.slice(0, 3)} ${m.phone.slice(3)}`}</Num>
            ) : (
              "لا يوجد رقم هاتف"
            )}
          </p>
        </div>
      </header>
      {actionsTop && actions}
      <section className="pa-sec">
        <h2>
          سنة <Num>{d.year}</Num>
        </h2>
        <p className="pa-status">{payStatus(m)}</p>
        <MonthGrid m={m} />
      </section>
      <section className="pa-sec">
        <h2>ما عليه الآن</h2>
        {!late ? (
          <p className="pa-quiet">لا شيء عليه. {X.check(18)}</p>
        ) : (
          <dl className="pa-dl pa-dl-owe">
            {m.owed.length > 0 && (
              <>
                <dt>رسوم {monthsWords(m.owed)}</dt>
                <dd>
                  <Money v={m.owed.length * m.fee} />
                </dd>
              </>
            )}
            {lv.map((l) => (
              <FragmentLevy key={l.id} l={l} />
            ))}
            <dt className="pa-sum-total">المجموع</dt>
            <dd className="pa-sum-total">
              <Money v={owedAmount(m, d)} />
            </dd>
          </dl>
        )}
      </section>
      {!actionsTop && actions}
      <section className="pa-sec">
        <h2>الدفعات</h2>
        <ul className="pa-hist">
          {hist.map((h, i) => (
            <li key={i} className={`pa-hist-${h.state}`}>
              <div className="pa-hist-top">
                <b>{h.levy ? `لوحة ${h.levy}` : `رسوم ${monthsWords(h.months)}`}</b>
                <Money v={h.amount} />
              </div>
              <p className="pa-hist-meta">
                {day(h.at)} · <Wallet method={h.method} size={18} />
                {h.receiptNo && (
                  <>
                    {" "}
                    · وصل <Num>{h.receiptNo}</Num>
                  </>
                )}
              </p>
              <p className="pa-hist-who">سجّلها {h.by}</p>
              {h.state === "cancelled" && (
                <p className="pa-hist-rej">
                  <span className="pa-tag-rej">أُلغيت</span> ألغاها سيدي محمد. السبب: {h.reason}
                </p>
              )}
            </li>
          ))}
          {!hist.length && <li className="pa-empty">لا دفعات هذا العام.</li>}
        </ul>
      </section>
      <section className="pa-sec">
        <h2>إدارة</h2>
        <ul className="pa-rows">
          <li>
            <button type="button" className="pa-row pa-row-plain">
              <span className="pa-ic">{X.edit(22)}</span>
              <span className="pa-row-t">
                <b>تعديل البيانات</b>
                <small>الاسم، الهاتف، المجموعة، شهر الانضمام</small>
              </span>
            </button>
          </li>
          <li>
            <button type="button" className="pa-row pa-row-plain">
              <span className="pa-ic">{X.user(22)}</span>
              <span className="pa-row-t">
                <b>الحالة</b>
                <small>نشط، معفى، مسافر، غادر</small>
              </span>
            </button>
          </li>
        </ul>
      </section>
      <Sheet open={share} onClose={() => setShare(false)} title="شارك كشف الحساب">
        <p className="pa-quiet">يصل في واتساب صورة واحدة فيها الأشهر والدفعات وما عليه.</p>
        <div className="pa-actions pa-actions-col">
          <button
            type="button"
            className="pa-btn pa-btn-primary pa-btn-block"
            onClick={() => {
              setShare(false);
              snack("فُتحت مشاركة الصورة. اختر واتساب.");
            }}
          >
            {X.image(20)} صورة لواتساب
          </button>
          <button
            type="button"
            className="pa-btn pa-btn-tonal pa-btn-block"
            onClick={() => {
              setShare(false);
              snack("حُفظ الملف في التنزيلات.");
            }}
          >
            {X.pdf(20)} ملف PDF
          </button>
        </div>
      </Sheet>
    </div>
  );
}
function FragmentLevy({ l }: { l: PLevy }) {
  return (
    <>
      <dt>لوحة {l.title}</dt>
      <dd>
        <Money v={l.perMember} />
      </dd>
    </>
  );
}

/* ───────── late members ───────── */
export function LateScreen() {
  const { d, href } = useP();
  const late = d.members.filter((m) => owes(m, d));
  const [share, setShare] = useState(false);
  return (
    <div className="pa-page">
      <Back to="members" label="الأعضاء" />
      <header className="pa-title">
        <h1>المتأخرات</h1>
      </header>
      <p className="pa-lead">
        عليهم رسوم أو نصيب لوحة: <Num>{late.length}</Num> عضوًا.
      </p>
      <button
        type="button"
        className="pa-btn pa-btn-primary pa-btn-block"
        onClick={() => setShare(true)}
      >
        {X.share(20)} شارك المتأخرات في المجموعة
      </button>
      <p className="pa-hint">تُرسل الأسماء والأشهر فقط، بلا مبالغ.</p>
      <ul className="pa-rows">
        {late.map((m) => {
          const lv = levyOwed(m, d);
          return (
            <li key={m.ref}>
              <Link href={href(`members/${m.ref}`)} className="pa-row">
                <Avatar refs={m.ref} />
                <span className="pa-row-t">
                  <b>{m.name}</b>
                  <small>
                    {m.owed.length ? `رسوم ${monthsWords(m.owed)}` : ""}
                    {m.owed.length && lv.length ? " · " : ""}
                    {lv.length ? `لوحة ${lv[0].title}` : ""}
                  </small>
                </span>
                {X.go(20)}
              </Link>
            </li>
          );
        })}
      </ul>
      <ShareSheet open={share} onClose={() => setShare(false)} what="المتأخرات" />
    </div>
  );
}

/* ───────── levy («لوحة») ───────── */
export function LevyScreen({ id }: { id: string }) {
  const { d, href, snack } = useP();
  const l = d.levies.find((x) => x.id === id);
  const [f, setF] = useState<"no" | "yes">("no");
  const [share, setShare] = useState(false);
  if (!l) return <p className="pa-empty">لا توجد لوحة بهذا الرقم.</p>;
  const people = l.refs.map((r) => d.members.find((m) => m.ref === r)!).filter(Boolean);
  const paid = people.filter((m) => l.paidRefs.includes(m.ref));
  const unpaid = people.filter((m) => !l.paidRefs.includes(m.ref));
  const list = f === "no" ? unpaid : paid;
  return (
    <div className="pa-page">
      <Back to="campaigns" label="التبرعات" />
      <header className="pa-camp-h">
        <span className="pa-kind pa-kind-levy">لوحة</span>
        <h1>{l.title}</h1>
        <p className="pa-sub">{l.purpose}</p>
        <p className="pa-sub">
          على كل عضو <Money v={l.perMember} /> · {l.scope} · أنشأها {l.createdBy} في{" "}
          {day(l.createdOn)}
        </p>
      </header>
      <section className="pa-tonal">
        <div className="pa-kv3">
          <span>
            <small>جُمع</small>
            <Money v={paid.length * l.perMember} />
          </span>
          <span>
            <small>بقي على الأعضاء</small>
            <Money v={unpaid.length * l.perMember} />
          </span>
        </div>
        <Bar value={paid.length} max={people.length} />
        <p className="pa-sub">
          دفع <Num>{paid.length}</Num> عضوًا، وبقي <Num>{unpaid.length}</Num>.
        </p>
      </section>
      <div className="pa-actions">
        <Link href={href("record", { levy: l.id })} className="pa-btn pa-btn-primary">
          {X.plus(20)} سجّل دفعة
        </Link>
        <button type="button" className="pa-btn pa-btn-tonal" onClick={() => setShare(true)}>
          {X.share(20)} شارك من لم يدفع
        </button>
      </div>
      <Seg
        label="من دفع"
        value={f}
        onChange={setF}
        options={[
          { k: "no", l: `لم يدفعوا (${unpaid.length})` },
          { k: "yes", l: `دفعوا (${paid.length})` },
        ]}
      />
      <ul className="pa-rows">
        {list.map((m) => (
          <li key={m.ref}>
            <Link href={href(`members/${m.ref}`)} className="pa-row">
              <Avatar refs={m.ref} />
              <span className="pa-row-t">
                <b>{m.name}</b>
                <small>{l.paidRefs.includes(m.ref) ? "دفع نصيبه" : "لم يدفع بعد"}</small>
              </span>
              <span className="pa-tick-big">{l.paidRefs.includes(m.ref) ? "✓" : ""}</span>
            </Link>
          </li>
        ))}
      </ul>
      {l.status === "open" && (
        <button
          type="button"
          className="pa-btn pa-btn-ghost pa-btn-block"
          onClick={() => snack("اللوحة مغلقة. ما بقي على الأعضاء يبقى دينًا عليهم.")}
        >
          أغلق اللوحة
        </button>
      )}
      <ShareSheet open={share} onClose={() => setShare(false)} what={`لوحة ${l.title}`} />
    </div>
  );
}

export function ShareSheet({
  open,
  onClose,
  what,
}: {
  open: boolean;
  onClose: () => void;
  what: string;
}) {
  const { snack } = useP();
  const go = (m: string) => {
    onClose();
    snack(m);
  };
  return (
    <Sheet open={open} onClose={onClose} title={`شارك ${what}`}>
      <div className="pa-actions pa-actions-col">
        <button
          type="button"
          className="pa-btn pa-btn-primary pa-btn-block"
          onClick={() => go("فُتحت مشاركة الصور. اختر مجموعة الواتساب.")}
        >
          {X.image(20)} صور لواتساب
        </button>
        <button
          type="button"
          className="pa-btn pa-btn-tonal pa-btn-block"
          onClick={() => go("حُفظ الملف في التنزيلات.")}
        >
          {X.pdf(20)} ملف PDF
        </button>
        <button
          type="button"
          className="pa-btn pa-btn-tonal pa-btn-block"
          onClick={() => go("نُسخ النص. الصقه في واتساب.")}
        >
          {X.copy(20)} نص فقط
        </button>
      </div>
    </Sheet>
  );
}

/** New donation or levy (one sheet; the kind decides the fields). */
export function NewGiftSheet({
  open,
  onClose,
  kind: k0 = "gift",
}: {
  open: boolean;
  onClose: () => void;
  kind?: "gift" | "levy";
}) {
  const { snack } = useP();
  const [kind, setKind] = useState<"gift" | "levy">(k0);
  const [who, setWho] = useState<"all" | "A" | "B" | "pick">("all");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={kind === "gift" ? "تبرع جديد" : "لوحة جديدة"}
      foot={
        <button
          type="button"
          className="pa-btn pa-btn-primary pa-btn-block"
          onClick={() => {
            onClose();
            snack(kind === "gift" ? "فُتح التبرع." : "أُنشئت اللوحة وأُضيف نصيبها على الأعضاء.");
          }}
        >
          {kind === "gift" ? "افتح التبرع" : "أنشئ اللوحة"}
        </button>
      }
    >
      <Seg
        label="النوع"
        value={kind}
        onChange={setKind}
        options={[
          { k: "gift", l: "تبرع (اختياري)" },
          { k: "levy", l: "لوحة (على كل عضو)" },
        ]}
      />
      <p className="pa-hint">
        {kind === "gift"
          ? "يساهم من يريد بما يريد، من الأعضاء أو من خارج الرابطة."
          : "مبلغ ثابت على كل عضو لحاجة معيّنة. من لم يدفع يبقى عليه دينًا."}
      </p>
      <label className="pa-field">
        <span>العنوان</span>
        <input placeholder={kind === "gift" ? "مثل: ترميم المصلى" : "مثل: علاج أحد الإخوة"} />
      </label>
      <label className="pa-field">
        <span>{kind === "gift" ? "الهدف (اختياري)" : "المبلغ على كل عضو"}</span>
        <input inputMode="numeric" placeholder="بالأوقية" />
      </label>
      {kind === "levy" ? (
        <>
          <p className="pa-label">على من؟</p>
          <Chips
            label="على من"
            value={who}
            onChange={setWho}
            options={[
              { k: "all", l: "كل الأعضاء" },
              { k: "A", l: "المجموعة أ" },
              { k: "B", l: "المجموعة ب" },
              { k: "pick", l: "أختارهم" },
            ]}
          />
        </>
      ) : (
        <label className="pa-field">
          <span>آخر يوم (اختياري)</span>
          <input type="date" defaultValue="2026-10-31" />
        </label>
      )}
    </Sheet>
  );
}

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
