"use client";
// «المحافظ» (m41) inside الإعدادات, owner layout: each wallet is ONE row (logo, name, its number
// and holder, «الرصيد الآن» when the server has one). Tapping «عدّل» opens ONE sheet: the name and
// logo, the number and holder (added here when the wallet has none), an optional non-zero opening
// (collapsed, once), and «أوقف المحفظة». Stopped wallets sit in a collapsed list. «المسؤول» only.
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { compressImage, dataUrlToBlob } from "@/lib/compress-image";
import type { FundAccountAdmin, WalletType } from "@/lib/data/types";
import { useAct } from "./act";
import { MESSAGES } from "@/lib/data/errors";
import { todayIso } from "@/lib/dates";
import { AmountInput, amountValue } from "./amount-input";
import { DateField } from "./date-field";
import { fmt } from "./derive";
import { I } from "./icons";
import { Num } from "./num";
import { Sheet } from "./sheet";
import { useSnack } from "./shell";
import { walletLogo } from "./wallet-logo";

type Res = { ok: true; data?: unknown } | { ok: false; message: string };
/** Server balances from the wallets report: by account id, and cash. */
export type WalletBalances = { accounts: Record<string, number>; cash: number | null };

export function WalletsSection({
  types,
  accounts,
  balances,
  admin,
}: {
  types: WalletType[];
  accounts: FundAccountAdmin[];
  balances: WalletBalances;
  admin: boolean;
}) {
  const router = useRouter();
  const say = useSnack();
  const act = useAct();
  // shown at once after a save (the demo simulates writes, so the server lists do not change)
  const [ws, setWs] = useState(() => [...types].sort((a, b) => a.sortOrder - b.sortOrder));
  const [accs, setAccs] = useState(accounts);
  const [sheet, setSheet] = useState<{ w?: WalletType } | null>(null);
  // «حوّل»: money from one wallet (or cash) to another; any committee member
  const [move, setMove] = useState<WalletType | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async (fn: () => Promise<Res>, done: (data: unknown) => void) => {
    setBusy(true);
    setErr("");
    let r: Res;
    try {
      r = await fn();
    } catch {
      r = { ok: false, message: "تعذّر الاتصال. تحقّق من الإنترنت وحاول مرة أخرى." };
    }
    setBusy(false);
    if (!r.ok) {
      setErr(r.message);
      return false;
    }
    done(r.data);
    router.refresh();
    return true;
  };

  const live = ws.filter((w) => w.kind === "wallet" && w.active);
  const accsOfId = (id: number) => accs.filter((a) => a.walletTypeId === id && a.active);
  // the list shows the wallets with a number; the others wait in a collapsed list
  const withNumber = live.filter((w) => accsOfId(w.id).length > 0);
  const noNumber = live.filter((w) => accsOfId(w.id).length === 0);
  const stopped = ws.filter((w) => w.kind === "wallet" && !w.active);
  const cash = ws.find((w) => w.kind === "cash");
  const accsOf = (w: WalletType) => accs.filter((a) => a.walletTypeId === w.id && a.active);
  /** the wallet's balance: the sum over its accounts, when the server gives one */
  const balanceOf = (w: WalletType) => {
    const xs = accsOf(w).flatMap((a) =>
      balances.accounts[a.id] !== undefined ? [balances.accounts[a.id]] : [],
    );
    return xs.length ? xs.reduce((s, x) => s + x, 0) : undefined;
  };

  const setWalletActive = (w: WalletType, on: boolean) =>
    run(
      () => act.setWalletTypeActive({ id: w.id, active: on }),
      () => {
        setWs((l) => l.map((x) => (x.id === w.id ? { ...x, active: on } : x)));
        say(on ? `عادت المحفظة ${w.name}.` : `أُوقفت المحفظة ${w.name}.`);
      },
    );

  return (
    <section className="bq-sec bq-sec-first" aria-labelledby="bq-wallets-h">
      <h2 id="bq-wallets-h">المحافظ</h2>
      <p className="bq-lead">
        {admin
          ? "المحافظ التي تختارها اللجنة عند تسجيل دفعة أو مصروف."
          : "المحافظ التي تختارها اللجنة عند تسجيل دفعة أو مصروف. يغيّرها المسؤول فقط."}
      </p>
      <ul className="bq-list bq-wallets">
        {withNumber.map((w) => {
          const a = accsOf(w);
          const bal = balanceOf(w);
          return (
            <li key={w.id} className="bq-group-row bq-wallet">
              <Logo w={w} />
              <span className="bq-row-m">
                <span className="bq-row-t">{w.name}</span>
                {a.length ? (
                  a.map((x) => (
                    <span key={x.id} className="bq-row-s">
                      <bdi dir="ltr" className="bq-num">
                        {x.accountNumber}
                      </bdi>{" "}
                      · {x.holderName}
                    </span>
                  ))
                ) : (
                  <span className="bq-row-s">لا رقم بعد</span>
                )}
                {bal !== undefined && (
                  <span className="bq-row-s">
                    الرصيد الآن: <Num>{fmt(bal)}</Num> أوقية
                  </span>
                )}
              </span>
              <span className="bq-group-acts">
                <button
                  type="button"
                  className="bq-btn bq-btn-tonal bq-press"
                  aria-label={`حوّل من ${w.name}`}
                  onClick={() => setMove(w)}
                >
                  حوّل
                </button>
                {admin && (
                  <button
                    type="button"
                    className="bq-btn bq-btn-soft bq-press"
                    aria-label={`عدّل ${w.name}`}
                    onClick={() => setSheet({ w })}
                  >
                    عدّل
                  </button>
                )}
              </span>
            </li>
          );
        })}
        {cash && (
          <li className="bq-group-row bq-wallet">
            <span className="bq-wallet-logo" aria-hidden="true">
              {I.cash(22)}
            </span>
            <span className="bq-row-m">
              <span className="bq-row-t">نقدًا (في يد اللجنة)</span>
              {balances.cash !== null && (
                <span className="bq-row-s">
                  الرصيد الآن: <Num>{fmt(balances.cash)}</Num> أوقية
                </span>
              )}
            </span>
            <span className="bq-group-acts">
              <button
                type="button"
                className="bq-btn bq-btn-tonal bq-press"
                aria-label="حوّل من النقد"
                onClick={() => setMove(cash)}
              >
                حوّل
              </button>
              {admin && !cash.opening && (
                <button
                  type="button"
                  className="bq-btn bq-btn-soft bq-press"
                  aria-label="عدّل نقدًا"
                  onClick={() => setSheet({ w: cash })}
                >
                  عدّل
                </button>
              )}
            </span>
          </li>
        )}
      </ul>
      {admin && (
        <button type="button" className="bq-btn bq-btn-soft bq-press" onClick={() => setSheet({})}>
          {I.plus(18)} محفظة جديدة
        </button>
      )}
      {noNumber.length > 0 && (
        <details className="bq-more">
          <summary>محافظ بلا رقم ({noNumber.length})</summary>
          <ul className="bq-list">
            {noNumber.map((w) => (
              <li key={w.id} className="bq-group-row bq-wallet">
                <Logo w={w} />
                <span className="bq-row-m">
                  <span className="bq-row-t">{w.name}</span>
                </span>
                {admin && (
                  <button
                    type="button"
                    className="bq-btn bq-btn-soft bq-press"
                    aria-label={`عدّل ${w.name}`}
                    onClick={() => setSheet({ w })}
                  >
                    عدّل
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {stopped.length > 0 && (
        <details className="bq-more">
          <summary>محافظ متوقفة ({stopped.length})</summary>
          <ul className="bq-list">
            {stopped.map((w) => (
              <li key={w.id} className="bq-group-row is-off">
                <Logo w={w} />
                <span className="bq-row-m">
                  <span className="bq-row-t">{w.name}</span>
                </span>
                {admin && (
                  <button
                    type="button"
                    className="bq-btn bq-btn-soft bq-press"
                    aria-label={`أعِد ${w.name}`}
                    disabled={busy}
                    onClick={() => void setWalletActive(w, true)}
                  >
                    أعِدها
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {err && !sheet && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
      {admin && <OfflineWriteHint />}

      {move && (
        <Sheet label="حوّل مالًا" onDone={() => setMove(null)}>
          <MoveSheet
            from={move}
            wallets={withNumber}
            cash={cash}
            accountOf={(w) => (w.kind === "cash" ? null : (accsOf(w)[0]?.id ?? null))}
            balanceOf={(w) => (w.kind === "cash" ? (balances.cash ?? undefined) : balanceOf(w))}
            onDone={(text) => {
              setMove(null);
              say(text);
              router.refresh();
            }}
          />
        </Sheet>
      )}
      {sheet && (
        <Sheet
          label={sheet.w ? (sheet.w.kind === "cash" ? "النقد" : "عدّل المحفظة") : "محفظة جديدة"}
          onDone={() => {
            setSheet(null);
            setErr("");
          }}
        >
          {sheet.w?.kind === "cash" ? (
            <CashSheet
              busy={busy}
              err={err}
              onOpening={(amount, on) =>
                run(
                  () => act.setCashOpening({ amount, on }),
                  () => {
                    setWs((l) =>
                      l.map((x) => (x.kind === "cash" ? { ...x, opening: { amount, on } } : x)),
                    );
                    setSheet(null);
                    say("حُفظ رصيد أول النقد.");
                  },
                )
              }
            />
          ) : (
            <WalletSheet
              w={sheet.w}
              account={sheet.w ? accsOf(sheet.w)[0] : undefined}
              busy={busy}
              err={err}
              onSave={async ({ name, logoPath, number, holder, mode }) => {
                const w = sheet.w;
                let id = w?.id;
                if (!w || name !== w.name || logoPath !== (w.logoPath ?? undefined)) {
                  const ok = await run(
                    () =>
                      w
                        ? act.updateWalletType({ id: w.id, name, logoPath })
                        : act.addWalletType({ name, logoPath }),
                    (d) => {
                      if (w)
                        setWs((l) =>
                          l.map((x) =>
                            x.id === w.id ? { ...x, name, logoPath: logoPath ?? null } : x,
                          ),
                        );
                      else {
                        id = Number(d);
                        setWs((l) => [
                          ...l,
                          {
                            id: Number(d),
                            name,
                            logoPath: logoPath ?? null,
                            kind: "wallet",
                            sortOrder: 98,
                            active: true,
                            legacyMethod: null,
                            opening: null,
                          },
                        ]);
                      }
                    },
                  );
                  if (!ok) return;
                }
                const cur = w ? accsOf(w)[0] : undefined;
                if (number && cur) {
                  const ok = await run(
                    () =>
                      mode === "correct"
                        ? act.correctWalletAccount({
                            id: cur.id,
                            accountNumber: number,
                            holderName: holder,
                          })
                        : act.replaceWalletAccount({
                            walletTypeId: cur.walletTypeId!,
                            accountNumber: number,
                            holderName: holder,
                          }),
                    (d) =>
                      setAccs((l) =>
                        mode === "correct"
                          ? l.map((x) =>
                              x.id === cur.id
                                ? { ...x, accountNumber: number, holderName: holder }
                                : x,
                            )
                          : [
                              ...l.map((x) => (x.id === cur.id ? { ...x, active: false } : x)),
                              {
                                ...cur,
                                id: String(d),
                                accountNumber: number,
                                holderName: holder,
                                opening: null,
                              },
                            ],
                      ),
                  );
                  if (!ok) return;
                } else if (number && id !== undefined) {
                  const typeId = id;
                  const ok = await run(
                    () =>
                      act.addWalletAccount({
                        walletTypeId: typeId,
                        accountNumber: number,
                        holderName: holder,
                      }),
                    (d) =>
                      setAccs((l) => [
                        ...l,
                        {
                          id: String(d),
                          method: "other",
                          accountNumber: number,
                          holderName: holder,
                          sortOrder: l.length,
                          active: true,
                          note: null,
                          walletTypeId: typeId,
                          opening: null,
                        },
                      ]),
                  );
                  if (!ok) return;
                }
                setSheet(null);
                say(w ? "حُفظت المحفظة." : `أُضيفت المحفظة ${name}.`);
              }}
              onOpening={(a, amount, on) =>
                run(
                  () => act.setFundAccountOpening({ id: a.id, amount, on }),
                  () => {
                    setAccs((l) =>
                      l.map((x) => (x.id === a.id ? { ...x, opening: { amount, on } } : x)),
                    );
                    setSheet(null);
                    say("حُفظ رصيد أول المحفظة.");
                  },
                )
              }
              onStop={
                sheet.w
                  ? async () => {
                      if (await setWalletActive(sheet.w!, false)) setSheet(null);
                    }
                  : undefined
              }
            />
          )}
        </Sheet>
      )}
    </section>
  );
}

function Logo({ w }: { w: WalletType }) {
  const src = walletLogo(w);
  return (
    <span className="bq-wallet-logo">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded logo, any host
        <img src={src} alt="" width={32} height={32} />
      ) : (
        <b aria-hidden="true">{w.name.slice(0, 1)}</b>
      )}
    </span>
  );
}

function Foot({
  err,
  busy,
  ok,
  save,
  onSave,
}: {
  err: string;
  busy: boolean;
  ok: boolean;
  save: string;
  onSave: () => void;
}) {
  const online = useOnline();
  return (
    <div className="bq-rec-foot">
      {err && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
      <button
        type="button"
        className="bq-btn bq-btn-primary bq-btn-lg bq-press"
        disabled={!ok || busy || !online}
        onClick={onSave}
      >
        {busy ? "جارٍ الحفظ…" : save}
      </button>
      <OfflineWriteHint />
    </div>
  );
}

/** «رصيد أول غير صفر»: collapsed; a wallet starts at 0 unless it had money on a day. Once only. */
function Opening({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (amount: number, on: string) => void;
}): ReactNode {
  const [amt, setAmt] = useState("");
  const [on, setOn] = useState(`${new Date().getFullYear()}-01-01`);
  const [sure, setSure] = useState(false);
  return (
    <details className="bq-more bq-small-top">
      <summary>رصيد أول غير صفر (اختياري)</summary>
      <p className="bq-hint">
        تبدأ المحفظة من صفر. إن كان فيها مال في يوم ما، اكتبه هنا مرة واحدة.
      </p>
      <p className="bq-rec-k">المبلغ بالأوقية القديمة</p>
      <AmountInput
        className="bq-input"
        value={amt}
        onChange={setAmt}
        aria-label="رصيد أول بالأوقية"
        placeholder="0"
      />
      <p className="bq-rec-k">في يوم</p>
      <DateField value={on} onChange={setOn} label="تاريخ الرصيد" noFuture />
      <label className="bq-check bq-small-top">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        <span>يُحفظ مرة واحدة ولا يتغيّر بعد ذلك. تأكدت من المبلغ.</span>
      </label>
      <button
        type="button"
        className="bq-btn bq-btn-tonal bq-press bq-small-top"
        disabled={busy || !amt.trim() || !on || !sure}
        onClick={() => onSave(amountValue(amt), on)}
      >
        احفظ الرصيد
      </button>
    </details>
  );
}

/** One wallet, everything in one place (a new wallet: name, logo, number). */
function WalletSheet({
  w,
  account,
  busy,
  err,
  onSave,
  onOpening,
  onStop,
}: {
  w?: WalletType;
  account?: FundAccountAdmin;
  busy: boolean;
  err: string;
  onSave: (v: {
    name: string;
    logoPath?: string;
    number: string;
    holder: string;
    /** an existing number: a new one (the old stays in history), or a typo fix */
    mode: "replace" | "correct";
  }) => Promise<void>;
  onOpening: (a: FundAccountAdmin, amount: number, on: string) => void;
  onStop?: () => void;
}) {
  const { uploadWalletLogo } = useAct();
  const [name, setName] = useState(w?.name ?? "");
  // a new picture (data URL), "" = remove the logo, null = keep it
  const [pic, setPic] = useState<string | null>(null);
  const [num, setNum] = useState("");
  const [holder, setHolder] = useState(account?.holderName ?? "");
  // an existing number: «غيّر الرقم» opens the fields
  const [renum, setRenum] = useState(false);
  const [pickMode, setPickMode] = useState<"replace" | "correct">("replace");
  // the server refused a typo fix (the number was used): only a new number is possible
  const inUse = err === MESSAGES.account_in_use;
  const mode = inUse ? "replace" : pickMode;
  const [upErr, setUpErr] = useState("");
  const [upBusy, setUpBusy] = useState(false);
  const [stopping, setStopping] = useState(false);
  const shown = pic === null ? (w ? walletLogo(w) : null) : pic || null;
  const clean = num.replace(/[\s-]/g, "");
  const numOk = !clean || (/^[0-9A-Za-z+]{4,30}$/.test(clean) && !!holder.trim());
  const changed = !w || name.trim() !== w.name || pic !== null || !!clean;
  return (
    <div className="bq-rec">
      <h2>{w ? w.name : "محفظة جديدة"}</h2>
      <p className="bq-rec-k">الاسم</p>
      <input
        className="bq-input"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        aria-label="اسم المحفظة"
        placeholder="مثل: بنكيلي"
      />
      {account && !renum ? (
        <>
          <p className="bq-rec-k">الرقم</p>
          <div className="bq-field">
            <p className="bq-mline bq-grow-1">
              <bdi dir="ltr" className="bq-num">
                {account.accountNumber}
              </bdi>{" "}
              · {account.holderName}
            </p>
            <button
              type="button"
              className="bq-btn bq-btn-soft bq-press"
              onClick={() => setRenum(true)}
            >
              غيّر الرقم
            </button>
          </div>
        </>
      ) : account ? (
        <>
          <p className="bq-rec-k">
            الرقم الجديد (كان <bdi dir="ltr">{account.accountNumber}</bdi>)
          </p>
          <input
            className="bq-input"
            value={num}
            onChange={(e) => setNum(e.target.value)}
            inputMode="tel"
            dir="ltr"
            aria-label="رقم الحساب"
            autoFocus
          />
          <p className="bq-rec-k">اسم صاحب الحساب</p>
          <input
            className="bq-input"
            value={holder}
            maxLength={120}
            onChange={(e) => setHolder(e.target.value)}
            aria-label="اسم صاحب الحساب"
          />
          <div className="bq-chips bq-small-top" role="radiogroup" aria-label="نوع التغيير">
            <button
              type="button"
              role="radio"
              aria-checked={mode === "replace"}
              className="bq-chip bq-press"
              onClick={() => setPickMode("replace")}
            >
              رقم جديد
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === "correct"}
              className="bq-chip bq-press"
              disabled={inUse}
              onClick={() => setPickMode("correct")}
            >
              خطأ في كتابة الرقم
            </button>
          </div>
          <p className="bq-hint">
            {mode === "replace"
              ? "يتوقف الرقم القديم، وتبقى دفعاته في السجل."
              : "يُصحَّح الرقم نفسه، فقط إن لم تُسجَّل عليه دفعات أو مصاريف."}
          </p>
        </>
      ) : (
        <>
          <p className="bq-rec-k">الرقم</p>
          <input
            className="bq-input"
            value={num}
            onChange={(e) => setNum(e.target.value)}
            inputMode="tel"
            dir="ltr"
            aria-label="رقم الحساب"
          />
          <p className="bq-rec-k">اسم صاحب الحساب</p>
          <input
            className="bq-input"
            value={holder}
            maxLength={120}
            onChange={(e) => setHolder(e.target.value)}
            aria-label="اسم صاحب الحساب"
            placeholder="مثل: رابطة شباب البقيع"
          />
        </>
      )}
      <p className="bq-rec-k">الشعار (اختياري)</p>
      <div className="bq-field">
        <span className="bq-wallet-logo bq-wallet-logo-lg">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview
            <img src={shown} alt="الشعار" width={48} height={48} />
          ) : (
            <b aria-hidden="true">{name.slice(0, 1)}</b>
          )}
        </span>
        <label className="bq-btn bq-btn-soft bq-press">
          {shown ? "غيّر الشعار" : "أضف شعارًا"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="bq-sr"
            aria-label="صورة الشعار"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                setPic(await compressImage(f, 150_000));
                setUpErr("");
              } catch {
                setUpErr("تعذّر فتح الصورة. اختر صورة PNG أو JPEG.");
              }
            }}
          />
        </label>
        {shown && (
          <button type="button" className="bq-btn bq-btn-ghost bq-press" onClick={() => setPic("")}>
            احذف الشعار
          </button>
        )}
      </div>
      {account && !account.opening && (
        <Opening busy={busy} onSave={(amount, on) => onOpening(account, amount, on)} />
      )}
      {onStop && (
        <div className="bq-small-top">
          {stopping && (
            <p className="bq-hint" role="status">
              لن تظهر عند تسجيل دفعة أو مصروف. دفعاتها السابقة تبقى كما هي.
            </p>
          )}
          <button
            type="button"
            className="bq-btn bq-btn-ghost bq-press"
            disabled={busy}
            onClick={() => (stopping ? onStop() : setStopping(true))}
          >
            {stopping ? "نعم، أوقفها" : "أوقف المحفظة"}
          </button>
        </div>
      )}
      <Foot
        err={upErr || err}
        busy={busy || upBusy}
        ok={!!name.trim() && numOk && changed}
        save={w ? "احفظ" : "أضف المحفظة"}
        onSave={async () => {
          let logoPath = pic === null ? (w?.logoPath ?? undefined) : undefined;
          if (pic) {
            setUpBusy(true);
            setUpErr("");
            const fd = new FormData();
            fd.set("file", dataUrlToBlob(pic), "logo.jpg");
            const r = await uploadWalletLogo(fd);
            setUpBusy(false);
            if (!r.ok) return setUpErr(r.message);
            logoPath = r.data.path;
          }
          await onSave({ name: name.trim(), logoPath, number: clean, holder: holder.trim(), mode });
        }}
      />
    </div>
  );
}

/** Cash in hand: only its non-zero opening, once. */
function CashSheet({
  busy,
  err,
  onOpening,
}: {
  busy: boolean;
  err: string;
  onOpening: (amount: number, on: string) => void;
}) {
  return (
    <div className="bq-rec">
      <h2>النقد في يد اللجنة</h2>
      <Opening busy={busy} onSave={onOpening} />
      {err && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

/**
 * «حوّل»: money moved between wallets or cash (e.g. everything to cash before a handover). Not
 * income, not spending, the fund balance stays. The server refuses more than the wallet holds.
 */
function MoveSheet({
  from: start,
  wallets,
  cash,
  accountOf,
  balanceOf,
  onDone,
}: {
  from: WalletType;
  wallets: WalletType[];
  cash?: WalletType;
  accountOf: (w: WalletType) => string | null;
  balanceOf: (w: WalletType) => number | undefined;
  onDone: (text: string) => void;
}) {
  const { recordWalletTransfer } = useAct();
  const all = [...wallets, ...(cash ? [cash] : [])];
  const [id] = useState(() => crypto.randomUUID());
  const [from, setFrom] = useState(start.id);
  const [to, setTo] = useState(
    () =>
      (start.kind === "cash" ? wallets[0]?.id : cash?.id) ?? all.find((w) => w.id !== start.id)?.id,
  );
  const [amt, setAmt] = useState("");
  const [on, setOn] = useState(todayIso);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const f = all.find((w) => w.id === from)!;
  const t = all.find((w) => w.id === to);
  const amount = amountValue(amt);
  const bal = balanceOf(f);
  const chips = (
    value: number | undefined,
    set: (id: number) => void,
    label: string,
    skip?: number,
  ) => (
    <div className="bq-chips" role="radiogroup" aria-label={label}>
      {all
        .filter((w) => w.id !== skip)
        .map((w) => (
          <button
            key={w.id}
            type="button"
            role="radio"
            aria-checked={value === w.id}
            className="bq-chip bq-press"
            onClick={() => set(w.id)}
          >
            {w.name}
          </button>
        ))}
    </div>
  );
  return (
    <div className="bq-rec">
      <h2>حوّل مالًا</h2>
      <p className="bq-hint">لا يدخل في المداخيل ولا المصاريف، ورصيد الصندوق لا يتغيّر.</p>
      <p className="bq-rec-k">من</p>
      {chips(
        from,
        (x) => {
          setFrom(x);
          if (x === to) setTo(all.find((w) => w.id !== x)?.id);
        },
        "من",
      )}
      {bal !== undefined && (
        <p className="bq-hint">
          فيها الآن <Num>{fmt(bal)}</Num> أوقية
        </p>
      )}
      <p className="bq-rec-k">إلى</p>
      {chips(to, setTo, "إلى", from)}
      <p className="bq-rec-k">المبلغ بالأوقية القديمة</p>
      <AmountInput
        className="bq-input"
        value={amt}
        onChange={setAmt}
        aria-label="المبلغ"
        placeholder="0"
      />
      <p className="bq-rec-k">متى؟</p>
      <DateField value={on} onChange={setOn} label="تاريخ التحويل" noFuture />
      <p className="bq-rec-k">ملاحظة (اختياري)</p>
      <input
        className="bq-input"
        value={note}
        maxLength={500}
        onChange={(e) => setNote(e.target.value)}
        aria-label="ملاحظة"
        placeholder="مثل: سحب قبل التسليم"
      />
      <Foot
        err={err}
        busy={busy}
        ok={!!t && amount > 0 && !!on}
        save={t && amount ? `حوّل ${fmt(amount)} أوقية إلى ${t.name}` : "حوّل"}
        onSave={async () => {
          if (!t) return;
          setBusy(true);
          setErr("");
          let r;
          try {
            r = await recordWalletTransfer({
              id,
              fromAccountId: accountOf(f),
              toAccountId: accountOf(t),
              amount,
              movedOn: on,
              note: note.trim() || undefined,
            });
          } catch {
            r = { ok: false as const, message: "تعذّر الاتصال. تحقّق من الإنترنت وحاول مرة أخرى." };
          }
          setBusy(false);
          if (!r.ok) return setErr(r.message);
          onDone(`حُوّل ${fmt(amount)} أوقية من ${f.name} إلى ${t.name}.`);
        }}
      />
    </div>
  );
}
