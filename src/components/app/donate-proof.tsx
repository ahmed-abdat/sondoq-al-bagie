"use client";
// Donations, step 4: the transfer screenshot really reaches the committee (owner, r33).
// - A member with their link: the photo is uploaded and the contribution goes to the committee's
//   queue as a pending payment, exactly like the monthly «أرسل صورة التحويل» (member_submit_payment
//   already takes campaign allocations; nothing new on the server).
// - Anyone else: the photo is shared as a file (share sheet → WhatsApp) where the phone can; else
//   WhatsApp opens with the text only and the page says plainly to attach the photo there.
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useOnline } from "@/components/providers";
import { compressImage, dataUrlToBlob } from "@/lib/compress-image";
import { failure } from "@/lib/data/errors";
import type { FundAccount, PaymentMethod } from "@/lib/data/types";
import { todayIso } from "@/lib/dates";
import { hasMemberFlag } from "@/lib/member-link";
import { METHOD_LABELS } from "@/lib/methods";
import { parseAmount, toWesternDigits } from "@/lib/money";
import { readReceipt } from "@/lib/ocr";
import { waLink } from "@/lib/whatsapp";
import { fmt, imageOpenError } from "./derive";
import { I } from "./icons";
import { useMemberAct } from "./member-act";
import { memberHome } from "./member-view-action";
import { sendOnce, useOnceId } from "./once-id";
import { useSnack } from "./shell";

const noSub = () => () => {};
const isMember = () => hasMemberFlag(document.cookie);

type Picked = { file: File; url: string };

export function DonateProof({
  campaign,
  accounts,
  whatsapp,
  wallet,
  amount,
}: {
  campaign: { campaignId: string; title: string };
  accounts: FundAccount[];
  whatsapp: string | null;
  /** the wallet chosen in step 1 */
  wallet: FundAccount | null;
  /** the amount chosen in step 3 (old ouguiya), or null */
  amount: number | null;
}) {
  const member = useSyncExternalStore(noSub, isMember, () => false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [err, setErr] = useState("");

  const pick = async (f: File) => {
    setErr("");
    try {
      setPicked({ file: f, url: await compressImage(f) });
    } catch {
      setErr(imageOpenError(f));
    }
  };

  return (
    <div className="bq-give-proof">
      <label className="bq-btn bq-btn-primary bq-btn-lg bq-press">
        {I.image(22)} {picked ? "غيّر الصورة" : "اختر صورة التحويل"}
        <input
          type="file"
          accept="image/*"
          className="bq-sr"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void pick(f);
          }}
        />
      </label>
      {err && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
      {picked &&
        (member ? (
          <MemberSend
            key={picked.url}
            picked={picked}
            campaign={campaign}
            accounts={accounts}
            wallet={wallet}
            amount={amount}
            onSent={() => setPicked(null)}
          />
        ) : (
          <StrangerShare
            picked={picked}
            campaign={campaign}
            whatsapp={whatsapp}
            wallet={wallet}
            amount={amount}
          />
        ))}
    </div>
  );
}

/** A member: the photo and the amount go to the committee's queue (pending). */
function MemberSend({
  picked,
  campaign,
  accounts,
  wallet,
  amount,
  onSent,
}: {
  picked: Picked;
  campaign: { campaignId: string; title: string };
  accounts: FundAccount[];
  wallet: FundAccount | null;
  amount: number | null;
  onSent: () => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const say = useSnack();
  const once = useOnceId();
  const { memberUploadProof, memberSubmitPayment } = useMemberAct();
  const [txt, setTxt] = useState(amount ? String(amount) : "");
  const [method, setMethod] = useState<PaymentMethod | null>(wallet?.method ?? null);
  const [txn, setTxn] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // read the screenshot once: fill what is still empty (the member checks it)
  useEffect(() => {
    let live = true;
    readReceipt(picked.file, {
      expectedMro: amount ?? undefined,
      accounts: accounts.map((a) => ({
        method: a.method,
        accountNumber: a.accountNumber,
        holderName: a.holderName,
      })),
    })
      .then((r) => {
        if (!live) return;
        if (r.amountMro) setTxt((t) => t || String(r.amountMro));
        if (r.method) setMethod((m) => m ?? r.method);
        if (r.txnRef) setTxn(r.txnRef);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [picked.file, amount, accounts]);
  const value = Math.round(parseAmount(txt) ?? 0);

  const send = async () => {
    if (!value || !method) return;
    setBusy(true);
    setErr("");
    let r: Awaited<ReturnType<typeof memberSubmitPayment>>;
    try {
      const home = await memberHome();
      if (!home) {
        setErr("افتح رابطك الخاص من جديد ثم أعد المحاولة.");
        return;
      }
      r = await sendOnce(once, async (id) => {
        const fd = new FormData();
        fd.set("file", dataUrlToBlob(picked.url), "proof.jpg");
        fd.set("id", id);
        const up = await memberUploadProof(fd);
        if (!up.ok) return up;
        return memberSubmitPayment({
          id,
          payerName: home.s.fullName,
          method,
          amount: value,
          paidOn: todayIso(),
          allocations: [
            {
              kind: "campaign",
              campaignId: campaign.campaignId,
              memberId: home.s.memberId,
              amount: value,
            },
          ],
          txnRef: txn.trim() || undefined,
          proofPath: up.data.path,
          proofHash: up.data.hash,
        });
      });
    } catch {
      r = failure("network");
    } finally {
      setBusy(false);
    }
    if (!r.ok) return setErr(r.message);
    router.refresh();
    say("وصلتنا الصورة. اللجنة تراجعها.");
    onSent();
  };

  return (
    <div className="bq-give-send">
      {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
      <img src={picked.url} alt="صورة التحويل التي اخترتها" className="bq-give-shot" />
      <label className="bq-rec-field">
        <span className="bq-rec-k">المبلغ الذي حوّلته (أوقية قديمة)</span>
        <input
          className="bq-input"
          value={txt}
          onChange={(e) => setTxt(toWesternDigits(e.target.value))}
          inputMode="numeric"
          dir="ltr"
          placeholder="مثل 1000"
        />
      </label>
      {!method && <p className="bq-hint">اختر محفظتك في الخطوة 1.</p>}
      {err && (
        <p className="bq-alert" role="alert">
          {err}
        </p>
      )}
      <button
        type="button"
        className="bq-btn bq-btn-primary bq-btn-lg bq-press"
        disabled={busy || !online || !value || !method}
        onClick={() => void send()}
      >
        {busy ? "جارٍ الإرسال…" : `أرسل ${value ? `${fmt(value)} أوقية ` : ""}إلى اللجنة`}
      </button>
      <p className="bq-hint">
        {method ? `عبر ${METHOD_LABELS[method]} · ` : ""}تراجعها اللجنة ثم يظهر اسمك في المساهمين.
      </p>
    </div>
  );
}

/** Anyone else: share the photo itself when the phone can; else say to attach it in WhatsApp. */
function StrangerShare({
  picked,
  campaign,
  whatsapp,
  wallet,
  amount,
}: {
  picked: Picked;
  campaign: { campaignId: string; title: string };
  whatsapp: string | null;
  wallet: FundAccount | null;
  amount: number | null;
}) {
  const text = `السلام عليكم، أرسلت مساهمة لحملة «${campaign.title}»${wallet ? ` عبر ${METHOD_LABELS[wallet.method]}` : ""}.${amount ? `\nالمبلغ: ${fmt(amount)} أوقية` : ""}\nالاسم: `;
  const file = new File([dataUrlToBlob(picked.url)], "transfer.jpg", { type: "image/jpeg" });
  const canShare =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });
  const [shared, setShared] = useState(false);
  if (canShare)
    return (
      <div className="bq-give-send">
        {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
        <img src={picked.url} alt="صورة التحويل التي اخترتها" className="bq-give-shot" />
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          onClick={() =>
            navigator
              .share({ files: [file], text })
              .then(() => setShared(true))
              .catch(() => {})
          }
        >
          {I.wa(22)} شارك الصورة في واتساب
        </button>
        <p className="bq-hint">
          {shared
            ? "إن أرسلتها، تراجعها اللجنة ثم يظهر اسمك في المساهمين."
            : whatsapp
              ? `اختر واتساب، ثم محادثة اللجنة ${whatsapp}.`
              : "اختر واتساب، ثم محادثة أحد أعضاء اللجنة."}
        </p>
      </div>
    );
  return (
    <div className="bq-give-send">
      <a
        className="bq-btn bq-btn-primary bq-btn-lg bq-press"
        href={waLink(whatsapp, text)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {I.wa(22)} افتح واتساب
      </a>
      <p className="bq-hint">هاتفك لا يرسل الصورة من هنا. أرفقها في واتساب ثم أرسل الرسالة.</p>
    </div>
  );
}
