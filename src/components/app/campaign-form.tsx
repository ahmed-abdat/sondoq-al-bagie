"use client";
// Committee campaigns: open one, edit it while open, close it (surplus to the fund or kept).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { useAct } from "./act";
import type { ActionResult, CampaignProgress } from "@/lib/data/types";
import { failure } from "@/lib/data/errors";
import { sendOnce, useOnceId } from "./once-id";
import { parseAmount } from "@/lib/money";
import { contributionCount, dayWords, fmt } from "./derive";
import { DateField } from "./date-field";
import { I } from "./icons";
import { Num } from "./num";

export function CampaignFormBody({
  campaign,
  pendingCount = 0,
  onDone,
}: {
  /** edit this one; omit to open a new campaign */
  campaign?: CampaignProgress;
  /** pending payments that carry a contribution to it (closing waits for them) */
  pendingCount?: number;
  onDone: (text: string) => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const { createCampaign, updateCampaign } = useAct();
  const once = useOnceId();
  const [title, setTitle] = useState(campaign?.title ?? "");
  const [purpose, setPurpose] = useState(campaign?.purpose ?? "");
  const [target, setTarget] = useState(campaign?.targetAmount ? String(campaign.targetAmount) : "");
  const [deadline, setDeadline] = useState(campaign?.deadline ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [closing, setClosing] = useState(false);
  const t = target.trim() ? Math.round(parseAmount(target) ?? 0) : null;
  const ok = title.trim().length > 2 && (t === null || t > 0);

  const submit = async () => {
    setBusy(true);
    setErr("");
    let r: ActionResult | ActionResult<string>;
    try {
      r = campaign
        ? await updateCampaign({
            id: campaign.campaignId,
            title: title.trim(),
            purpose: purpose.trim() || null,
            targetAmount: t,
            deadline: deadline || null,
          })
        : // the same id on every retry: the server replays instead of opening it twice
          await sendOnce(once, (id) =>
            createCampaign({
              id,
              title: title.trim(),
              amountMode: "open",
              purpose: purpose.trim() || undefined,
              targetAmount: t ?? undefined,
              deadline: deadline || undefined,
            }),
          );
    } catch {
      r = failure("network");
    } finally {
      setBusy(false);
    }
    if (!r.ok) return setErr(r.message);
    router.refresh();
    onDone(campaign ? "حُفظت الحملة" : `فُتحت حملة «${title.trim()}»`);
  };

  if (campaign && closing)
    return (
      <CloseCampaignBody
        campaign={campaign}
        pendingCount={pendingCount}
        onDone={onDone}
        onBack={() => setClosing(false)}
      />
    );
  return (
    <div className="bq-rec">
      <h2>{campaign ? "تعديل الحملة" : "حملة جديدة"}</h2>
      <p className="bq-rec-k">اسم الحملة</p>
      <input
        className="bq-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="مثل: معدات فريق كرة القدم"
        aria-label="اسم الحملة"
      />
      <p className="bq-rec-k">لماذا؟ (اختياري)</p>
      <input
        className="bq-input"
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        aria-label="هدف الحملة"
      />
      <p className="bq-rec-k">المبلغ المطلوب بالأوقية (اختياري)</p>
      <input
        className="bq-input"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        inputMode="numeric"
        dir="ltr"
        aria-label="المبلغ المطلوب"
      />
      <p className="bq-rec-k">آخر يوم (اختياري)</p>
      <DateField value={deadline} onChange={setDeadline} label="آخر يوم للحملة" optional />
      <p className="bq-hint bq-small-top">
        المساهمات تُحسب منفصلة عن الرسوم الشهرية، ويراها كل الأعضاء في «التبرعات».
      </p>
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
          onClick={() => void submit()}
        >
          {busy ? "جارٍ الحفظ…" : campaign ? "احفظ التعديل" : "افتح الحملة"}
        </button>
        <OfflineWriteHint />
        {campaign && (
          <button
            type="button"
            className="bq-link bq-link-quiet bq-press"
            onClick={() => setClosing(true)}
          >
            انتهت الحملة؟ إغلاقها
          </button>
        )}
      </div>
    </div>
  );
}

export function CloseCampaignBody({
  campaign,
  pendingCount = 0,
  onDone,
  onBack,
}: {
  campaign: CampaignProgress;
  pendingCount?: number;
  onDone: (t: string) => void;
  onBack?: () => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const { closeCampaign } = useAct();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="bq-rec">
      <h2>إغلاق الحملة</h2>
      <p className="bq-lead">{campaign.title}</p>
      <dl className="bq-facts">
        <div>
          <dt>جُمع</dt>
          <dd>
            <Num>{fmt(campaign.collected)}</Num> أوقية
          </dd>
        </div>
        <div>
          <dt>صُرف</dt>
          <dd>
            <Num>{fmt(campaign.spent)}</Num> أوقية
          </dd>
        </div>
        <div className="is-wide">
          <dt>الباقي في حساب الحملة</dt>
          <dd>
            <Num>{fmt(campaign.balance)}</Num> أوقية
          </dd>
        </div>
      </dl>
      {campaign.balance > 0 && (
        <p className="bq-lead bq-small-top">
          الباقي (<Num>{fmt(campaign.balance)}</Num> أوقية) يُحوَّل إلى الصندوق الرئيسي عند الإغلاق.
        </p>
      )}
      <p className="bq-hint bq-small-top">
        بعد الإغلاق لا تُقبل مساهمات جديدة، ولا يمكن فتحها من جديد.
      </p>
      {pendingCount > 0 && (
        <div className="bq-wait" role="status">
          <p>
            للحملة {contributionCount(pendingCount)} بانتظار التأكيد. أكّدها أو ارفضها قبل الإغلاق.
          </p>
          <Link className="bq-link bq-link-s bq-press" href="/committee">
            افتح الدفعات {I.go(18)}
          </Link>
        </div>
      )}
      <div className="bq-rec-foot">
        {err && (
          <p className="bq-alert" role="alert">
            {err}
          </p>
        )}
        <button
          type="button"
          className="bq-btn bq-btn-tonal bq-btn-lg bq-press"
          disabled={busy || !online || pendingCount > 0}
          onClick={async () => {
            setBusy(true);
            setErr("");
            // owner decision: the leftover always goes to the fund (the server enforces it);
            // a refusal (e.g. campaign_has_pending) is shown as the server words it
            const r = await closeCampaign({ id: campaign.campaignId, surplusAction: "to_fund" });
            setBusy(false);
            if (!r.ok) return setErr(r.message);
            router.refresh();
            onDone(
              r.data > 0
                ? `أُغلقت الحملة وحُوّل ${fmt(r.data)} أوقية إلى الصندوق`
                : "أُغلقت الحملة",
            );
          }}
        >
          أغلق الحملة
        </button>
        {onBack && (
          <button type="button" className="bq-btn bq-btn-ghost bq-press" onClick={onBack}>
            رجوع
          </button>
        )}
        <OfflineWriteHint />
      </div>
    </div>
  );
}

/** Committee list of campaigns; an open one opens its sheet (edit, and close at the bottom). */
export function CampaignAdminList({
  campaigns,
  onEdit,
}: {
  campaigns: CampaignProgress[];
  onEdit: (c: CampaignProgress) => void;
}) {
  if (!campaigns.length)
    return <p className="bq-hint">لا توجد حملات بعد. اضغط «حملة جديدة» لتفتح أول حملة.</p>;
  return (
    <ul className="bq-list">
      {campaigns.map((c) => {
        const body = (
          <>
            <span className="bq-disc is-gold">{I.heart(22)}</span>
            <span className="bq-row-m">
              <span className="bq-row-t">{c.title}</span>
              <span className="bq-row-s">
                جُمع <Num>{fmt(c.collected)}</Num>
                {c.targetAmount ? (
                  <>
                    {" "}
                    من <Num>{fmt(c.targetAmount)}</Num>
                  </>
                ) : null}{" "}
                أوقية ·{" "}
                {c.status === "open"
                  ? c.deadline
                    ? `حتى ${dayWords(c.deadline)}`
                    : "مفتوحة"
                  : "مغلقة"}
              </span>
            </span>
          </>
        );
        return (
          <li key={c.campaignId}>
            {c.status === "open" ? (
              <button type="button" className="bq-row bq-press" onClick={() => onEdit(c)}>
                {body}
                <span className="bq-chev">{I.go(18)}</span>
              </button>
            ) : (
              <div className="bq-row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
