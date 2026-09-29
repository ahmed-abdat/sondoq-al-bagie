"use client";
import Image from "next/image";
import type { ReactNode } from "react";
import { ASSOC, fmt } from "./derive";
import { Num, Roll } from "./num";

export type HeroData = {
  balance: number;
  collected: number;
  spent: number;
  /** «آخر تحديث: …» or, for the committee, the pending count */
  note: ReactNode;
  /** «الدورة 2 · منذ 1 يناير 2026» */
  term?: string | null;
};

/** The one green field: brand, balance, two stats, a note. Band on mobile, panel on desktop. */
export function Hero({ data, variant }: { data: HeroData; variant: "band" | "panel" }) {
  return (
    <section className={`bq-hero is-${variant}`} aria-label="رصيد الصندوق">
      <div className="bq-brand">
        <span className="bq-logo">
          <Image src="/logo.jpg" alt="شعار الرابطة" width={96} height={96} priority />
        </span>
        <span className="bq-brand-t">
          <strong>صندوق الرابطة</strong>
          <span>{ASSOC}</span>
        </span>
      </div>
      <div className="bq-hero-bal" data-hero-bal={variant === "band" ? "" : undefined}>
        <p className="bq-hero-l">في الصندوق الآن</p>
        <p className="bq-hero-n">
          <Roll value={data.balance} />
          <span className="bq-hero-u">أوقية</span>
        </p>
      </div>
      <dl className="bq-hero-stats">
        <div>
          <dt>جُمع هذا العام</dt>
          <dd>
            <Roll value={data.collected} />
          </dd>
        </div>
        <div>
          <dt>صُرف هذا العام</dt>
          <dd>
            <Num>{fmt(data.spent)}</Num>
          </dd>
        </div>
      </dl>
      <p className="bq-hero-t">
        {data.note}
        {data.term ? (
          <>
            <br />
            {data.term}
          </>
        ) : null}
      </p>
    </section>
  );
}
