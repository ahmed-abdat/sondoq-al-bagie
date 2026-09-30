"use client";
// PROTOTYPE round 2: record one transfer that can cover several people, months by quick
// choices, plus a لوحة share or a donation in the same transfer. Two orders of the same parts:
// C2 starts from the member (?v=c2, and the chosen set), B2 starts from the picture (?v=b2).
import Link from "next/link";
import { useMemo, useState } from "react";
import { MONTHS_AR } from "@/lib/dates";
import {
  Avatar,
  Back,
  FakeShot,
  fmt,
  levyOwed,
  Money,
  monthsWords,
  Num,
  payStatus,
  upcoming,
  useP,
  Wallet,
  X,
} from "./kit";
import type { PData, PMember } from "./types";
import "./record2.css";

type Mode = "late" | "rest" | "pick";
type Line =
  | { id: number; t: "fees"; ref: string; mode: Mode; months: number[] }
  | { id: number; t: "levy"; ref: string; levyId: string }
  | { id: number; t: "gift"; campaignId: string; name: string; amount: number };
type How = "none" | "reading" | "read" | "cash";
/** The fictional screenshot's sender (B-18 «سيدي ولد محمد», late June to September). */
const SENDER = "B-18";

const monthsFor = (m: PMember, mode: Mode, current: number[] = []): number[] =>
  mode === "late"
    ? m.owed
    : mode === "rest"
      ? [...m.owed, ...upcoming(m)].sort((a, b) => a - b)
      : current;
const firstMode = (m: PMember): { mode: Mode; months: number[] } =>
  m.owed.length
    ? { mode: "late", months: m.owed }
    : { mode: "pick", months: upcoming(m).slice(0, 1) };
const lastName = (name: string) => {
  const i = name.indexOf("ولد ");
  return i >= 0 ? name.slice(i) : "";
};

function lineAmount(l: Line, d: PData): number {
  if (l.t === "fees") return l.months.length * (d.members.find((m) => m.ref === l.ref)?.fee ?? 0);
  if (l.t === "levy") return d.levies.find((x) => x.id === l.levyId)?.perMember ?? 0;
  return l.amount;
}

let seq = 1;
function useTransfer(start: { ref?: string; levy?: string; c?: string; cash?: boolean }) {
  const { d } = useP();
  const [lines, setLines] = useState<Line[]>(() => {
    const m = d.members.find((x) => x.ref === start.ref);
    const out: Line[] = [];
    if (m && !start.levy) out.push({ id: seq++, t: "fees", ref: m.ref, ...firstMode(m) });
    if (m && start.levy) out.push({ id: seq++, t: "levy", ref: m.ref, levyId: start.levy });
    if (start.c)
      out.push({ id: seq++, t: "gift", campaignId: start.c, name: m?.name ?? "", amount: 0 });
    return out;
  });
  const [how, setHow] = useState<How>(start.cash ? "cash" : "none");
  const addPerson = (ref: string) => {
    const m = d.members.find((x) => x.ref === ref);
    if (!m || lines.some((l) => l.t === "fees" && l.ref === ref)) return;
    setLines((s) => [...s, { id: seq++, t: "fees", ref, ...firstMode(m) }]);
  };
  const setMode = (id: number, mode: Mode) =>
    setLines((s) =>
      s.map((l) => {
        if (l.id !== id || l.t !== "fees") return l;
        const m = d.members.find((x) => x.ref === l.ref)!;
        return { ...l, mode, months: mode === "pick" ? l.months : monthsFor(m, mode) };
      }),
    );
  const toggle = (id: number, k: number) =>
    setLines((s) =>
      s.map((l) =>
        l.id === id && l.t === "fees"
          ? {
              ...l,
              mode: "pick",
              months: l.months.includes(k)
                ? l.months.filter((x) => x !== k)
                : [...l.months, k].sort((a, b) => a - b),
            }
          : l,
      ),
    );
  const remove = (id: number) => setLines((s) => s.filter((l) => l.id !== id));
  const addLevy = (ref: string, levyId: string) =>
    setLines((s) => [...s, { id: seq++, t: "levy", ref, levyId }]);
  const addGift = (campaignId: string, name: string) =>
    setLines((s) => [...s, { id: seq++, t: "gift", campaignId, name, amount: 0 }]);
  const setGift = (
    id: number,
    patch: Partial<{ amount: number; name: string; campaignId: string }>,
  ) => setLines((s) => s.map((l) => (l.id === id && l.t === "gift" ? { ...l, ...patch } : l)));
  const readShot = () => {
    setHow("reading");
    setTimeout(() => setHow("read"), 650);
  };
  const total = lines.reduce((s, l) => s + lineAmount(l, d), 0);
  return {
    lines,
    how,
    setHow,
    readShot,
    addPerson,
    setMode,
    toggle,
    remove,
    addLevy,
    addGift,
    setGift,
    total,
  };
}
type T = ReturnType<typeof useTransfer>;

/** The fictional screenshot of round 2 says 450 MRU = 4 500 أوقية (?amt= changes it). */
function useShotAmount() {
  const { q } = useP();
  const n = Number(q.amt);
  return Number.isFinite(n) && n > 0 ? n : 4500;
}

/* ───────── the flow ───────── */
export function Record2C() {
  return <Record2 order="member" />;
}

function Record2({ order }: { order: "member" | "picture" }) {
  const { d, q, href } = useP();
  const t = useTransfer({ ref: q.m, levy: q.levy, c: q.c, cash: q.cash === "1" });
  const shotAmt = useShotAmount();
  const [adding, setAdding] = useState<null | "person" | "levy" | "gift">(null);
  const [saved, setSaved] = useState(false);
  const first = t.lines.find((l) => l.t !== "gift") as Extract<Line, { ref: string }> | undefined;
  const firstMember = first ? d.members.find((m) => m.ref === first.ref) : undefined;
  const sender =
    order === "picture" && t.how === "read" ? d.members.find((m) => m.ref === SENDER) : undefined;

  if (saved) return <Done t={t} />;

  const people = (
    <section className="pa-sec">
      <div className="pa-sec-h">
        <h2>{t.lines.length ? "هذه الدفعة عن" : "لمن هذه الدفعة؟"}</h2>
        {t.lines.length > 1 && (
          <span className="pa-hint">
            <Num>{t.lines.length}</Num> في تحويل واحد
          </span>
        )}
      </div>
      {sender && !t.lines.length && (
        <button type="button" className="r2-suggest" onClick={() => t.addPerson(sender.ref)}>
          <Avatar refs={sender.ref} tone="g" />
          <span className="pa-row-t">
            <small>الاسم في الصورة</small>
            <b>{sender.name}</b>
          </span>
          {X.plus(22)}
        </button>
      )}
      {!!t.lines.length && (
        <ul className="r2-lines">
          {t.lines.map((l) => (
            <LineRow key={l.id} l={l} t={t} />
          ))}
        </ul>
      )}
      {!t.lines.length ? (
        <PersonPicker t={t} onDone={() => undefined} autoFocus={order === "member"} />
      ) : (
        <>
          {firstMember && <Relatives m={firstMember} t={t} />}
          {adding === "person" && <PersonPicker t={t} onDone={() => setAdding(null)} autoFocus />}
          {adding === "levy" && <LevyPicker t={t} onDone={() => setAdding(null)} />}
          {adding === "gift" && <GiftPicker t={t} onDone={() => setAdding(null)} />}
          {adding === null && (
            <div className="r2-add">
              <button
                type="button"
                className="pa-btn pa-btn-soft pa-btn-sm"
                onClick={() => setAdding("person")}
              >
                {X.plus(18)} شخص آخر
              </button>
              <button
                type="button"
                className="pa-btn pa-btn-tonal pa-btn-sm"
                onClick={() => setAdding("levy")}
              >
                {X.plus(18)} نصيب لوحة
              </button>
              <button
                type="button"
                className="pa-btn pa-btn-tonal pa-btn-sm"
                onClick={() => setAdding("gift")}
              >
                {X.plus(18)} تبرع
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
  const howSec = <HowSec t={t} big={order === "picture"} shotAmt={shotAmt} />;

  return (
    <div className="pa-page r2">
      {order === "member" && firstMember ? (
        <Back to={`members/${firstMember.ref}`} label={firstMember.name} />
      ) : (
        <Back to="" label="الرئيسية" />
      )}
      <h1>سجّل دفعة</h1>
      {order === "picture" ? (
        <>
          {howSec}
          {people}
        </>
      ) : (
        <>
          {people}
          {!!t.lines.length && howSec}
        </>
      )}
      <Foot t={t} shotAmt={shotAmt} onSave={() => setSaved(true)} />
      <p className="pa-hint r2-note">
        نموذج تجريبي. الصورة تقول <Num>{fmt(shotAmt / 10)}</Num> MRU. غيّرها بـ{" "}
        <Link href={href("record", { ...(q.m ? { m: q.m } : {}), amt: "3500" })}>amt=3500</Link>.
      </p>
    </div>
  );
}

/* one row per person (or share, or donation) */
function LineRow({ l, t }: { l: Line; t: T }) {
  const { d } = useP();
  const amount = lineAmount(l, d);
  if (l.t === "gift") {
    const c = d.campaigns.find((x) => x.id === l.campaignId)!;
    return (
      <li className="r2-line">
        <div className="r2-line-h">
          <span className="pa-ic pa-ic-gold">{X.heart(20)}</span>
          <span className="pa-row-t">
            <b>تبرع: {c.title}</b>
            <small>باسم {l.name || "فاعل خير"}</small>
          </span>
          <Remove onClick={() => t.remove(l.id)} />
        </div>
        <label className="r2-amt">
          <span>المبلغ</span>
          <input
            inputMode="numeric"
            value={l.amount ? String(l.amount) : ""}
            onChange={(e) =>
              t.setGift(l.id, { amount: Number(e.target.value.replace(/\D/g, "")) || 0 })
            }
            placeholder="0"
            aria-label="مبلغ التبرع بالأوقية"
          />
          <span className="pa-unit">أوقية</span>
        </label>
      </li>
    );
  }
  const m = d.members.find((x) => x.ref === l.ref)!;
  if (l.t === "levy") {
    const lv = d.levies.find((x) => x.id === l.levyId)!;
    return (
      <li className="r2-line">
        <div className="r2-line-h">
          <Avatar refs={m.ref} />
          <span className="pa-row-t">
            <b>{m.name}</b>
            <small>نصيبه من لوحة {lv.title}</small>
          </span>
          <span className="r2-line-amt">
            <Money v={amount} unit={false} />
          </span>
          <Remove onClick={() => t.remove(l.id)} />
        </div>
      </li>
    );
  }
  const nothingPaid = m.paid.length === 0;
  const modes: { k: Mode; l: string }[] = [
    ...(m.owed.length ? [{ k: "late" as Mode, l: "الأشهر المتأخرة" }] : []),
    { k: "rest", l: nothingPaid ? "السنة كاملة" : "باقي السنة" },
    { k: "pick", l: "اختر" },
  ];
  return (
    <li className="r2-line">
      <div className="r2-line-h">
        <Avatar refs={m.ref} />
        <span className="pa-row-t">
          <b>{m.name}</b>
          <small>{l.months.length ? `رسوم ${monthsWords(l.months)}` : "لم تُختر أشهر"}</small>
        </span>
        <span className="r2-line-amt">
          <Money v={amount} unit={false} />
        </span>
        <Remove onClick={() => t.remove(l.id)} />
      </div>
      <div className="r2-modes" role="radiogroup" aria-label={`أشهر ${m.name}`}>
        {modes.map((o) => (
          <button
            key={o.k}
            type="button"
            role="radio"
            aria-checked={l.mode === o.k}
            className={`pa-chip ${l.mode === o.k ? "on" : ""}`}
            onClick={() => t.setMode(l.id, o.k)}
          >
            {o.l}
          </button>
        ))}
      </div>
      {l.mode === "pick" && (
        <div className="r2-months" role="group" aria-label="الأشهر">
          {MONTHS_AR.map((name, i) => {
            const k = i + 1;
            const paid = m.paid.includes(k);
            const na = m.notOwed.includes(k);
            const on = l.months.includes(k);
            return (
              <button
                key={name}
                type="button"
                disabled={paid || na}
                aria-pressed={on}
                className={on ? "on" : ""}
                onClick={() => t.toggle(l.id, k)}
              >
                <span>{name}</span>
                <b>{paid ? "دُفع" : on ? "✓" : ""}</b>
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}
function Remove({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="r2-x" onClick={onClick} aria-label="احذف من الدفعة">
      {X.x(20)}
    </button>
  );
}

/** Same family name first: one tap adds each relative with his late months. */
function Relatives({ m, t }: { m: PMember; t: T }) {
  const { d } = useP();
  const fam = lastName(m.name);
  const inList = new Set(t.lines.flatMap((l) => (l.t === "gift" ? [] : [l.ref])));
  const rel = d.members
    .filter(
      (x) =>
        x.status === "active" && x.ref !== m.ref && fam && x.name.endsWith(fam) && x.owed.length,
    )
    .filter((x) => !inList.has(x.ref))
    .sort((a, b) => a.owed.length - b.owed.length)
    .slice(0, 3);
  if (!rel.length) return null;
  return (
    <div className="r2-rel">
      <p className="pa-hint">من عائلته، عليهم رسوم:</p>
      <div className="r2-rel-chips">
        {rel.map((x) => (
          <button
            key={x.ref}
            type="button"
            className="r2-rel-chip"
            onClick={() => t.addPerson(x.ref)}
          >
            {X.plus(18)}
            <span>
              {x.name}
              <small>
                <Num>{`${refLabel(x.ref)} · ${fmt(x.owed.length * x.fee)}`}</Num> أوقية
              </small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
const refLabel = (ref: string) => `${ref[0] === "A" ? "أ" : "ب"} ${ref.slice(2)}`;

function PersonPicker({ t, onDone, autoFocus }: { t: T; onDone: () => void; autoFocus?: boolean }) {
  const { d } = useP();
  const [q, setQ] = useState("");
  const inList = new Set(t.lines.flatMap((l) => (l.t === "gift" ? [] : [l.ref])));
  const list = useMemo(() => {
    const act = d.members.filter((m) => m.status === "active" && !inList.has(m.ref));
    const s = q.trim();
    if (!s) return ["B-18", "A-9", "B-8", "A-1"].flatMap((r) => act.filter((m) => m.ref === r));
    const digits = s.replace(/\D/g, "");
    return act
      .filter((m) => m.name.includes(s) || (digits !== "" && String(m.no) === digits))
      .slice(0, 8);
  }, [q, d.members, inList]);
  return (
    <div className="r2-picker">
      <label className="pa-search">
        {X.search(22)}
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="اسم العضو أو رقمه، مثل ب 12"
          aria-label="ابحث عن العضو"
        />
      </label>
      {!q && <p className="pa-hint">آخر من سجّلت لهم</p>}
      <ul className="pa-rows">
        {list.map((m) => (
          <li key={m.ref}>
            <button
              type="button"
              className="pa-row"
              onClick={() => {
                t.addPerson(m.ref);
                onDone();
              }}
            >
              <Avatar refs={m.ref} />
              <span className="pa-row-t">
                <b>{m.name}</b>
                <small>{payStatus(m)}</small>
              </span>
              {X.plus(20)}
            </button>
          </li>
        ))}
        {!list.length && <li className="pa-empty">لا أحد بهذا الاسم. جرّب رقمه في الورقة.</li>}
      </ul>
      {!!t.lines.length && (
        <button type="button" className="pa-btn pa-btn-ghost pa-btn-sm" onClick={onDone}>
          إلغاء
        </button>
      )}
    </div>
  );
}

function LevyPicker({ t, onDone }: { t: T; onDone: () => void }) {
  const { d } = useP();
  const people = t.lines.flatMap((l) =>
    l.t === "fees" ? [d.members.find((m) => m.ref === l.ref)!] : [],
  );
  const options = people.flatMap((m) =>
    levyOwed(m, d)
      .filter((lv) => !t.lines.some((l) => l.t === "levy" && l.ref === m.ref && l.levyId === lv.id))
      .map((lv) => ({ m, lv })),
  );
  return (
    <div className="r2-picker">
      <p className="pa-label">نصيب لوحة، لمن؟</p>
      {options.length ? (
        <ul className="pa-rows">
          {options.map(({ m, lv }) => (
            <li key={m.ref + lv.id}>
              <button
                type="button"
                className="pa-row"
                onClick={() => {
                  t.addLevy(m.ref, lv.id);
                  onDone();
                }}
              >
                <span className="pa-ic pa-ic-g">{X.list(20)}</span>
                <span className="pa-row-t">
                  <b>{m.name}</b>
                  <small>
                    لوحة {lv.title} · <Money v={lv.perMember} />
                  </small>
                </span>
                {X.plus(20)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pa-empty">لا نصيب لوحة باقٍ على من في هذه الدفعة.</p>
      )}
      <button type="button" className="pa-btn pa-btn-ghost pa-btn-sm" onClick={onDone}>
        إلغاء
      </button>
    </div>
  );
}

function GiftPicker({ t, onDone }: { t: T; onDone: () => void }) {
  const { d } = useP();
  const first = t.lines.find((l) => l.t !== "gift") as Extract<Line, { ref: string }> | undefined;
  const name = first ? d.members.find((m) => m.ref === first.ref)!.name : "";
  return (
    <div className="r2-picker">
      <p className="pa-label">تبرع في أي حملة؟</p>
      <ul className="pa-rows">
        {d.campaigns
          .filter((c) => c.status === "open")
          .map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="pa-row"
                onClick={() => {
                  t.addGift(c.id, name);
                  onDone();
                }}
              >
                <span className="pa-ic pa-ic-gold">{X.heart(20)}</span>
                <span className="pa-row-t">
                  <b>{c.title}</b>
                  <small>
                    جُمع <Money v={c.collected} unit={false} /> من <Money v={c.target} />
                  </small>
                </span>
                {X.plus(20)}
              </button>
            </li>
          ))}
      </ul>
      <button type="button" className="pa-btn pa-btn-ghost pa-btn-sm" onClick={onDone}>
        إلغاء
      </button>
    </div>
  );
}

/* how it was paid */
function HowSec({ t, big, shotAmt }: { t: T; big: boolean; shotAmt: number }) {
  if (t.how === "none")
    return (
      <section className="pa-sec">
        <h2>كيف دفع؟</h2>
        <div className={`r2-how ${big ? "r2-how-big" : ""}`}>
          <button type="button" className="r2-how-b r2-how-img" onClick={t.readShot}>
            {X.image(big ? 32 : 26)}
            <b>{big ? "اختر صورة التحويل" : "أرفق صورة التحويل"}</b>
            <small>نقرأ منها المبلغ ورقم العملية</small>
          </button>
          <button type="button" className="r2-how-b" onClick={() => t.setHow("cash")}>
            {X.cash(big ? 32 : 26)}
            <b>نقدًا</b>
            <small>استلمتها بيدك</small>
          </button>
        </div>
      </section>
    );
  if (t.how === "reading")
    return (
      <p className="r2-reading" role="status">
        {X.image(22)} نقرأ الصورة…
      </p>
    );
  if (t.how === "cash")
    return (
      <section className="r2-paid">
        <Wallet method="cash" size={32} />
        <span className="pa-sub">نقدًا، اليوم 28 سبتمبر</span>
        <button type="button" className="pa-btn pa-btn-ghost pa-btn-sm" onClick={t.readShot}>
          {X.image(18)} صورة بدلًا منها
        </button>
      </section>
    );
  return (
    <section className="r2-paid">
      <FakeShot small />
      <dl className="r2-ocr">
        <dt>في الصورة</dt>
        <dd>
          <Num>{fmt(shotAmt / 10)} MRU</Num> = <Money v={shotAmt} />
        </dd>
        <dt>الوسيلة</dt>
        <dd>
          <Wallet method="bankily" size={18} />
        </dd>
        <dt>رقم العملية</dt>
        <dd>
          <Num>26092814031952</Num>
        </dd>
      </dl>
    </section>
  );
}

/* sticky total = the transfer */
function Foot({ t, shotAmt, onSave }: { t: T; shotAmt: number; onSave: () => void }) {
  const diff = t.total - shotAmt;
  const next = !t.lines.length
    ? "اختر العضو"
    : t.lines.some((l) => l.t === "fees" && !l.months.length)
      ? "اختر الأشهر"
      : t.lines.some((l) => l.t === "gift" && !l.amount)
        ? "اكتب مبلغ التبرع"
        : t.how === "none" || t.how === "reading"
          ? "كيف دفع؟"
          : null;
  return (
    <div className="r2-foot">
      <div className="r2-foot-sum">
        <span>
          <small>المجموع</small>
          <b>
            <Money v={t.total} />
          </b>
        </span>
        {t.how === "read" && (
          <span className={`r2-check ${diff === 0 ? "ok" : ""}`} role="status">
            في الصورة <Money v={shotAmt} unit={false} />
            {diff === 0 ? (
              <> {X.check(16)} مطابق</>
            ) : (
              <>
                {" "}
                · {diff > 0 ? "المجموع أكثر بـ" : "المجموع أقل بـ"}{" "}
                <Money v={Math.abs(diff)} unit={false} />
              </>
            )}
          </span>
        )}
      </div>
      <button
        type="button"
        className="pa-btn pa-btn-primary pa-btn-lg"
        disabled={!!next}
        onClick={onSave}
      >
        {next ?? <>{X.check(20)} سجّل</>}
      </button>
    </div>
  );
}

/* the receipt covers every row of the transfer */
function Done({ t }: { t: T }) {
  const { d, href, snack } = useP();
  const first = t.lines.find((l) => l.t !== "gift") as Extract<Line, { ref: string }> | undefined;
  const payer = first ? d.members.find((m) => m.ref === first.ref)!.name : "فاعل خير";
  return (
    <div className="pa-page r2">
      <p className="r2-done">{X.check(22)} سُجّلت الدفعة. هذا وصلها:</p>
      <div className="pa-receipt">
        <div className="pa-receipt-h">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="" width={40} height={40} />
          <span>
            <b>وصل استلام</b>
            <small>
              رقم <Num>2026-0232</Num>
            </small>
          </span>
        </div>
        <p className="pa-receipt-who">{payer}</p>
        <p className="pa-receipt-amt">
          <Money v={t.total} />
        </p>
        <ul className="r2-rlines">
          {t.lines.map((l) => (
            <li key={l.id}>
              <span>
                {l.t === "gift"
                  ? `تبرع: ${d.campaigns.find((c) => c.id === l.campaignId)!.title}`
                  : l.t === "levy"
                    ? `${d.members.find((m) => m.ref === l.ref)!.name}: لوحة ${d.levies.find((x) => x.id === l.levyId)!.title}`
                    : `${d.members.find((m) => m.ref === l.ref)!.name}: رسوم ${monthsWords(l.months)}`}
              </span>
              <Money v={lineAmount(l, d)} unit={false} />
            </li>
          ))}
        </ul>
        <dl className="pa-dl">
          <dt>كيف دفع</dt>
          <dd>
            <Wallet method={t.how === "cash" ? "cash" : "bankily"} size={22} />
          </dd>
          <dt>التاريخ</dt>
          <dd>28 سبتمبر 2026</dd>
          <dt>سجّلها</dt>
          <dd>{d.me.name}</dd>
        </dl>
      </div>
      <button
        type="button"
        className="pa-btn pa-btn-primary pa-btn-lg pa-btn-block"
        onClick={() => snack("فُتحت مشاركة الوصل. اختر واتساب.")}
      >
        {X.share(20)} شارك الوصل
      </button>
      <Link href={href("record")} className="pa-btn pa-btn-tonal pa-btn-block">
        {X.plus(20)} دفعة أخرى
      </Link>
      <Link href={href("")} className="pa-btn pa-btn-ghost pa-btn-block">
        إلى الرئيسية
      </Link>
    </div>
  );
}

/* ───────── tap counts (typing a name is not a tap) ───────── */
