"use client";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ASSOC, fmt } from "./derive";
import { I } from "./icons";
import { Dots, MoneyHint, useMoney } from "./money";
import { Num, Roll } from "./num";

/** No money here: the figures come from useMoney() (committee or member), else «•••». */
export type HeroData = {
  /** «آخر تحديث: …» or, for the committee, the pending count */
  note: ReactNode;
  /** «منذ 1 يناير 2026» */
  term?: string | null;
  /** the fund's WhatsApp, for «اطلب رابطًا جديدًا في واتساب» in the hint */
  whatsapp?: string | null;
};

/**
 * The one green field. Panel (desktop aside): brand, balance, two stats, a note. Band (mobile
 * home, owner pick «a»): short, brand + balance + one freshness line with «كيف حُسب الرصيد؟»
 * (collected, spent and the start date live on /accounts), so the member lookup shows sooner.
 */
export function Hero({ data, variant }: { data: HeroData; variant: "band" | "panel" }) {
  const m = useMoney();
  const s = m?.summary;
  const band = variant === "band";
  return (
    <section className={`bq-hero is-${variant}`} aria-label="رصيد الصندوق">
      <div className="bq-brand">
        <span className={`bq-logo ${band ? "bq-logo-s" : ""}`}>
          <Image src="/logo.jpg" alt="شعار الرابطة" width={96} height={96} priority />
        </span>
        <span className="bq-brand-t">
          <strong>صندوق الرابطة</strong>
          <span>{ASSOC}</span>
        </span>
      </div>
      <div className="bq-hero-bal" data-hero-bal={variant === "band" ? "" : undefined}>
        <p className="bq-hero-l">
          في الصندوق الآن
          {!s && (
            <span className="bq-hero-lock" aria-hidden="true">
              {I.lock(16)}
            </span>
          )}
        </p>
        <p className="bq-hero-n">
          {s ? <Roll value={s.balance} /> : <Dots className="bq-dots-hero" />}
          <span className="bq-hero-u">أوقية</span>
        </p>
      </div>
      {band ? (
        <p className="bq-hero-t">
          {data.note} ·{" "}
          <Link href="/accounts#bq-sum" className="bq-hero-how">
            كيف حُسب الرصيد؟
          </Link>
        </p>
      ) : (
        <dl className="bq-hero-stats">
          <div>
            <dt>جُمع هذا العام</dt>
            <dd>{s ? <Roll value={s.collectedThisYear} /> : <Dots />}</dd>
          </div>
          <div>
            <dt>صُرف هذا العام</dt>
            <dd>{s ? <Num>{fmt(s.spentThisYear)}</Num> : <Dots />}</dd>
          </div>
        </dl>
      )}
      <MoneyHint tone="green" whatsapp={data.whatsapp} />
      {!band && (
        <p className="bq-hero-t">
          {data.note}
          {data.term ? (
            <>
              <br />
              {data.term}
            </>
          ) : null}
        </p>
      )}
    </section>
  );
}
