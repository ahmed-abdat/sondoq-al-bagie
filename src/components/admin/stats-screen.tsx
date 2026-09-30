"use client";
// «الإحصاءات» design a (owner pick, proto/admin b591016): numbers first, for villagers in a
// WhatsApp group. Green = paid, soft grey = not yet, a label on every bar, no names, no red.
// Every number comes from `d.stats` (computed once in the data door), never recounted here.
import type { ReactNode } from "react";
import { month, Num, useP, X, Back } from "./kit";
import { pct } from "./stats";
import type { PCampaign, PLevy } from "./types";
import "./stats.css";

const N = ({ v }: { v: number }) => <Num>{v.toLocaleString("en").replace(/,/g, " ")}</Num>;
const P = ({ v }: { v: number }) => <Num>{`${v}٪`}</Num>;

/** One bar: green = paid, grey track = not yet. */
function HBar({ ok, all }: { ok: number; all: number }) {
  const p = pct(ok, all);
  return (
    <span className="st-hbar" role="img" aria-label={`${p}٪`}>
      <span className="st-hbar-fill" style={{ width: `${Math.max(p, 2)}%` }} />
    </span>
  );
}
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="st-card" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** The year's fees: paid up to the due month, by group, per month, how far behind. */
export function FeesCard() {
  const { d } = useP();
  const s = d.stats.fees;
  const groups = [
    { k: "A", l: "المجموعة أ", ...s.A },
    { k: "B", l: "المجموعة ب", ...s.B },
  ].filter((g) => g.total > 0);
  return (
    <Card title={`الرسوم الشهرية ${d.year}`}>
      <p className="st-hero">
        <P v={s.pct} />
      </p>
      <p className="st-lead">
        دفعوا كل ما عليهم حتى {month(d.due)}: <N v={s.paid} /> من <N v={s.total} /> عضوًا.
      </p>
      <HBar ok={s.paid} all={s.total} />
      {groups.length > 1 && (
        <div className="st-pair">
          {groups.map((g) => (
            <div key={g.k}>
              <span className="st-k">{g.l}</span>
              <b className="st-v">
                <P v={g.pct} />
              </b>
              <span className="st-k">
                <N v={g.paid} /> من <N v={g.total} />
              </span>
              <HBar ok={g.paid} all={g.total} />
            </div>
          ))}
        </div>
      )}
      <h3>كم عضوًا دفع كل شهر</h3>
      <div className="st-months" role="img" aria-label="كم عضوًا دفع كل شهر">
        {Array.from({ length: 12 }, (_, i) => {
          const m = s.months[i];
          return (
            <span key={i} className={m ? "" : "st-future"}>
              <em>{m ? <N v={m.paid} /> : ""}</em>
              <i>
                <u style={{ height: `${m ? pct(m.paid, s.total) : 0}%` }} />
              </i>
              <small>
                <Num>{i + 1}</Num>
              </small>
            </span>
          );
        })}
      </div>
      <h3>من بقيت عليه رسوم</h3>
      <div className="st-trio">
        {[
          { l: "شهر واحد", n: s.owe.one },
          { l: "شهران أو 3", n: s.owe.twoThree },
          { l: "4 أشهر أو أكثر", n: s.owe.fourPlus },
        ].map((b) => (
          <div key={b.l}>
            <b className="st-v">
              <N v={b.n} />
            </b>
            <span className="st-k">{b.l}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** One لوحة: paid / not yet / exempt, collected vs expected, by group, days open. */
export function LevyCard({ l, title }: { l: PLevy; title?: string }) {
  const { d } = useP();
  const s = d.stats.levies[l.id];
  if (!s) return null;
  const owing = s.paid + s.notYet;
  const groups = [
    { k: "A", l: "المجموعة أ", ...s.A },
    { k: "B", l: "المجموعة ب", ...s.B },
  ].filter((g) => g.total > 0);
  return (
    <Card title={title ?? `لوحة ${l.title}`}>
      <p className="st-hero">
        <P v={s.pct} />
      </p>
      <p className="st-lead">
        دفعوا نصيبهم.
        {s.days !== null && (
          <>
            {" "}
            فُتحت قبل <N v={s.days} /> يومًا.
          </>
        )}
      </p>
      <HBar ok={s.paid} all={owing} />
      <div className="st-trio">
        <div>
          <b className="st-v st-ok">
            <N v={s.paid} />
          </b>
          <span className="st-k">{X.check(16)} دفعوا</span>
        </div>
        <div>
          <b className="st-v">
            <N v={s.notYet} />
          </b>
          <span className="st-k">لم يدفعوا بعد</span>
        </div>
        <div>
          <b className="st-v">
            <N v={s.exempt} />
          </b>
          <span className="st-k">معفون</span>
        </div>
      </div>
      <p className="st-lead">
        جُمع <N v={s.collected} /> من <N v={s.expected} /> أوقية.
      </p>
      {groups.length > 1 && (
        <div className="st-pair">
          {groups.map((g) => (
            <div key={g.k}>
              <span className="st-k">{g.l}</span>
              <b className="st-v">
                <P v={g.pct} />
              </b>
              <HBar ok={g.paid} all={g.total} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** One تبرع: collected vs target, how many gave, share of members. */
export function GiftCard({ c, title }: { c: PCampaign; title?: string }) {
  const { d } = useP();
  const s = d.stats.campaigns[c.id];
  if (!s) return null;
  return (
    <Card title={title ?? `تبرع: ${c.title}`}>
      <p className="st-hero">
        <N v={s.collected} /> <span className="st-unit">أوقية</span>
      </p>
      {s.pctTarget !== null && (
        <>
          <p className="st-lead">
            من هدف <N v={s.target} /> أوقية (<P v={s.pctTarget} />
            ).
          </p>
          <HBar ok={s.collected} all={s.target} />
        </>
      )}
      <div className="st-trio">
        <div>
          <b className="st-v">
            <N v={s.givers} />
          </b>
          <span className="st-k">تبرّعوا</span>
        </div>
        <div>
          <b className="st-v">
            <N v={s.members} />
          </b>
          <span className="st-k">من الأعضاء</span>
        </div>
        <div>
          <b className="st-v">
            <N v={s.outside} />
          </b>
          <span className="st-k">من خارج الرابطة</span>
        </div>
      </div>
      <p className="st-foot">
        تبرّع <P v={s.pctMembers} /> من أعضاء الرابطة.
      </p>
    </Card>
  );
}

export function StatsScreen() {
  const { d } = useP();
  const levies = d.levies.filter((l) => l.status === "open");
  const gifts = d.campaigns.filter((c) => c.status === "open");
  return (
    <div className="pa-page st">
      <Back to="reports" label="التقارير" />
      <header className="pa-title">
        <h1>الإحصاءات</h1>
      </header>
      <p className="pa-hint">بلا أسماء. الأخضر: دفعوا. الرمادي: لم يدفعوا بعد.</p>
      <FeesCard />
      {levies.map((l) => (
        <LevyCard key={l.id} l={l} />
      ))}
      {gifts.map((c) => (
        <GiftCard key={c.id} c={c} />
      ))}
    </div>
  );
}
