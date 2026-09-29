"use client";
import { useState, type ReactNode } from "react";
import type { CampaignPublic, ContributorPublic, FundAccount } from "@/lib/data/types";
import { METHOD_LABELS } from "@/lib/methods";
import { MethodBadge, Track } from "../bits";
import { DonateProof } from "../donate-proof";
import { contributorCount, dayWords, fmt } from "../derive";
import { I } from "../icons";
import { Num } from "../num";
import { radioKeys, radioTab } from "../radio-keys";
import { useSnack } from "../shell";
import { ConfirmedMark } from "../mark";
import { Amount, Dots, MoneyHint, useMoney } from "../money";

const AMOUNTS = [500, 1000, 2000, 5000];

function Step({ n, t, children }: { n: number; t: string; children: ReactNode }) {
  return (
    <li className="bq-give-step">
      <span className="bq-step-n">
        <Num>{n}</Num>
      </span>
      <div className="bq-grow-1">
        <p className="bq-give-t">{t}</p>
        {children}
      </div>
    </li>
  );
}

export function DonationsView({
  campaign,
  past,
  contributions,
  accounts,
  whatsapp,
}: {
  /** amount-free (money privacy): figures come from useMoney() for members/committee */
  campaign: CampaignPublic | null;
  past: CampaignPublic[];
  contributions: ContributorPublic[];
  accounts: FundAccount[];
  whatsapp: string | null;
}) {
  const [all, setAll] = useState(false);
  const money = useMoney();
  const c = campaign;
  const cm = c && money ? money.campaigns.find((x) => x.campaignId === c.campaignId) : undefined;
  const target = cm?.targetAmount ?? 0;
  const pct = cm && target > 0 ? Math.min(100, Math.round((cm.collected / target) * 100)) : null;
  const shown = all ? contributions : contributions.slice(0, 4);
  const say = useSnack();
  const live = accounts.filter((a) => a.active);
  const [accId, setAccId] = useState<string | null>(null);
  const acc = live.find((a) => a.id === accId) ?? live[0] ?? null;
  const [amount, setAmount] = useState<number | "other" | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <>
      <header className="bq-page-h">
        <h1>التبرعات</h1>
        <p className="bq-lead">هذه التبرعات للحملة، ولا تُحسب من رسومك الشهرية.</p>
      </header>

      {!c ? (
        <section className="bq-sec bq-sec-first">
          <div className="bq-empty">
            <span className="bq-disc is-gold">{I.heart(22)}</span>
            <p className="bq-empty-t">لا توجد حملة مفتوحة الآن</p>
            <p className="bq-hint">عندما تفتح اللجنة حملة جديدة تظهر هنا.</p>
          </div>
        </section>
      ) : (
        <>
          <section className="bq-sec bq-sec-first" aria-labelledby="bq-camp-h">
            <header className="bq-camp-head">
              <h2 id="bq-camp-h">{c.title}</h2>
              {c.purpose && <p className="bq-lead">{c.purpose}</p>}
              {c.deadline && (
                <span className="bq-tag is-ok bq-tag-inline">
                  مفتوحة حتى {dayWords(c.deadline)}
                </span>
              )}
            </header>
          </section>

          {/* owner pick «a» (r31): the way to give first, as wallet steps; the figures after */}
          <section className="bq-sec" aria-labelledby="bq-how-h">
            <h2 id="bq-how-h">كيف أساهم؟</h2>
            {live.length ? (
              <ol className="bq-give">
                <Step n={1} t="اختر محفظتك">
                  <div
                    className="bq-give-wallets"
                    role="radiogroup"
                    aria-label="المحفظة"
                    onKeyDown={radioKeys}
                  >
                    {live.map((a, i) => (
                      <button
                        key={a.id}
                        type="button"
                        role="radio"
                        aria-checked={acc?.id === a.id}
                        tabIndex={radioTab(acc?.id === a.id, i, !!acc)}
                        className="bq-give-wallet bq-press"
                        onClick={() => setAccId(a.id)}
                      >
                        <MethodBadge method={a.method} size={40} label={false} decorative />
                        <span>{METHOD_LABELS[a.method]}</span>
                      </button>
                    ))}
                  </div>
                </Step>
                <Step n={2} t="حوّل إلى هذا الرقم">
                  {acc && (
                    <div className="bq-give-num">
                      <span className="bq-row-m">
                        <bdi dir="ltr" className="bq-num bq-give-n">
                          {acc.accountNumber}
                        </bdi>
                        <span className="bq-row-s">باسم {acc.holderName}</span>
                      </span>
                      <button
                        type="button"
                        className="bq-copy bq-press"
                        aria-label={`نسخ رقم ${METHOD_LABELS[acc.method]}`}
                        onClick={() => {
                          navigator.clipboard?.writeText(acc.accountNumber).catch(() => {});
                          setCopied(acc.id);
                          say(`نُسخ رقم ${METHOD_LABELS[acc.method]}`);
                        }}
                      >
                        {copied === acc.id ? I.check(18) : I.copy(18)}{" "}
                        {copied === acc.id ? "نُسخ" : "نسخ"}
                      </button>
                    </div>
                  )}
                </Step>
                <Step n={3} t="كم تساهم؟ (أوقية)">
                  <div
                    className="bq-chips"
                    role="radiogroup"
                    aria-label="المبلغ"
                    onKeyDown={radioKeys}
                  >
                    {AMOUNTS.map((n, i) => (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={amount === n}
                        tabIndex={radioTab(amount === n, i, amount !== null)}
                        className="bq-chip bq-press"
                        onClick={() => setAmount(n)}
                      >
                        <Num>{fmt(n)}</Num>
                      </button>
                    ))}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={amount === "other"}
                      tabIndex={radioTab(amount === "other", AMOUNTS.length, amount !== null)}
                      className="bq-chip bq-press"
                      onClick={() => setAmount("other")}
                    >
                      مبلغ آخر
                    </button>
                  </div>
                </Step>
                <Step n={4} t="أرسل صورة التحويل للجنة">
                  <DonateProof
                    campaign={{ campaignId: c.campaignId, title: c.title }}
                    accounts={live}
                    whatsapp={whatsapp}
                    wallet={acc}
                    amount={typeof amount === "number" ? amount : null}
                  />
                  <p className="bq-hint bq-give-trust">
                    {I.lock(16)}
                    <span>لا يرى صورتك إلا اللجنة. التطبيق لا يحوّل المال؛ التحويل من محفظتك.</span>
                  </p>
                </Step>
              </ol>
            ) : (
              <p className="bq-lead-body">
                {whatsapp ? (
                  <>
                    تواصل مع اللجنة على واتساب{" "}
                    <bdi dir="ltr" className="bq-num">
                      {whatsapp}
                    </bdi>{" "}
                    لتعرف أين ترسل مساهمتك.
                  </>
                ) : (
                  "تواصل مع أحد أعضاء اللجنة لتعرف أين ترسل مساهمتك."
                )}
              </p>
            )}
          </section>

          <section className="bq-sec" aria-label="ما جُمع">
            <div className="bq-give-prog">
              <p className="bq-give-row">
                <span className="bq-row-s">جُمع حتى الآن</span>
                <strong className="bq-give-sum">
                  {cm ? <Num>{fmt(cm.collected)}</Num> : <Dots />} <small>أوقية</small>
                </strong>
              </p>
              {pct !== null && <Track f={pct / 100} label={`${pct}% من الهدف`} />}
              <p className="bq-row-s">
                {pct !== null && (
                  <>
                    <Num>{pct}%</Num> من هدف <Num>{fmt(target)}</Num> أوقية ·{" "}
                  </>
                )}
                {contributorCount(c.participantsPaid)}
                {c.deadline && <> · حتى {dayWords(c.deadline)}</>}
              </p>
              <MoneyHint whatsapp={whatsapp} />
            </div>
          </section>

          <section className="bq-sec bq-rv" data-rv="don-last" aria-labelledby="bq-last-h">
            <h2 id="bq-last-h">آخر المساهمات</h2>
            {shown.length ? (
              <ul className="bq-list">
                {shown.map((x) => (
                  <li key={x.paymentId}>
                    <div className="bq-row">
                      <span className="bq-disc is-in">{I.heart(22)}</span>
                      <span className="bq-row-m">
                        <span className="bq-row-t">{x.contributorName}</span>
                        <ConfirmedMark date={x.at} size={22} />
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="bq-hint">لم تُؤكَّد مساهمات بعد. كن أول المساهمين.</p>
            )}
            {contributions.length > 4 && (
              <button
                type="button"
                className="bq-link bq-press"
                onClick={() => setAll((a) => !a)}
                aria-expanded={all}
              >
                {all ? "عرض أقل" : "عرض الكل"}
                {I.chev(18)}
              </button>
            )}
          </section>
        </>
      )}

      {past.length > 0 && (
        <section className="bq-sec" aria-labelledby="bq-past-h">
          <h2 id="bq-past-h">حملات سابقة</h2>
          <ul className="bq-list">
            {past.map((p) => (
              <li key={p.campaignId} className="bq-row">
                <span className="bq-row-m">
                  <span className="bq-row-t">{p.title}</span>
                  <span className="bq-row-s">
                    <PastFigures id={p.campaignId} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** «جُمع … من … أوقية» for members/committee; the dots for strangers. */
function PastFigures({ id }: { id: string }) {
  const money = useMoney();
  const p = money?.campaigns.find((x) => x.campaignId === id);
  return (
    <>
      جُمع <Amount v={p?.collected} />
      {p?.targetAmount ? (
        <>
          {" "}
          من <Num>{fmt(p.targetAmount)}</Num>
        </>
      ) : null}{" "}
      أوقية
    </>
  );
}
