"use client";
// «سجّل دفعة» (owner pick C2): start from the member (or a search); quick month choices;
// several people, a لوحة share, a donation or an outside donor in one transfer; the screenshot
// is read on the phone (OCR); a sticky total against the amount in the picture. The payment is
// confirmed at once (m29). No receipt: «سُجّلت الدفعة ✓» and «تراجع» for 30 seconds.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOnline } from "@/components/providers";
import { rememberMembers, useAct } from "@/components/app/act";
import { sendOnce, useOnceId } from "@/components/app/once-id";
import { compressImage, dataUrlToBlob } from "@/lib/compress-image";
import { failure } from "@/lib/data/errors";
import type { AllocationInput } from "@/lib/data/schemas";
import { MONTHS_AR, todayIso } from "@/lib/dates";
import { METHOD_LABELS, type Method } from "@/lib/methods";
import { mroToMru, parseAmount, toWesternDigits } from "@/lib/money";
import { readReceipt } from "@/lib/ocr";
import { safeStorage } from "@/lib/safe-storage";
import { imageOpenError } from "@/components/app/derive";
import {
  Avatar,
  Back,
  Chips,
  findMembers,
  fmt,
  levyOwed,
  levyShare,
  Money,
  monthsWords,
  Num,
  payStatus,
  upcoming,
  useP,
  Wallet,
  X,
} from "./kit";
import { coPaidMembers } from "./report-action";
import type { PData, PMember } from "./types";
import "./record2.css";

type Mode = "late" | "rest" | "pick";
type Line =
  | { id: number; t: "fees"; ref: string; mode: Mode; months: number[] }
  | { id: number; t: "levy"; ref: string; levyId: string }
  | { id: number; t: "gift"; campaignId: string; ref: string | null; name: string; amount: number };
type Shot = {
  url: string;
  file: File;
  reading: boolean;
  amount: number | null;
  method: Method | null;
  txn: string | null;
  date: string | null;
};

const RECENT_KEY = "bq-recent-payers";
const readRecent = (): string[] => {
  try {
    const v = JSON.parse(safeStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 4) : [];
  } catch {
    return [];
  }
};
const rememberRecent = (ids: string[]) =>
  safeStorage.setItem(
    RECENT_KEY,
    JSON.stringify([...new Set([...ids, ...readRecent()])].slice(0, 4)),
  );

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
const familyName = (name: string) => {
  const i = name.indexOf("ولد ");
  return i >= 0 ? name.slice(i) : "";
};

function lineAmount(l: Line, d: PData): number {
  if (l.t === "fees") return l.months.length * (d.members.find((m) => m.ref === l.ref)?.fee ?? 0);
  if (l.t === "levy") {
    const lv = d.levies.find((x) => x.id === l.levyId);
    return lv ? levyShare(lv, l.ref) : 0;
  }
  return l.amount;
}

let seq = 1;
function useTransfer(start: { ref?: string; levy?: string; c?: string; cash?: boolean }) {
  const { d } = useP();
  const [lines, setLines] = useState<Line[]>(() => {
    const m = d.members.find((x) => x.ref === start.ref);
    const out: Line[] = [];
    if (m && !start.levy && !start.c)
      out.push({ id: seq++, t: "fees", ref: m.ref, ...firstMode(m) });
    if (m && start.levy) out.push({ id: seq++, t: "levy", ref: m.ref, levyId: start.levy });
    if (start.c)
      out.push({
        id: seq++,
        t: "gift",
        campaignId: start.c,
        ref: m?.ref ?? null,
        name: m?.name ?? "",
        amount: 0,
      });
    return out;
  });
  const [cash, setCash] = useState(!!start.cash);
  const [method, setMethod] = useState<Method | null>(start.cash ? "cash" : null);
  const [shot, setShot] = useState<Shot | null>(null);
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
  const addGift = (campaignId: string, ref: string | null, name: string) =>
    setLines((s) => [...s, { id: seq++, t: "gift", campaignId, ref, name, amount: 0 }]);
  const setGift = (id: number, patch: Partial<{ amount: number; name: string }>) =>
    setLines((s) => s.map((l) => (l.id === id && l.t === "gift" ? { ...l, ...patch } : l)));
  const total = lines.reduce((n, l) => n + lineAmount(l, d), 0);

  // read the screenshot on the phone: amount, wallet, transaction number, date
  const readSeq = useRef(0);
  const pickShot = async (file: File) => {
    const k = ++readSeq.current;
    let url: string;
    try {
      url = await compressImage(file);
    } catch {
      return imageOpenError(file);
    }
    setCash(false);
    setShot({ url, file, reading: true, amount: null, method: null, txn: null, date: null });
    readReceipt(file, {
      expectedMro: total || undefined,
      accounts: d.accounts.map((a) => ({
        method: a.method,
        accountNumber: a.number,
        holderName: a.holder,
      })),
    })
      .then((r) => {
        if (k !== readSeq.current) return;
        setShot(
          (s) =>
            s && {
              ...s,
              reading: false,
              amount: r.amountMro,
              method: (r.method as Method | null) ?? null,
              txn: r.txnRef,
              date: r.date && /^\d{4}-\d{2}-\d{2}/.test(r.date) ? r.date.slice(0, 10) : null,
            },
        );
        if (r.method) setMethod(r.method as Method);
      })
      .catch(() => k === readSeq.current && setShot((s) => s && { ...s, reading: false }));
    return null;
  };
  return {
    lines,
    total,
    cash,
    setCash,
    method,
    setMethod,
    shot,
    setShot,
    pickShot,
    addPerson,
    setMode,
    toggle,
    remove,
    addLevy,
    addGift,
    setGift,
  };
}
type T = ReturnType<typeof useTransfer>;

/* ───────── the flow ───────── */
export function RecordScreen() {
  const { d, q } = useP();
  const t = useTransfer({ ref: q.m, levy: q.levy, c: q.c, cash: q.cash === "1" });
  const [adding, setAdding] = useState<null | "person" | "levy" | "gift" | "outside">(null);
  const [saved, setSaved] = useState<{ id: string; text: string } | null>(null);
  const first = t.lines.find((l) => l.t !== "gift") as
    Extract<Line, { t: "fees" | "levy" }> | undefined;
  const firstMember = first ? d.members.find((m) => m.ref === first.ref) : undefined;

  if (saved) return <Done id={saved.id} text={saved.text} />;

  return (
    <div className="pa-page r2">
      <Back to="" label="الرئيسية" />
      <h1>سجّل دفعة</h1>
      <section className="pa-sec">
        <div className="pa-sec-h">
          <h2>{t.lines.length ? "هذه الدفعة عن" : "لمن هذه الدفعة؟"}</h2>
          {t.lines.length > 1 && (
            <span className="pa-hint">
              <Num>{t.lines.length}</Num> في تحويل واحد
            </span>
          )}
        </div>
        {!!t.lines.length && (
          <ul className="r2-lines">
            {t.lines.map((l) => (
              <LineRow key={l.id} l={l} t={t} />
            ))}
          </ul>
        )}
        {!t.lines.length && adding !== "outside" ? (
          <>
            <PersonPicker t={t} onDone={() => undefined} autoFocus />
            <OpenGifts t={t} onOutside={() => setAdding("outside")} />
          </>
        ) : (
          <>
            {firstMember && <Relatives m={firstMember} t={t} />}
            {adding === "person" && <PersonPicker t={t} onDone={() => setAdding(null)} autoFocus />}
            {adding === "levy" && <LevyPicker t={t} onDone={() => setAdding(null)} />}
            {adding === "gift" && <GiftPicker t={t} onDone={() => setAdding(null)} />}
            {adding === "outside" && <GiftPicker t={t} outside onDone={() => setAdding(null)} />}
            {adding === null && (
              <div className="r2-add">
                <button
                  type="button"
                  className="pa-btn pa-btn-soft pa-btn-sm"
                  onClick={() => setAdding("person")}
                >
                  {X.plus(18)} شخص آخر
                </button>
                {d.levies.some((l) => l.status === "open") && (
                  <button
                    type="button"
                    className="pa-btn pa-btn-tonal pa-btn-sm"
                    onClick={() => setAdding("levy")}
                  >
                    {X.plus(18)} نصيب لوحة
                  </button>
                )}
                {d.campaigns.some((c) => c.status === "open") && (
                  <>
                    <button
                      type="button"
                      className="pa-btn pa-btn-tonal pa-btn-sm"
                      onClick={() => setAdding("gift")}
                    >
                      {X.plus(18)} تبرع
                    </button>
                    <button
                      type="button"
                      className="pa-btn pa-btn-tonal pa-btn-sm"
                      onClick={() => setAdding("outside")}
                    >
                      {X.plus(18)} متبرع من خارج الصندوق
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </section>
      {!!t.lines.length && <HowSec t={t} />}
      <Foot t={t} onSaved={(id, text) => setSaved({ id, text })} />
    </div>
  );
}

/* one row per person (or share, or donation) */
function LineRow({ l, t }: { l: Line; t: T }) {
  const { d } = useP();
  const amount = lineAmount(l, d);
  if (l.t === "gift") {
    const c = d.campaigns.find((x) => x.id === l.campaignId);
    return (
      <li className="r2-line">
        <div className="r2-line-h">
          <span className="pa-ic pa-ic-gold">{X.heart(20)}</span>
          <span className="pa-row-t">
            <b>تبرع: {c?.title}</b>
            <small>{l.ref ? `باسم ${l.name}` : "من خارج الصندوق"}</small>
          </span>
          <Remove onClick={() => t.remove(l.id)} />
        </div>
        {!l.ref && (
          <label className="r2-amt">
            <span>اسم المتبرع</span>
            <input
              value={l.name}
              maxLength={120}
              onChange={(e) => t.setGift(l.id, { name: e.target.value })}
              placeholder="فاعل خير"
            />
          </label>
        )}
        <label className="r2-amt">
          <span>المبلغ</span>
          <input
            inputMode="numeric"
            dir="ltr"
            value={l.amount ? String(l.amount) : ""}
            onChange={(e) =>
              t.setGift(l.id, {
                amount: Math.round(parseAmount(toWesternDigits(e.target.value)) ?? 0),
              })
            }
            placeholder="0"
            aria-label="مبلغ التبرع بالأوقية القديمة"
          />
          <span className="pa-unit">أوقية</span>
        </label>
      </li>
    );
  }
  const m = d.members.find((x) => x.ref === l.ref)!;
  if (l.t === "levy") {
    const lv = d.levies.find((x) => x.id === l.levyId);
    return (
      <li className="r2-line">
        <div className="r2-line-h">
          <Avatar refs={m.ref} />
          <span className="pa-row-t">
            <b>{m.name}</b>
            <small>نصيبه من لوحة {lv?.title}</small>
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
    ...(upcoming(m).length || m.owed.length
      ? [{ k: "rest" as Mode, l: nothingPaid ? "السنة كاملة" : "باقي السنة" }]
      : []),
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
      <Chips
        label={`أشهر ${m.name}`}
        value={l.mode}
        onChange={(k) => t.setMode(l.id, k)}
        options={modes}
      />
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

/** Paid together with him before (m29), then the same family name: one tap adds each. */
function Relatives({ m, t }: { m: PMember; t: T }) {
  const { d } = useP();
  const [past, setPast] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    coPaidMembers(m.id)
      .then((r) => live && setPast(r.map((x) => x.memberRef)))
      .catch(() => live && setPast([]));
    return () => {
      live = false;
    };
  }, [m.id]);
  const inList = new Set(t.lines.flatMap((l) => (l.t === "gift" || !l.ref ? [] : [l.ref])));
  const byRef = new Map(d.members.map((x) => [x.ref, x]));
  const fam = familyName(m.name);
  const withHim = (past ?? []).flatMap((r) => (byRef.has(r) ? [byRef.get(r)!] : []));
  const family = d.members.filter(
    (x) => x.status === "active" && x.ref !== m.ref && fam && x.name.endsWith(fam) && x.owed.length,
  );
  const rel = [...withHim, ...family]
    .filter((x, i, all) => all.findIndex((y) => y.ref === x.ref) === i)
    .filter((x) => x.ref !== m.ref && !inList.has(x.ref) && x.status === "active")
    .slice(0, 3);
  if (!rel.length) return null;
  return (
    <div className="r2-rel">
      <p className="pa-hint">
        {withHim.length ? "دُفع لهم معه سابقًا:" : "من عائلته، عليهم رسوم:"}
      </p>
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
              <small>{payStatus(x)}</small>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PersonPicker({ t, onDone, autoFocus }: { t: T; onDone: () => void; autoFocus?: boolean }) {
  const { d } = useP();
  const [q, setQ] = useState("");
  const [recent] = useState(readRecent);
  const taken = t.lines.flatMap((l) => (l.t === "gift" || !l.ref ? [] : [l.ref])).join(",");
  const { list, already } = useMemo(() => {
    const inList = new Set(taken.split(","));
    const act = d.members.filter((m) => m.status === "active");
    if (!q.trim())
      return {
        list: recent.flatMap((id) => act.filter((m) => m.id === id && !inList.has(m.ref))),
        already: [],
      };
    const found = findMembers(act, q);
    return {
      list: found.filter((m) => !inList.has(m.ref)).slice(0, 8),
      already: found.filter((m) => inList.has(m.ref)),
    };
  }, [q, d.members, taken, recent]);
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
      {!q && list.length > 0 && <p className="pa-hint">آخر من سجّلت لهم</p>}
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
        {q && !list.length && (
          <li className="pa-empty">
            {already.length ? `${already[0].name} في هذه الدفعة.` : "لا أحد بهذا الاسم أو الرقم."}
          </li>
        )}
      </ul>
      {!!t.lines.length && (
        <button type="button" className="pa-btn pa-btn-ghost pa-btn-sm" onClick={onDone}>
          إلغاء
        </button>
      )}
    </div>
  );
}

/** No member yet: a donation from someone outside the fund starts here. */
function OpenGifts({ onOutside }: { t: T; onOutside: () => void }) {
  const { d } = useP();
  if (!d.campaigns.some((c) => c.status === "open")) return null;
  return (
    <button type="button" className="pa-btn pa-btn-soft pa-btn-block" onClick={onOutside}>
      {X.heart(20)} تبرع من خارج الصندوق
    </button>
  );
}

function LevyPicker({ t, onDone }: { t: T; onDone: () => void }) {
  const { d } = useP();
  const people = t.lines.flatMap((l) =>
    l.t === "fees" ? [d.members.find((m) => m.ref === l.ref)!] : [],
  );
  const options = people.flatMap((m) =>
    levyOwed(m, d)
      .filter((lv) => lv.status === "open")
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
                    لوحة {lv.title} · <Money v={levyShare(lv, m.ref)} />
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

function GiftPicker({ t, onDone, outside }: { t: T; onDone: () => void; outside?: boolean }) {
  const { d } = useP();
  const first = t.lines.find((l) => l.t !== "gift") as
    Extract<Line, { t: "fees" | "levy" }> | undefined;
  const m = first ? d.members.find((x) => x.ref === first.ref) : undefined;
  return (
    <div className="r2-picker">
      <p className="pa-label">
        {outside ? "تبرع من خارج الصندوق، في أي حملة؟" : "تبرع في أي حملة؟"}
      </p>
      <ul className="pa-rows">
        {d.campaigns
          .filter((c) => c.status === "open")
          .map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="pa-row"
                onClick={() => {
                  t.addGift(
                    c.id,
                    outside ? null : (m?.ref ?? null),
                    outside ? "" : (m?.name ?? ""),
                  );
                  onDone();
                }}
              >
                <span className="pa-ic pa-ic-gold">{X.heart(20)}</span>
                <span className="pa-row-t">
                  <b>{c.title}</b>
                  {c.target > 0 && (
                    <small>
                      جُمع <Money v={c.collected} unit={false} /> من <Money v={c.target} />
                    </small>
                  )}
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

/* how it was paid: the screenshot (read here) or cash */
function HowSec({ t }: { t: T }) {
  const { d } = useP();
  const [err, setErr] = useState("");
  const input = (
    <input
      type="file"
      accept="image/*"
      className="bq-sr"
      onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) setErr((await t.pickShot(f)) ?? "");
      }}
    />
  );
  const wallets = d.accounts.filter((a) => a.active);
  return (
    <section className="pa-sec">
      <h2>كيف دفع؟</h2>
      {!t.shot && !t.cash ? (
        <div className="r2-how">
          <label className="r2-how-b r2-how-img">
            {X.image(26)}
            <b>أضف صورة التحويل</b>
            <small>نقرأ منها المبلغ ورقم العملية</small>
            {input}
          </label>
          <button
            type="button"
            className="r2-how-b"
            onClick={() => {
              t.setCash(true);
              t.setMethod("cash");
            }}
          >
            {X.cash(26)}
            <b>نقدًا</b>
            <small>استلمتها بيدك</small>
          </button>
        </div>
      ) : t.cash ? (
        <div className="r2-paid">
          <Wallet method="cash" size={32} />
          <span className="pa-sub">نقدًا، اليوم</span>
          <label className="pa-btn pa-btn-ghost pa-btn-sm">
            {X.image(18)} صورة بدلًا منها
            {input}
          </label>
        </div>
      ) : (
        t.shot && (
          <div className="r2-paid">
            {/* eslint-disable-next-line @next/next/no-img-element -- local picture */}
            <img src={t.shot.url} alt="صورة التحويل" className="r2-shot" />
            {t.shot.reading ? (
              <p className="pa-hint" role="status">
                نقرأ الصورة…
              </p>
            ) : (
              <dl className="r2-ocr">
                <dt>في الصورة</dt>
                <dd>
                  {t.shot.amount ? (
                    <>
                      <Num>{fmt(mroToMru(t.shot.amount))} MRU</Num> = <Money v={t.shot.amount} />
                    </>
                  ) : (
                    "لم نقرأ المبلغ"
                  )}
                </dd>
                {t.shot.txn && (
                  <>
                    <dt>رقم العملية</dt>
                    <dd>
                      <Num>{t.shot.txn}</Num>
                    </dd>
                  </>
                )}
              </dl>
            )}
            <label className="pa-btn pa-btn-ghost pa-btn-sm">
              {X.image(18)} صورة أخرى
              {input}
            </label>
          </div>
        )
      )}
      {t.shot && !t.shot.reading && (
        <>
          <p className="pa-label">المحفظة</p>
          <Chips
            label="المحفظة"
            value={t.method ?? ""}
            onChange={(k) => t.setMethod((k || null) as Method | null)}
            options={wallets.map((a) => ({ k: a.method, l: METHOD_LABELS[a.method] }))}
          />
        </>
      )}
      {err && (
        <p className="pa-alert" role="alert">
          {err}
        </p>
      )}
    </section>
  );
}

/* sticky total = the transfer; save */
function Foot({ t, onSaved }: { t: T; onSaved: (id: string, text: string) => void }) {
  const { d } = useP();
  const router = useRouter();
  const online = useOnline();
  const once = useOnceId();
  const { recordPayment, uploadProof } = useAct();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const shotAmt = t.shot?.amount ?? null;
  const diff = shotAmt === null ? 0 : t.total - shotAmt;
  const next = !t.lines.length
    ? "اختر العضو"
    : t.lines.some((l) => l.t === "fees" && !l.months.length)
      ? "اختر الأشهر"
      : t.lines.some((l) => l.t === "gift" && !l.amount)
        ? "اكتب مبلغ التبرع"
        : !t.shot && !t.cash
          ? "كيف دفع؟"
          : t.shot?.reading
            ? "نقرأ الصورة…"
            : !t.cash && !t.method
              ? "اختر المحفظة"
              : null;

  const save = async () => {
    if (next || busy) return;
    setBusy(true);
    setErr("");
    const year = d.year;
    const byRef = new Map(d.members.map((m) => [m.ref, m]));
    const allocations = t.lines.flatMap((l): AllocationInput[] => {
      if (l.t === "fees") {
        const m = byRef.get(l.ref)!;
        return l.months.map((month) => ({
          kind: "months" as const,
          memberId: m.id,
          year,
          month,
          amount: m.fee,
        }));
      }
      if (l.t === "levy")
        return [
          {
            kind: "campaign" as const,
            campaignId: l.levyId,
            memberId: byRef.get(l.ref)!.id,
            amount: lineAmount(l, d),
          },
        ];
      return [
        {
          kind: "campaign" as const,
          campaignId: l.campaignId,
          memberId: l.ref ? byRef.get(l.ref)!.id : null,
          amount: l.amount,
        },
      ];
    });
    const who = t.lines.find((l) => l.t !== "gift" || l.ref);
    const gift = t.lines.find((l) => l.t === "gift");
    const payer = who?.ref
      ? byRef.get(who.ref)!.name
      : (gift?.t === "gift" && gift.name.trim()) || "فاعل خير";
    let r;
    try {
      r = await sendOnce(once, async (id) => {
        let proof: { path: string; hash: string } | undefined;
        if (t.shot && !t.cash) {
          const fd = new FormData();
          fd.set("file", dataUrlToBlob(t.shot.url), "proof.jpg");
          fd.set("kind", "payments");
          fd.set("id", id);
          const up = await uploadProof(fd);
          if (!up.ok) return up;
          proof = up.data;
        }
        rememberMembers(
          t.lines.flatMap((l) => {
            const m = l.t !== "gift" || l.ref ? byRef.get(l.ref as string) : undefined;
            return m ? [{ memberId: m.id, fullName: m.name, listCode: m.group, number: m.no }] : [];
          }),
        );
        return recordPayment({
          id,
          payerName: payer,
          method: t.cash ? "cash" : (t.method as Method),
          amount: t.total,
          paidOn: (t.shot?.date && t.shot.date <= todayIso() ? t.shot.date : null) ?? todayIso(),
          allocations,
          txnRef: t.cash ? undefined : (t.shot?.txn ?? undefined),
          proofPath: proof?.path,
          proofHash: proof?.hash,
        });
      });
    } catch {
      r = failure("network");
    } finally {
      setBusy(false);
    }
    if (!r.ok) return setErr(r.message);
    rememberRecent(
      t.lines.flatMap((l) => (l.t !== "gift" || l.ref ? [byRef.get(l.ref as string)!.id] : [])),
    );
    router.refresh();
    onSaved(r.data.id, `${payer}: ${fmt(t.total)} أوقية`);
  };

  return (
    <div className="r2-foot">
      <div className="r2-foot-sum">
        <span>
          <small>المجموع</small>
          <b>
            <Money v={t.total} />
          </b>
        </span>
        {shotAmt !== null && (
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
      {err && (
        <p className="pa-alert" role="alert">
          {err}
        </p>
      )}
      <button
        type="button"
        className="pa-btn pa-btn-primary pa-btn-lg"
        disabled={!!next || busy || !online}
        onClick={() => void save()}
      >
        {busy ? "جارٍ الحفظ…" : (next ?? <>{X.check(20)} سجّل</>)}
      </button>
    </div>
  );
}

/** Saved: no receipt (owner). «تراجع» for 30 seconds, then the next payment or home. */
function Done({ id, text }: { id: string; text: string }) {
  const { href, snack } = useP();
  const router = useRouter();
  const { undoPayment } = useAct();
  const [left, setLeft] = useState(30);
  const [undone, setUndone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (left <= 0 || undone) return;
    const k = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(k);
  }, [left, undone]);
  return (
    <div className="pa-page r2">
      <p className="r2-done" role="status">
        {X.check(22)} {undone ? "تراجعت عن الدفعة." : "سُجّلت الدفعة"}
      </p>
      <p className="pa-lead">{text}</p>
      {!undone && left > 0 && (
        <button
          type="button"
          className="pa-btn pa-btn-soft pa-btn-block"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await undoPayment({ id });
            setBusy(false);
            if (!r.ok) return snack(r.message);
            setUndone(true);
            router.refresh();
          }}
        >
          {`تراجع (${left})`}
        </button>
      )}
      <Link href={href("record")} className="pa-btn pa-btn-primary pa-btn-lg pa-btn-block">
        {X.plus(20)} دفعة أخرى
      </Link>
      <Link href={href("")} className="pa-btn pa-btn-ghost pa-btn-block">
        إلى الرئيسية
      </Link>
    </div>
  );
}
