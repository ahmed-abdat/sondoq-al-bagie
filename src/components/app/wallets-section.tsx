"use client";
// «المحافظ» (m41) inside الإعدادات: each wallet with its logo and accounts, and «نقدًا».
// «المسؤول»: a new wallet (name + logo), rename / change the logo, stop or bring back a wallet;
// add an account, stop or bring back an account; the opening balance of an account and of cash,
// set ONCE. A balance shows only once its opening is set (the server's «المبالغ حسب المحفظة»).
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { compressImage, dataUrlToBlob } from "@/lib/compress-image";
import type { FundAccountAdmin, WalletType } from "@/lib/data/types";
import { useAct } from "./act";
import { AmountInput, amountValue } from "./amount-input";
import { DateField } from "./date-field";
import { dayDate, fmt } from "./derive";
import { I } from "./icons";
import { Num } from "./num";
import { Sheet } from "./sheet";
import { useSnack } from "./shell";
import { walletLogo } from "./wallet-logo";

type Res = { ok: true; data?: unknown } | { ok: false; message: string };
/** Server balances from the wallets report: by account id, and cash. */
export type WalletBalances = { accounts: Record<string, number>; cash: number | null };

type SheetKind =
  | { t: "newWallet" }
  | { t: "editWallet"; w: WalletType }
  | { t: "account"; w: WalletType }
  | { t: "opening"; a: FundAccountAdmin; w: WalletType }
  | { t: "cashOpening" };

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
  const online = useOnline();
  const say = useSnack();
  const act = useAct();
  // shown at once after a save (the demo simulates writes, so the server lists do not change)
  const [ws, setWs] = useState(() => [...types].sort((a, b) => a.sortOrder - b.sortOrder));
  const [accs, setAccs] = useState(accounts);
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
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
  const stopped = ws.filter((w) => w.kind === "wallet" && !w.active);
  const cash = ws.find((w) => w.kind === "cash");
  const accsOf = (w: WalletType) => accs.filter((a) => a.walletTypeId === w.id);

  const setWalletActive = (w: WalletType, on: boolean) =>
    run(
      () => act.setWalletTypeActive({ id: w.id, active: on }),
      () => {
        setWs((l) => l.map((x) => (x.id === w.id ? { ...x, active: on } : x)));
        setConfirm(null);
        say(on ? `عادت المحفظة ${w.name}.` : `أُوقفت المحفظة ${w.name}.`);
      },
    );
  const setAccountActive = (a: FundAccountAdmin, on: boolean) =>
    run(
      () =>
        act.updateFundAccount({
          id: a.id,
          holderName: a.holderName,
          note: a.note,
          sortOrder: a.sortOrder,
          active: on,
        }),
      () => {
        setAccs((l) => l.map((x) => (x.id === a.id ? { ...x, active: on } : x)));
        setConfirm(null);
        say(on ? "عاد الحساب." : "أُوقف الحساب.");
      },
    );

  const opening = (o: { amount: number; on: string } | null | undefined, balance?: number) =>
    o ? (
      <span className="bq-row-s">
        رصيد أول: <Num>{fmt(o.amount)}</Num> أوقية ({dayDate(o.on)})
        {balance !== undefined && (
          <>
            {" · "}
            <b>
              الرصيد الآن: <Num>{fmt(balance)}</Num> أوقية
            </b>
          </>
        )}
      </span>
    ) : (
      <span className="bq-row-s">لم يُحدَّد رصيد أولها بعد، فلا يظهر رصيدها.</span>
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
        {live.map((w) => (
          <li key={w.id} className="bq-wallet">
            <div className="bq-group-row">
              <Logo w={w} />
              <span className="bq-row-m">
                <span className="bq-row-t">{w.name}</span>
              </span>
              {admin && (
                <button
                  type="button"
                  className="bq-btn bq-btn-soft bq-press"
                  aria-label={`عدّل ${w.name}`}
                  onClick={() => setSheet({ t: "editWallet", w })}
                >
                  عدّل
                </button>
              )}
            </div>
            <ul className="bq-accs">
              {accsOf(w).map((a) => (
                <li key={a.id} className={`bq-group-row ${a.active ? "" : "is-off"}`}>
                  <span className="bq-row-m">
                    <bdi dir="ltr" className="bq-num bq-row-t">
                      {a.accountNumber}
                    </bdi>
                    <span className="bq-row-s">{a.holderName}</span>
                    {a.active && opening(a.opening, balances.accounts[a.id])}
                    {!a.active && <span className="bq-row-s">متوقف</span>}
                  </span>
                  {admin && (
                    <span className="bq-group-acts">
                      {a.active && !a.opening && (
                        <button
                          type="button"
                          className="bq-btn bq-btn-soft bq-press"
                          onClick={() => setSheet({ t: "opening", a, w })}
                        >
                          حدّد رصيد أولها
                        </button>
                      )}
                      {a.active ? (
                        <button
                          type="button"
                          className="bq-btn bq-btn-ghost bq-press"
                          aria-label={
                            confirm === a.id
                              ? `نعم، أوقف الحساب ${a.accountNumber}`
                              : `أوقف الحساب ${a.accountNumber}`
                          }
                          disabled={busy || !online}
                          onClick={() =>
                            confirm === a.id ? void setAccountActive(a, false) : setConfirm(a.id)
                          }
                        >
                          {confirm === a.id ? "نعم، أوقفه" : "أوقف الحساب"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="bq-btn bq-btn-soft bq-press"
                          disabled={busy || !online}
                          onClick={() => void setAccountActive(a, true)}
                        >
                          أعِده
                        </button>
                      )}
                    </span>
                  )}
                </li>
              ))}
              {admin && (
                <li>
                  <button
                    type="button"
                    className="bq-link bq-press"
                    onClick={() => setSheet({ t: "account", w })}
                  >
                    {I.plus(18)} أضف حسابًا في {w.name}
                  </button>
                </li>
              )}
            </ul>
          </li>
        ))}
        {cash && (
          <li className="bq-wallet">
            <div className="bq-group-row">
              <span className="bq-wallet-logo" aria-hidden="true">
                {I.cash(22)}
              </span>
              <span className="bq-row-m">
                <span className="bq-row-t">نقدًا (في يد اللجنة)</span>
                {opening(cash.opening, balances.cash ?? undefined)}
              </span>
              {admin && !cash.opening && (
                <button
                  type="button"
                  className="bq-btn bq-btn-soft bq-press"
                  onClick={() => setSheet({ t: "cashOpening" })}
                >
                  حدّد رصيد أوله
                </button>
              )}
            </div>
          </li>
        )}
      </ul>
      {admin && (
        <button
          type="button"
          className="bq-btn bq-btn-soft bq-press"
          onClick={() => setSheet({ t: "newWallet" })}
        >
          {I.plus(18)} محفظة جديدة
        </button>
      )}
      {stopped.length > 0 && (
        <>
          <h3 className="bq-h3">محافظ متوقفة</h3>
          <p className="bq-hint">لا تظهر عند تسجيل دفعة أو مصروف.</p>
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
                    disabled={busy || !online}
                    onClick={() => void setWalletActive(w, true)}
                  >
                    أعِدها
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {err && !sheet && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
      {admin && <OfflineWriteHint />}

      {sheet && (
        <Sheet
          key={sheet.t}
          label={TITLE[sheet.t]}
          onDone={() => {
            setSheet(null);
            setErr("");
          }}
        >
          {sheet.t === "newWallet" || sheet.t === "editWallet" ? (
            <WalletForm
              w={sheet.t === "editWallet" ? sheet.w : undefined}
              busy={busy}
              err={err}
              onStop={
                sheet.t === "editWallet"
                  ? async () => {
                      if (await setWalletActive(sheet.w, false)) setSheet(null);
                    }
                  : undefined
              }
              onSave={(name, logoPath) =>
                sheet.t === "editWallet"
                  ? run(
                      () => act.updateWalletType({ id: sheet.w.id, name, logoPath }),
                      () => {
                        setWs((l) =>
                          l.map((x) =>
                            x.id === sheet.w.id ? { ...x, name, logoPath: logoPath ?? null } : x,
                          ),
                        );
                        setSheet(null);
                        say("حُفظت المحفظة.");
                      },
                    )
                  : run(
                      () => act.addWalletType({ name, logoPath }),
                      (id) => {
                        setWs((l) => {
                          const row: WalletType = {
                            id: Number(id),
                            name,
                            logoPath: logoPath ?? null,
                            kind: "wallet",
                            sortOrder: 98,
                            active: true,
                            legacyMethod: null,
                            opening: null,
                          };
                          return [...l, row].sort((a, b) => a.sortOrder - b.sortOrder);
                        });
                        setSheet(null);
                        say(`أُضيفت المحفظة ${name}. أضف رقم حسابها.`);
                      },
                    )
              }
            />
          ) : sheet.t === "account" ? (
            <AccountForm
              w={sheet.w}
              busy={busy}
              err={err}
              onSave={(accountNumber, holderName) =>
                run(
                  () =>
                    act.addWalletAccount({ walletTypeId: sheet.w.id, accountNumber, holderName }),
                  (id) => {
                    setAccs((l) => [
                      ...l,
                      {
                        id: String(id),
                        method: "other",
                        accountNumber,
                        holderName,
                        sortOrder: l.length,
                        active: true,
                        note: null,
                        walletTypeId: sheet.w.id,
                        opening: null,
                      },
                    ]);
                    setSheet(null);
                    say(`أُضيف حساب ${sheet.w.name}.`);
                  },
                )
              }
            />
          ) : (
            <OpeningForm
              what={
                sheet.t === "opening"
                  ? `${sheet.w.name} ${sheet.a.accountNumber}`
                  : "النقد في يد اللجنة"
              }
              busy={busy}
              err={err}
              onSave={(amount, on) =>
                sheet.t === "opening"
                  ? run(
                      () => act.setFundAccountOpening({ id: sheet.a.id, amount, on }),
                      () => {
                        setAccs((l) =>
                          l.map((x) =>
                            x.id === sheet.a.id ? { ...x, opening: { amount, on } } : x,
                          ),
                        );
                        setSheet(null);
                        say("حُفظ رصيد أول الحساب.");
                      },
                    )
                  : run(
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
          )}
        </Sheet>
      )}
    </section>
  );
}

const TITLE: Record<SheetKind["t"], string> = {
  newWallet: "محفظة جديدة",
  editWallet: "عدّل المحفظة",
  account: "أضف حسابًا",
  opening: "رصيد أول الحساب",
  cashOpening: "رصيد أول النقد",
};

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

function Form({
  title,
  children,
  err,
  busy,
  ok,
  save,
  onSave,
}: {
  title: string;
  children: ReactNode;
  err: string;
  busy: boolean;
  ok: boolean;
  save: string;
  onSave: () => void;
}) {
  const online = useOnline();
  return (
    <div className="bq-rec">
      <h2>{title}</h2>
      {children}
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
    </div>
  );
}

/** A wallet's name and logo (PNG, JPEG or WEBP; uploaded when saved). */
function WalletForm({
  w,
  busy,
  err,
  onSave,
  onStop,
}: {
  w?: WalletType;
  busy: boolean;
  err: string;
  onSave: (name: string, logoPath: string | undefined) => Promise<boolean>;
  /** an existing wallet: stop it (with a confirmation) */
  onStop?: () => void;
}) {
  const { uploadWalletLogo } = useAct();
  const [stopping, setStopping] = useState(false);
  const [name, setName] = useState(w?.name ?? "");
  // a new picture (data URL), "" = remove the logo, null = keep it
  const [pic, setPic] = useState<string | null>(null);
  const [upErr, setUpErr] = useState("");
  const [upBusy, setUpBusy] = useState(false);
  const shown = pic === null ? (w ? walletLogo(w) : null) : pic || null;
  return (
    <Form
      title={w ? `عدّل ${w.name}` : "محفظة جديدة"}
      err={upErr || err}
      busy={busy || upBusy}
      ok={!!name.trim() && (name.trim() !== w?.name || pic !== null)}
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
        await onSave(name.trim(), logoPath);
      }}
    >
      <p className="bq-rec-k">الاسم</p>
      <input
        className="bq-input"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        aria-label="اسم المحفظة"
        placeholder="مثل: بنكيلي"
      />
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
    </Form>
  );
}

function AccountForm({
  w,
  busy,
  err,
  onSave,
}: {
  w: WalletType;
  busy: boolean;
  err: string;
  onSave: (accountNumber: string, holderName: string) => Promise<boolean>;
}) {
  const [num, setNum] = useState("");
  const [holder, setHolder] = useState("");
  const clean = num.replace(/[\s-]/g, "");
  return (
    <Form
      title={`حساب في ${w.name}`}
      err={err}
      busy={busy}
      ok={/^[0-9A-Za-z+]{4,30}$/.test(clean) && !!holder.trim()}
      save="أضف الحساب"
      onSave={() => void onSave(clean, holder.trim())}
    >
      <p className="bq-rec-k">رقم الحساب</p>
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
    </Form>
  );
}

/** The opening balance: once only (the server refuses a second time). */
function OpeningForm({
  what,
  busy,
  err,
  onSave,
}: {
  what: string;
  busy: boolean;
  err: string;
  onSave: (amount: number, on: string) => Promise<boolean>;
}) {
  const [amt, setAmt] = useState("");
  const [on, setOn] = useState(`${new Date().getFullYear()}-01-01`);
  const [sure, setSure] = useState(false);
  return (
    <Form
      title={`رصيد أول: ${what}`}
      err={err}
      busy={busy}
      ok={amt.trim() !== "" && !!on && sure}
      save="احفظ الرصيد"
      onSave={() => void onSave(amountValue(amt), on)}
    >
      <p className="bq-hint">
        ما كان فيها في هذا اليوم، بالأوقية القديمة. به يظهر رصيدها الآن في الإعدادات والتقارير.
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
    </Form>
  );
}
