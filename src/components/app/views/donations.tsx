"use client";
import { useState } from "react";
import type { CampaignPublic, ContributorPublic, FundAccount } from "@/lib/data/types";
import { waLink } from "@/lib/whatsapp";
import { Track } from "../bits";
import { dayWords, fmt } from "../derive";
import { I } from "../icons";
import { Num } from "../num";
import { PayTo } from "../pay-to";
import { ConfirmedMark } from "../mark";
import { Amount, Dots, useMoney } from "../money";

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
            <header className="bq-camp-head">
              <h2 id="bq-camp-h">{c.title}</h2>
              {c.purpose && <p className="bq-lead">{c.purpose}</p>}
              {c.deadline && (
                <span className="bq-tag is-ok bq-tag-inline">
                  مفتوحة حتى {dayWords(c.deadline)}
                </span>
              )}
            </header>
            {!cm ? (
              <p className="bq-big bq-camp-amt">
                <Dots /> <span>أوقية</span>
              </p>
            ) : cm.collected > 0 ? (
              <>
                <p className="bq-big bq-camp-amt">
                  <Num>{fmt(cm.collected)}</Num> <span>أوقية</span>
                </p>
                {target > 0 && (
                  <p className="bq-of">
                    جُمعت من هدف <Num className="bq-strong">{fmt(target)}</Num> أوقية
                  </p>
                )}
                {pct !== null && (
                  <div className="bq-track-row">
                    <Track f={pct / 100} label={`${pct}% من الهدف`} />
                    <Num className="bq-track-p">{pct}%</Num>
                  </div>
                )}
              </>
            ) : (
              <p className="bq-camp-none">
                لم تُجمع مساهمات بعد.
                {target > 0 && (
                  <>
                    {" "}
                    الهدف <Num className="bq-strong">{fmt(target)}</Num> أوقية.
                  </>
                )}
              </p>
            )}
            <ul className="bq-facts3">
              <li>
                {I.people(20)}
                <span className="bq-f3-k">المساهمون</span>
                <span className="bq-f3-v">
                  <Num>{c.participantsPaid}</Num>
                </span>
              </li>
              {!!cm && target > 0 && cm.collected > 0 && (
                <li>
                  {I.coins(20)}
                  <span className="bq-f3-k">الباقي</span>
                  <span className="bq-f3-v">
                    <Num>{fmt(Math.max(0, target - cm.collected))}</Num>
                  </span>
                </li>
              )}
              {c.deadline && (
                <li>
                  {I.calendar(20)}
                  <span className="bq-f3-k">ينتهي</span>
                  <span className="bq-f3-v">{dayWords(c.deadline)}</span>
                </li>
              )}
            </ul>
            <p className="bq-hint">يمكن لكل الأعضاء وأهل القرية المساهمة.</p>
          </section>

          <section className="bq-sec bq-rv" data-rv="don-how" aria-labelledby="bq-how-h">
            <h2 id="bq-how-h">كيف أساهم؟</h2>
            {accounts.some((x) => x.active) ? (
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
