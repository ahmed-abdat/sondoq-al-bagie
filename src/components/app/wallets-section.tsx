"use client";
// «المحافظ» (m41) inside الإعدادات. Owner decision «one pot»: a wallet only says through which
// channel money came in or went out; the fund has one balance. Each wallet is ONE row (logo,
// name, number · holder). «عدّل» opens ONE sheet: name, logo, the number («غيّر الرقم»: a new
// number or a typo fix) and «أوقف المحفظة». No per-wallet balance, no moves, no openings.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { compressImage, dataUrlToBlob } from "@/lib/compress-image";
import type { FundAccountAdmin, WalletType } from "@/lib/data/types";
import { useAct } from "./act";
import { MESSAGES } from "@/lib/data/errors";
import { I } from "./icons";
import { Sheet } from "./sheet";
import { useSnack } from "./shell";
import { walletLogo } from "./wallet-logo";
type Res = { ok: true; data?: unknown } | { ok: false; message: string };
export function WalletsSection({
  types,
  accounts,
  admin,
}: {
  types: WalletType[];
  accounts: FundAccountAdmin[];
  admin: boolean;
}) {
  const router = useRouter();
  const say = useSnack();
  const act = useAct();
  // shown at once after a save (the demo simulates writes, so the server lists do not change)
  const [ws, setWs] = useState(() => [...types].sort((a, b) => a.sortOrder - b.sortOrder));
  const [accs, setAccs] = useState(accounts);
  const [sheet, setSheet] = useState<{ w?: WalletType } | null>(null);
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
  // the list shows the wallets with a number or money on an old number; the others collapse
  const shown = (w: WalletType) => accsOfId(w.id).length > 0;
  const withNumber = live.filter(shown);
  const noNumber = live.filter((w) => !shown(w));
  const stopped = ws.filter((w) => w.kind === "wallet" && !w.active);
  const cash = ws.find((w) => w.kind === "cash");
  const accsOf = (w: WalletType) => accs.filter((a) => a.walletTypeId === w.id && a.active);

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
          );
        })}
        {cash && (
          <li className="bq-group-row bq-wallet">
            <span className="bq-wallet-logo" aria-hidden="true">
              {I.cash(22)}
            </span>
            <span className="bq-row-m">
              <span className="bq-row-t">نقدًا (في يد اللجنة)</span>
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

      {sheet && (
        <Sheet
          label={sheet.w ? "عدّل المحفظة" : "محفظة جديدة"}
          onDone={() => {
            setSheet(null);
            setErr("");
          }}
        >
          {
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
              onStop={
                sheet.w
                  ? async () => {
                      if (await setWalletActive(sheet.w!, false)) setSheet(null);
                    }
                  : undefined
              }
            />
          }
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

/** One wallet, everything in one place (a new wallet: name, logo, number). */
function WalletSheet({
  w,
  account,
  busy,
  err,
  onSave,
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
