"use client";
// «سجّل دفعة» (owner pick C2): start from the member (or a search); quick month choices;
// several people, a لوحة share, a donation or an outside donor in one transfer; the screenshot
// is read on the phone (OCR); a sticky total against the amount in the picture. The payment is
// confirmed at once (m29). No receipt: «سُجّلت الدفعة ✓» and «تراجع» for 30 seconds.
import { AmountInput, amountValue } from "@/components/app/amount-input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useOnline } from "@/components/providers";
import { rememberMembers, useAct } from "@/components/app/act";
import { sendOnce, useOnceId } from "@/components/app/once-id";
import { compressImage, dataUrlToBlob } from "@/lib/compress-image";
import { failure } from "@/lib/data/errors";
import type { AllocationInput } from "@/lib/data/schemas";
import { MONTHS_AR, todayIso } from "@/lib/dates";
import type { Method } from "@/lib/methods";
import { readReceipt } from "@/lib/ocr";
import { imageOpenError, parseMemberRef } from "@/components/app/derive";
import { DateField } from "@/components/app/date-field";
import {
  Avatar,
  Back,
  Chips,
  fmt,
  levyOwed,
  levyShare,
  nothingToPay,
  owes,
  Money,
  monthsWords,
  Num,
  payStatus,
  Sheet,
  upcoming,
  useP,
  Wallet,
  X,
} from "./kit";
import { feeAllocations, feesTotal, pastWords, payablePast, priceOf, ym } from "./fees";
import { coPaidMembers } from "./report-action";
import { choiceForMethod, WalletPicker, walletDone, type WalletChoice } from "./wallet-picker";
import { MemberPicker, readRecent, rememberRecent } from "./member-picker";
import type { PData, PMember } from "./types";
import "./record2.css";

type Mode = "late" | "rest" | "pick";
type Line =
  | { id: number; t: "fees"; ref: string; mode: Mode; months: number[]; past: string[] }
  | { id: number; t: "levy"; ref: string; levyId: string }
  | { id: number; t: "gift"; campaignId: string; ref: string | null; name: string; amount: number };
type Shot = {
  url: string;
  file: File;
  reading: boolean;
  /** as printed on the screenshot: always new ouguiya (MRU) */
  amountMru: number | null;
  /** the same in old ouguiya (MRU × 10), what the app counts */
  amount: number | null;
  method: Method | null;
  txn: string | null;
  date: string | null;
};

/** Late months of earlier years are always part of «الأشهر المتأخرة» and «باقي السنة». */
const monthsFor = (m: PMember, mode: Mode) =>
  mode === "late"
    ? { months: m.owed, past: payablePast(m) }
    : { months: [...m.owed, ...upcoming(m)].sort((a, b) => a - b), past: payablePast(m) };
const firstMode = (m: PMember): { mode: Mode; months: number[]; past: string[] } =>
  m.owed.length || payablePast(m).length
    ? { mode: "late", ...monthsFor(m, "late") }
    : { mode: "pick", months: upcoming(m).slice(0, 1), past: [] };
const familyName = (name: string) => {
  const i = name.indexOf("ولد ");
  return i >= 0 ? name.slice(i) : "";
};

function lineAmount(l: Line, d: PData): number {
  if (l.t === "fees") {
    const m = d.members.find((x) => x.ref === l.ref);
    return m ? feesTotal(m, d.year, l.months, l.past) : 0;
  }
  if (l.t === "levy") {
    const lv = d.levies.find((x) => x.id === l.levyId);
    return lv ? levyShare(lv, l.ref) : 0;
  }
  return l.amount;
}

/** «شخص واحد», «شخصان», «3 أشخاص», «11 شخصًا» */
export function peopleWords(n: number) {
  if (n === 1) return "شخص واحد";
  if (n === 2) return "شخصان";
  if (n <= 10) return `${n} أشخاص`;
  return `${n} شخصًا`;
}
/** «أ»، «أ وب»، «أ، ب وج» */
export const joinAnd = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join("، ")} و${xs[xs.length - 1]}`;

let seq = 1;
function useTransfer(start: { ref?: string; levy?: string; c?: string; cash?: boolean }) {
  const { d } = useP();
  const [lines, setLines] = useState<Line[]>(() => {
    // «أ-4», «أ4», «A-4»: the same member whichever way the link was typed
    const want = start.ref ? (parseMemberRef(start.ref) ?? start.ref) : undefined;
    const m = d.members.find((x) => x.ref === want);
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
  // the wallet it came into (m41); cash needs none
  const [wallet, setWallet] = useState<WalletChoice | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  // the picture could not be read: the amount typed from it, in MRU as printed (null = not yet)
  const [typedMru, setTypedMru] = useState<number | null>(null);
  // total ≠ picture: the reason, kept in the note (null = the field is not open)
  const [why, setWhy] = useState<string | null>(null);
  // «حُذفت الصورة» + «تراجع» for 5 seconds
  const [undo, setUndo] = useState<{ shot: Shot; typedMru: number | null } | null>(null);
  // the day the money was sent: the picture's date when it has one, else today; can be changed
  const [paidOn, setPaidOn] = useState(todayIso());
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
        return mode === "pick" ? { ...l, mode } : { ...l, mode, ...monthsFor(m, mode) };
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
  const togglePast = (id: number, key: string) =>
    setLines((s) =>
      s.map((l) =>
        l.id === id && l.t === "fees"
          ? {
              ...l,
              mode: "pick",
              past: l.past.includes(key)
                ? l.past.filter((x) => x !== key)
                : [...l.past, key].sort(),
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
    setUndo(null);
    setTypedMru(null);
    setShot({
      url,
      file,
      reading: true,
      amountMru: null,
      amount: null,
      method: null,
      txn: null,
      date: null,
    });
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
              amountMru: r.amountMru,
              amount: r.amountMro,
              method: (r.method as Method | null) ?? null,
              txn: r.txnRef,
              date: r.date && /^\d{4}-\d{2}-\d{2}/.test(r.date) ? r.date.slice(0, 10) : null,
            },
        );
        if (r.method) {
          const c = choiceForMethod(d.wallets, r.method as Method);
          if (c) setWallet(c);
        }
        const seen = r.date && /^\d{4}-\d{2}-\d{2}/.test(r.date) ? r.date.slice(0, 10) : null;
        if (seen && seen <= todayIso()) setPaidOn(seen);
      })
      .catch(() => k === readSeq.current && setShot((s) => s && { ...s, reading: false }));
    return null;
  };
  /** the amount on the picture, in old ouguiya: read, or typed when reading failed */
  const shotAmt =
    !shot || shot.reading ? null : (shot.amount ?? (typedMru !== null ? typedMru * 10 : null));
  const removeShot = () => {
    if (!shot) return;
    readSeq.current++;
    setUndo({ shot, typedMru });
    setShot(null);
    setTypedMru(null);
  };
  const undoRemove = () => {
    if (!undo) return;
    setShot(undo.shot);
    setTypedMru(undo.typedMru);
    setCash(false);
    setUndo(null);
  };
  return {
    lines,
    total,
    shotAmt,
    typedMru,
    setTypedMru,
    why,
    setWhy,
    undo,
    setUndo,
    removeShot,
    undoRemove,
    cash,
    setCash,
    wallet,
    setWallet,
    shot,
    setShot,
    paidOn,
    setPaidOn,
    pickShot,
    addPerson,
    setMode,
    toggle,
    togglePast,
    remove,
    addLevy,
    addGift,
    setGift,
  };
}
type T = ReturnType<typeof useTransfer>;

/* ───────── the flow ───────── */
/** «دفعة أخرى» starts a new, empty payment (a new round of the form, and the URL without ?m=). */
export function RecordScreen() {
  const { q, href } = useP();
  const [round, setRound] = useState(0);
  return (
    <RecordFlow
      key={round}
      start={round ? {} : { ref: q.m, levy: q.levy, c: q.c, cash: q.cash === "1" }}
      onAgain={() => {
        if (Object.values(q).some(Boolean)) window.history.replaceState(null, "", href("record"));
        setRound((n) => n + 1);
        window.scrollTo(0, 0);
      }}
    />
  );
}

function RecordFlow({
  start,
  onAgain,
}: {
  start: Parameters<typeof useTransfer>[0];
  onAgain: () => void;
}) {
  const { d } = useP();
  const t = useTransfer(start);
  const [adding, setAdding] = useState<null | "person" | "levy" | "gift" | "outside">(null);
  const [saved, setSaved] = useState<{ id: string; text: string } | null>(null);
  const [menu, setMenu] = useState(false);
  const peopleRef = useRef<HTMLElement>(null);
  // «تراجع» after removing the picture lives 5 seconds
  const { undo, setUndo } = t;
  useEffect(() => {
    if (!undo) return;
    const id = setTimeout(() => setUndo(null), 5000);
    return () => clearTimeout(id);
  }, [undo, setUndo]);
  const first = t.lines.find((l) => l.t !== "gift") as
    Extract<Line, { t: "fees" | "levy" }> | undefined;
  const firstMember = first ? d.members.find((m) => m.ref === first.ref) : undefined;

  if (saved)
    return <Done id={saved.id} text={saved.text} onAgain={onAgain} onFix={() => setSaved(null)} />;

  return (
    <div className="pa-page r2">
      <Back to="" label="الرئيسية" />
      {/* owner: no visible title, the screen starts with «لمن هذه الدفعة؟» (kept for screen readers) */}
      <h1 className="bq-sr">سجّل دفعة</h1>
      <section className="pa-sec" ref={peopleRef}>
        <div className="pa-sec-h">
          <h2>{t.lines.length ? "هذه الدفعة عن" : "لمن هذه الدفعة؟"}</h2>
          {t.lines.length > 1 && (
            <span className="pa-hint">{peopleWords(t.lines.length)} في تحويل واحد</span>
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
              <button
                type="button"
                className="pa-btn pa-btn-soft pa-btn-block"
                onClick={() => setMenu(true)}
              >
                {X.plus(20)} أضف إلى هذه الدفعة
              </button>
            )}
          </>
        )}
      </section>
      {!!t.lines.length && (
        <HowSec
          t={t}
          onAddPerson={() => {
            setAdding("person");
            peopleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
      )}
      {t.undo && (
        <div className="pa-snack r2-toast" role="status">
          <span>حُذفت الصورة</span>
          <button type="button" onClick={t.undoRemove}>
            {X.undo(18)} تراجع
          </button>
        </div>
      )}
      {!!t.lines.length && <Foot t={t} onSaved={(id, text) => setSaved({ id, text })} />}
      <Sheet open={menu} onClose={() => setMenu(false)} title="أضف إلى هذه الدفعة">
        <ul className="pa-rows">
          {[
            {
              k: "person" as const,
              l: "شخص آخر",
              s: "مستحقات عضو آخر في نفس التحويل",
              icon: "user" as const,
              on: true,
            },
            {
              k: "levy" as const,
              l: "نصيب لوحة",
              s: "نصيب أحد الأعضاء في لوحة مفتوحة",
              icon: "list" as const,
              on: d.levies.some((l) => l.status === "open"),
            },
            {
              k: "gift" as const,
              l: "تبرع",
              s: "مساهمة في تبرع مفتوح",
              icon: "heart" as const,
              on: d.campaigns.some((c) => c.status === "open"),
            },
            {
              k: "outside" as const,
              l: "متبرع من خارج الصندوق",
              s: "شخص ليس عضوًا يساهم في تبرع",
              icon: "heart" as const,
              on: d.campaigns.some((c) => c.status === "open"),
            },
          ]
            .filter((o) => o.on)
            .map((o) => (
              <li key={o.k}>
                <button
                  type="button"
                  className="pa-row"
                  onClick={() => {
                    setMenu(false);
                    setAdding(o.k);
                  }}
                >
                  <span className="pa-ic">{X[o.icon](22)}</span>
                  <span className="pa-row-t">
                    <b>{o.l}</b>
                    <small>{o.s}</small>
                  </span>
                  {X.go(20)}
                </button>
              </li>
            ))}
        </ul>
      </Sheet>
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
          <AmountInput
            value={l.amount ? String(l.amount) : ""}
            onChange={(v) => t.setGift(l.id, { amount: amountValue(v) })}
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
  const past = payablePast(m);
  const what = [
    l.past.length ? pastWords(l.past) : "",
    l.months.length ? `${monthsWords(l.months)}${l.past.length ? ` ${d.year}` : ""}` : "",
  ]
    .filter(Boolean)
    .join("، و");
  const modes: { k: Mode; l: string }[] = [
    ...(m.owed.length || past.length ? [{ k: "late" as Mode, l: "الأشهر المتأخرة" }] : []),
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
          <small>{what ? `مستحقات ${what}` : "لم تُختر أشهر"}</small>
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
      {l.mode === "pick" && past.length > 0 && (
        <div className="r2-months" role="group" aria-label="أشهر متأخرة من سنوات سابقة">
          {past.map((key) => {
            const on = l.past.includes(key);
            const [y, mo] = key.split("-").map(Number);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                aria-label={`${MONTHS_AR[mo - 1]} ${y}`}
                className={on ? "on" : ""}
                onClick={() => t.togglePast(l.id, key)}
              >
                <span>
                  {MONTHS_AR[mo - 1]}
                  <small>
                    <Num>{y}</Num>
                  </small>
                </span>
                <b>{on ? "✓" : ""}</b>
              </button>
            );
          })}
        </div>
      )}
      {l.mode === "pick" && (
        <div className="r2-months" role="group" aria-label={`أشهر ${d.year}`}>
          {MONTHS_AR.map((name, i) => {
            const k = i + 1;
            const paid = m.paid.includes(k);
            const na = m.notOwed.includes(k) || priceOf(m, ym(d.year, k)) === null;
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
    <button type="button" className="r2-x" onClick={onClick} aria-label="أخرِجه من الدفعة">
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
        {withHim.length ? "دُفع لهم معه سابقًا:" : "من عائلته، عليهم متأخرات:"}
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
  const [recent] = useState(readRecent);
  const taken = t.lines.flatMap((l) => (l.t === "gift" || !l.ref ? [] : [l.ref]));
  const active = d.members.filter((m) => m.status === "active");
  const mine = recent.flatMap((id) => active.filter((m) => m.id === id));
  // a new phone has no recent payers: offer who owes instead of an empty screen
  // recent payers with something left to pay, else (a new phone) who owes
  const owing = mine.filter((m) => !nothingToPay(m, d));
  const start = owing.length ? owing : active.filter((m) => owes(m, d)).slice(0, 5);
  return (
    <>
      <MemberPicker
        payment
        autoFocus={autoFocus}
        exclude={taken}
        start={start}
        startHint={owing.length ? "آخر من سجّلت لهم" : "عليهم متأخرات"}
        alreadyText={(m) => `${m.name} في هذه الدفعة.`}
        onPick={(m) => {
          t.addPerson(m.ref);
          onDone();
        }}
      />
      {!!t.lines.length && (
        <button type="button" className="pa-btn pa-btn-ghost pa-btn-sm" onClick={onDone}>
          إلغاء
        </button>
      )}
    </>
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
        {outside ? "تبرع من خارج الصندوق، في أي تبرع؟" : "تبرع في أي تبرع؟"}
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

/* how it was paid: the screenshot (read here) or cash. Owner pick p2 «شريط»: one strip with the
   picture (tap = full screen), the amount read, «غيّر» and «احذف»; the check against the total in
   place under it. On a computer the picture can also be pasted (Ctrl/Cmd+V) or dropped here. */
function HowSec({ t, onAddPerson }: { t: T; onAddPerson: () => void }) {
  const [err, setErr] = useState("");
  const [viewer, setViewer] = useState(false);
  const [over, setOver] = useState(false);
  const take = async (f: File) => setErr((await t.pickShot(f)) ?? "");
  const takeRef = useRef(take);
  useEffect(() => {
    takeRef.current = take;
  });
  // paste a copied picture anywhere on the screen (not while typing in a field)
  useEffect(() => {
    const on = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea")) return;
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (!f) return;
      e.preventDefault();
      void takeRef.current(f);
    };
    window.addEventListener("paste", on);
    return () => window.removeEventListener("paste", on);
  }, []);
  const drop = {
    onDragOver: (e: DragEvent) => {
      if (![...e.dataTransfer.types].includes("Files")) return;
      e.preventDefault();
      setOver(true);
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      const f = [...e.dataTransfer.files].find((x) => x.type.startsWith("image/"));
      if (f) void take(f);
    },
  };
  const input = (
    <input
      type="file"
      accept="image/*"
      className="bq-sr"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void take(f);
      }}
    />
  );
  const shot = t.shot;
  const failed = !!shot && !shot.reading && shot.amount === null;
  const diff = t.shotAmt === null ? 0 : t.total - t.shotAmt;
  return (
    <section className={`pa-sec ${over ? "r2-over" : ""}`} {...drop}>
      <h2>كيف دفع؟</h2>
      {!shot && !t.cash ? (
        <div className="r2-how">
          <label className="r2-how-b r2-how-img">
            {X.image(26)}
            <b>أضف صورة التحويل</b>
            <small>نقرأ منها المبلغ ورقم العملية</small>
            {input}
          </label>
          <button type="button" className="r2-how-b" onClick={() => t.setCash(true)}>
            {X.cash(26)}
            <b>نقدًا</b>
            <small>استلمتها بيدك</small>
          </button>
        </div>
      ) : t.cash ? (
        <div className="r2-paid">
          <Wallet method="cash" size={32} />
          <label className="pa-btn pa-btn-ghost pa-btn-sm">
            {X.image(18)} أضف صورة التحويل بدلًا من ذلك
            {input}
          </label>
        </div>
      ) : (
        shot && (
          <>
            <div className="r2-strip">
              <button
                type="button"
                className="r2-strip-main"
                onClick={() => setViewer(true)}
                aria-label="كبّر صورة التحويل"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- local picture */}
                <img src={shot.url} alt="صورة التحويل" />
                <span className="r2-strip-t">
                  {shot.reading ? (
                    <span className="r2-skel" role="status" aria-label="نقرأ الصورة…">
                      <i />
                      <i />
                    </span>
                  ) : failed ? (
                    <>
                      <b>لم نقرأ المبلغ</b>
                      <small>اكتبه تحت</small>
                    </>
                  ) : (
                    <>
                      <b>
                        <Num>{`${fmt(shot.amountMru ?? 0)} MRU`}</Num>
                      </b>
                      <small>
                        = <Money v={shot.amount ?? 0} />
                      </small>
                    </>
                  )}
                </span>
              </button>
              <label className="r2-ib">
                {Redo}
                <small aria-hidden="true">غيّر</small>
                <span className="bq-sr">غيّر الصورة</span>
                {input}
              </label>
              <button
                type="button"
                className="r2-ib"
                onClick={t.removeShot}
                aria-label="احذف الصورة"
              >
                {X.x(22)}
                <small aria-hidden="true">احذف</small>
              </button>
            </div>
            {!shot.reading && shot.txn && (
              <small className="r2-txn">
                رقم العملية <Num>{shot.txn}</Num>
              </small>
            )}
            {failed && (
              <div className="r2-type">
                <label htmlFor="r2-typed">لم نقرأ المبلغ. اكتبه:</label>
                <span className="r2-type-row">
                  <AmountInput
                    id="r2-typed"
                    value={t.typedMru ? String(t.typedMru) : ""}
                    onChange={(v) => t.setTypedMru(amountValue(v) || null)}
                    placeholder="0"
                  />
                  <span className="pa-unit">MRU</span>
                  {!!t.typedMru && (
                    <span className="r2-type-eq">
                      = <Money v={t.typedMru * 10} />
                    </span>
                  )}
                </span>
              </div>
            )}
            {t.shotAmt !== null && diff !== 0 && (
              <div className="r2-diff" role="status">
                <p>
                  المجموع <Money v={t.total} unit={false} /> والصورة{" "}
                  <Money v={t.shotAmt} unit={false} />.{" "}
                  <b>
                    {diff < 0 ? "ينقص" : "يزيد"} <Money v={Math.abs(diff)} />
                  </b>
                </p>
                {diff < 0 && <p className="pa-hint">تحويل واحد عن عدة أشخاص؟ أضفهم.</p>}
                <div className="r2-diff-acts">
                  {diff < 0 && (
                    <button
                      type="button"
                      className="pa-btn pa-btn-soft pa-btn-sm"
                      onClick={onAddPerson}
                    >
                      {X.plus(18)} أضف شخصًا
                    </button>
                  )}
                  {t.why === null && (
                    <button
                      type="button"
                      className="pa-btn pa-btn-tonal pa-btn-sm"
                      onClick={() => t.setWhy("")}
                    >
                      {X.edit(18)} اكتب السبب
                    </button>
                  )}
                </div>
                {t.why !== null && (
                  <label className="pa-field">
                    <span>السبب (يُحفظ مع الدفعة)</span>
                    <input
                      autoFocus
                      value={t.why}
                      maxLength={200}
                      onChange={(e) => t.setWhy(e.target.value)}
                      placeholder="مثل: الباقي يُدفع نقدًا"
                    />
                  </label>
                )}
              </div>
            )}
          </>
        )
      )}
      {shot && !shot.reading && (
        <>
          <p className="pa-label">المحفظة</p>
          <WalletPicker cash={false} value={t.wallet} onChange={t.setWallet} />
        </>
      )}
      {(t.cash || (shot && !shot.reading)) && (
        <div className="pa-field">
          <span>متى دفع؟</span>
          <DateField value={t.paidOn} onChange={t.setPaidOn} label="متى دفع؟" noFuture />
        </div>
      )}
      {err && (
        <p className="pa-alert" role="alert">
          {err}
        </p>
      )}
      {viewer && shot && <Viewer url={shot.url} onClose={() => setViewer(false)} />}
    </section>
  );
}

/** The transfer picture, full screen; ✕, Escape or a tap outside closes it. */
function Viewer({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);
  return (
    <div
      className="r2-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="صورة التحويل"
      onClick={onClose}
    >
      <button type="button" className="r2-viewer-x" onClick={onClose} aria-label="أغلق" autoFocus>
        {X.x(26)}
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- local picture */}
      <img src={url} alt="صورة التحويل كاملة" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

const Redo = (
  <svg
    width={22}
    height={22}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </svg>
);

/* sticky total = the transfer; save */
function Foot({ t, onSaved }: { t: T; onSaved: (id: string, text: string) => void }) {
  const { d } = useP();
  const router = useRouter();
  const online = useOnline();
  const once = useOnceId();
  const { recordPayment, uploadProof } = useAct();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // the total differs from the picture: a short reason is needed (kept in the note)
  const shotAmt = t.shotAmt;
  const diff = shotAmt === null ? 0 : t.total - shotAmt;
  const why = t.why ?? "";
  const next = !t.lines.length
    ? "اختر العضو"
    : t.lines.some((l) => l.t === "fees" && !l.months.length && !l.past.length)
      ? "اختر الأشهر"
      : t.lines.some((l) => l.t === "gift" && !l.amount)
        ? "اكتب مبلغ التبرع"
        : !t.shot && !t.cash
          ? "كيف دفع؟"
          : t.shot?.reading
            ? "نقرأ الصورة…"
            : t.shot && shotAmt === null
              ? "اكتب المبلغ"
              : !t.cash && !walletDone(d.wallets, t.wallet)
                ? "اختر المحفظة"
                : diff !== 0 && !why.trim()
                  ? "اكتب السبب"
                  : null;

  const save = async () => {
    if (next || busy) return;
    setBusy(true);
    setErr("");
    const year = d.year;
    const byRef = new Map(d.members.map((m) => [m.ref, m]));
    const allocations = t.lines.flatMap((l): AllocationInput[] => {
      if (l.t === "fees") {
        return feeAllocations(byRef.get(l.ref)!, year, l.months, l.past);
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
          method: t.cash ? "cash" : t.wallet!.method,
          ...(t.cash || !t.wallet
            ? {}
            : {
                walletTypeId: t.wallet.walletTypeId,
                ...(t.wallet.fundAccountId ? { fundAccountId: t.wallet.fundAccountId } : {}),
              }),
          amount: t.total,
          paidOn: t.paidOn || todayIso(),
          allocations,
          txnRef: t.cash ? undefined : (t.shot?.txn ?? undefined),
          proofPath: proof?.path,
          proofHash: proof?.hash,
          note: diff !== 0 && why.trim() ? `يختلف عن الصورة: ${why.trim()}` : undefined,
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
    // everyone this payment counts for, so the volunteer can check at a glance
    const names = [
      ...new Set(
        t.lines.map((l) =>
          l.t === "gift" && !l.ref ? l.name.trim() || "فاعل خير" : byRef.get(l.ref as string)!.name,
        ),
      ),
    ];
    onSaved(r.data.id, `${joinAnd(names)} · ${fmt(t.total)} أوقية`);
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
        {shotAmt !== null &&
          (diff === 0 ? (
            <span className="r2-chip ok" role="status">
              {X.check(14)} مطابق للصورة
            </span>
          ) : (
            <span className="r2-chip" role="status">
              {diff < 0 ? "أقل من الصورة بـ" : "أكثر من الصورة بـ"} <Num>{fmt(Math.abs(diff))}</Num>
            </span>
          ))}
      </div>
      {err && (
        <p className="pa-alert" role="alert">
          {err}
        </p>
      )}
      {!online && (
        <p className="pa-hint" role="status">
          لا يوجد اتصال. سجّل عند عودة الإنترنت، ما كتبته باقٍ.
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
function Done({
  id,
  text,
  onAgain,
  onFix,
}: {
  id: string;
  text: string;
  onAgain: () => void;
  /** after «تراجع»: back to the same form, still filled */
  onFix: () => void;
}) {
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
  if (undone)
    return (
      <div className="pa-page r2">
        <div role="status">
          <h1 className="r2-done-h">أُلغيت الدفعة، لم تُحسب.</h1>
        </div>
        <p className="pa-lead">{text}</p>
        <button
          type="button"
          className="pa-btn pa-btn-primary pa-btn-lg pa-btn-block"
          onClick={onFix}
        >
          صحّحها وسجّل من جديد
        </button>
        <Link href={href("")} className="pa-btn pa-btn-ghost pa-btn-block">
          إلى الرئيسية
        </Link>
      </div>
    );
  return (
    <div className="pa-page r2">
      <div role="status">
        <h1 className="r2-done">{X.check(22)} سُجّلت الدفعة</h1>
      </div>
      <p className="pa-lead">{text}</p>
      {left > 0 && (
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
      <button
        type="button"
        className="pa-btn pa-btn-primary pa-btn-lg pa-btn-block"
        onClick={onAgain}
      >
        {X.plus(20)} دفعة أخرى
      </button>
      <Link href={href("")} className="pa-btn pa-btn-ghost pa-btn-block">
        إلى الرئيسية
      </Link>
    </div>
  );
}
