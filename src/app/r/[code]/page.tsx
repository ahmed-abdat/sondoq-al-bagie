import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ASSOC, dayDate, fmt, monthsInWords } from "@/components/app/derive";
import { I } from "@/components/app/icons";
import { Receipt } from "@/components/app/receipt";
import { fromVerified } from "@/components/app/receipt-model";
import * as src from "@/components/app/source";

export const metadata: Metadata = {
  title: "التحقق من وصل · صندوق البقيع",
  robots: { index: false },
};

const Num = ({ children }: { children: React.ReactNode }) => (
  <bdi dir="ltr" className="bq-num">
    {children}
  </bdi>
);

/** Public receipt check, reached from the receipt's QR or code. Always fresh from the server. */
export default async function VerifyPage({ params }: PageProps<"/r/[code]">) {
  await connection();
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).trim().toUpperCase().slice(0, 40);
  const v = await src.receipt(code);
  const r = fromVerified(v);
  const st = r?.status;
  const demoReceipt = src.demoMode && code.startsWith("BQ-DEMO-");
  if (!r && !demoReceipt) notFound();
  return (
    <main className="bq-verify">
      <header className="bq-verify-h">
        <span className="bq-logo">
          <Image src="/logo.jpg" alt="شعار الرابطة" width={96} height={96} priority />
        </span>
        <span className="bq-brand-t">
          <strong>التحقق من وصل</strong>
          <span>{ASSOC}</span>
        </span>
      </header>

      {!r || !st ? (
        <section className="bq-verify-s is-none">
          <span className="bq-verify-i">{I.clock(32)}</span>
          <h1>وصل من النسخة التجريبية</h1>
          <p className="bq-lead">
            الرمز <Num>{code}</Num> صدر في النسخة التجريبية، وهي لا تحفظ شيئًا. في النسخة الحقيقية
            تظهر هنا تفاصيل الوصل.
          </p>
        </section>
      ) : st.kind === "cancelled" ? (
        <section className="bq-verify-s is-void">
          <span className="bq-verify-i">{I.ban(32)}</span>
          <h1>أُلغي هذا الوصل</h1>
          <p className="bq-lead">هذا الوصل لا يُحسب. الدفعة الصحيحة لها وصل آخر.</p>
        </section>
      ) : (
        <section className="bq-verify-s is-ok">
          <span className="bq-verify-i">{I.check(36)}</span>
          <h1>وصل صحيح</h1>
          <p className="bq-lead">سجّلته الرابطة وأكّده أمين الصندوق.</p>
        </section>
      )}

      {r && st && st.kind !== "pending" && (
        <dl className="bq-facts">
          <div>
            <dt>الاسم</dt>
            <dd>{r.payer}</dd>
          </div>
          <div>
            <dt>المبلغ</dt>
            <dd>
              <Num>{fmt(r.amount)}</Num> أوقية
            </dd>
          </div>
          <div className="is-wide">
            <dt>عن</dt>
            <dd>
              {[
                ...r.covers.map(
                  (c) =>
                    `رسوم ${monthsInWords(c.months, c.year)}${r.covers.length > 1 ? ` (${c.name})` : ""}`,
                ),
                ...r.campaigns.map((t) => `مساهمة في ${t}`),
              ].join("، ")}
            </dd>
          </div>
          <div>
            <dt>التاريخ</dt>
            <dd>{dayDate(st.at)}</dd>
          </div>
          {st.by && (
            <div>
              <dt>أكّده</dt>
              <dd>
                {st.by}
                {st.role ? `، ${st.role}` : ""}
              </dd>
            </div>
          )}
          <div className="is-wide">
            <dt>رمز التحقق</dt>
            <dd>
              <Num>{r.code}</Num>
            </dd>
          </div>
        </dl>
      )}

      {r && st?.kind === "confirmed" && (
        <details className="bq-verify-rc">
          <summary className="bq-link bq-press">عرض الوصل {I.chev(18)}</summary>
          <div className="bq-rc-sheet">
            <Receipt r={r} audience="public" />
          </div>
        </details>
      )}

      <p className="bq-hint">لا نعرض أرقام الهواتف ولا صور التحويل في هذه الصفحة.</p>
      <Link className="bq-btn bq-btn-soft bq-btn-lg bq-press" href="/">
        افتح صندوق البقيع
      </Link>
    </main>
  );
}
