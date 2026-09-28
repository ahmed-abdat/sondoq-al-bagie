"use client";
import { useState } from "react";
import type { CampaignContribution, CampaignProgress, FundAccount } from "@/lib/data/types";
import { waLink } from "@/lib/whatsapp";
import { Track } from "../bits";
import { dayWords, fmt } from "../derive";
import { I } from "../icons";
import { Num } from "../num";
import { PayTo } from "../pay-to";
import { ConfirmedMark } from "../receipt";

export function DonationsView({
  campaign,
  past,
  contributions,
  accounts,
  whatsapp,
  showAmounts,
}: {
  campaign: CampaignProgress | null;
  past: CampaignProgress[];
  contributions: CampaignContribution[];
  accounts: FundAccount[];
  whatsapp: string | null;
  /** contribution amounts are shown only when the committee allows amounts */
  showAmounts: boolean;
}) {
  const [all, setAll] = useState(false);
  const c = campaign;
  const target = c?.targetAmount ?? 0;
  const pct = c && target > 0 ? Math.min(100, Math.round((c.collected / target) * 100)) : null;
  const shown = all ? contributions : contributions.slice(0, 4);
  const wa = c
    ? waLink(
        whatsapp,
        `السلام عليكم، أرسلت مساهمة لحملة «${c.title}». هذه صورة التحويل.\nالاسم: \nالمبلغ: `,
      )
    : null;
  return (
    <>
      <header className="bq-page-h">
        <h1>التبرعات</h1>
        <p className="bq-lead">حملات لأنشطة محددة، تُحسب منفصلة عن الرسوم الشهرية.</p>
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
          <section
            className="bq-sec bq-sec-first bq-rv"
            data-rv="don-camp"
            aria-labelledby="bq-camp-h"
          >
            <h2 id="bq-camp-h" className="bq-camp-h">
              {c.title}{" "}
              {c.deadline && (
                <span className="bq-tag is-ok bq-tag-inline">
                  مفتوحة حتى {dayWords(c.deadline)}
                </span>
              )}
            </h2>
            {c.purpose && <p className="bq-lead">{c.purpose}</p>}
            <p className="bq-big bq-big-of">
              <Num>{fmt(c.collected)}</Num> <span>أوقية</span>
              {target > 0 && (
                <span className="bq-of">
                  من هدف <Num>{fmt(target)}</Num>
                </span>
              )}
            </p>
            {pct !== null && (
              <div className="bq-track-row">
                <Track f={pct / 100} label={`${pct}% من الهدف`} />
                <Num className="bq-track-p">{pct}%</Num>
              </div>
            )}
            <ul className="bq-facts3">
              <li>
                {I.people(20)}
                <span>
                  <Num>{c.participantsPaid}</Num>{" "}
                  {c.participantsPaid > 2 && c.participantsPaid <= 10 ? "مساهمين" : "مساهمًا"}
                </span>
              </li>
              {target > 0 && (
                <li>
                  {I.coins(20)}
                  <span>
                    الباقي <Num>{fmt(Math.max(0, target - c.collected))}</Num>
                  </span>
                </li>
              )}
              {c.deadline && (
                <li>
                  {I.calendar(20)}
                  <span>ينتهي {dayWords(c.deadline)}</span>
                </li>
              )}
            </ul>
            <p className="bq-hint">يمكن لكل الأعضاء وأهل القرية المساهمة.</p>
          </section>

          <section className="bq-sec bq-rv" data-rv="don-how" aria-labelledby="bq-how-h">
            <h2 id="bq-how-h">كيف أساهم؟</h2>
            <ol className="bq-steps">
              <li>
                <span className="bq-step-n">
                  <Num>1</Num>
                </span>
                <div className="bq-grow-1">
                  <p>أرسل مساهمتك إلى أحد أرقام الصندوق.</p>
                  <PayTo accounts={accounts} />
                </div>
              </li>
              <li>
                <span className="bq-step-n">
                  <Num>2</Num>
                </span>
                <p>أرسل صورة التحويل في مجموعة الواتساب أو لأحد أعضاء اللجنة.</p>
              </li>
              <li>
                <span className="bq-step-n">
                  <Num>3</Num>
                </span>
                <p>يؤكدها أمين الصندوق ويظهر اسمك هنا.</p>
              </li>
            </ol>
            {wa && (
              <div className="bq-btn-col">
                <a
                  className="bq-btn bq-btn-primary bq-btn-lg bq-press"
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {I.wa(22)} أرسل صورة التحويل عبر واتساب
                </a>
              </div>
            )}
            <p className="bq-hint bq-small-top">التطبيق لا يحوّل المال؛ التحويل من محفظتك.</p>
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
                      {showAmounts && (
                        <span className="bq-row-e">
                          <Num className="bq-amt a-in">{`+${fmt(x.amount)}`}</Num>
                        </span>
                      )}
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
                    جُمع <Num>{fmt(p.collected)}</Num>
                    {p.targetAmount ? (
                      <>
                        {" "}
                        من <Num>{fmt(p.targetAmount)}</Num>
                      </>
                    ) : null}{" "}
                    أوقية
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
