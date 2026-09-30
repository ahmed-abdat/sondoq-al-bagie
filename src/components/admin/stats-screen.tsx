"use client";
// «الإحصاءات» design a (owner pick): numbers first, for villagers in a WhatsApp group. One page,
// not a stack of boxes: the fees are the story (one big percentage), the لوحات and تبرعات follow
// as short blocks. Green = paid, soft grey = not yet, a number on every bar, no names, no red.
// Every number comes from `d.stats` (the «الإحصاءات» read, same as the report); nothing recounted.
import { useState } from "react";
import { memberNoun } from "@/components/app/derive";

import { Back, month, Num, useP, X } from "./kit";
import { ReportSheet } from "./report-doc";
import { exemptWords, pct } from "./stats";
import type { PCampaign, PLevy } from "./types";
import "./stats.css";

const N = ({ v }: { v: number }) => <Num>{v.toLocaleString("en").replace(/,/g, " ")}</Num>;
const P = ({ v }: { v: number }) => <Num>{`${v}٪`}</Num>;

/** One bar: green = paid, grey track = not yet. */
function Bar({ ok, all, thin }: { ok: number; all: number; thin?: boolean }) {
  const p = pct(ok, all);
  return (
    <span className={`st-bar ${thin ? "st-bar-thin" : ""}`} aria-hidden="true">
      <span style={{ width: `${ok > 0 ? Math.max(p, 2) : 0}%` }} />
    </span>
  );
}

/** «الفئة أ   ████░░  60٪» — a label, a bar and its number on one line. */
function Row({ label, ok, all }: { label: string; ok: number; all: number }) {
  return (
    <div className="st-row" role="group" aria-label={`${label}: ${pct(ok, all)}٪`}>
      <span className="st-row-l">{label}</span>
      <Bar ok={ok} all={all} thin />
      <b className="st-row-v">
        <P v={pct(ok, all)} />
      </b>
    </div>
  );
}

/** The year's fees: the one big number, then groups, months and how far behind. */
export function FeesCard() {
  const { d } = useP();
  const s = d.stats.fees;
  const groups = [
    { k: "A", l: "الفئة أ", ...s.A },
    { k: "B", l: "الفئة ب", ...s.B },
  ].filter((g) => g.total > 0);
  const top = Math.max(1, s.total);
  const behind = s.owe.one + s.owe.twoThree + s.owe.fourPlus;
  return (
    <section className="st-fees" aria-labelledby="st-fees-h">
      <h2 id="st-fees-h">المستحقات الشهرية {d.year}</h2>
      <p className="st-hero">
        <P v={s.pct} />
      </p>
      <p className="st-lead">
        دفعوا كل ما عليهم حتى {month(d.due)}
        <span className="st-sub">
          <N v={s.paid} /> من <N v={s.total} /> {memberNoun(s.total)}
          {s.previous !== null && (
            <>
              {" "}
              · السنة الماضية <P v={s.previous} />
            </>
          )}
        </span>
      </p>
      <Bar ok={s.paid} all={s.total} />
      {groups.length > 1 && (
        <div className="st-rows">
          {groups.map((g) => (
            <Row key={g.k} label={g.l} ok={g.paid} all={g.total} />
          ))}
        </div>
      )}

      <h3>كم عضوًا دفع كل شهر</h3>
      <div className="st-months" role="list" aria-label="كم عضوًا دفع كل شهر">
        {s.months.map((m) => {
          const started = m.month <= d.due;
          return (
            <span
              key={m.month}
              role="listitem"
              className={started ? "" : "st-ahead"}
              aria-label={`${month(m.month)}: دفع ${m.paid}`}
            >
              <em aria-hidden="true">{m.paid > 0 || started ? <N v={m.paid} /> : ""}</em>
              <i aria-hidden="true">
                <u style={{ height: `${(m.paid / top) * 100}%` }} />
              </i>
              <small aria-hidden="true">
                <Num>{m.month}</Num>
              </small>
            </span>
          );
        })}
      </div>

      {behind > 0 && (
        <>
          <h3>من بقيت عليه متأخرات</h3>
          <ul className="st-owe">
            {[
              { l: "شهر واحد", n: s.owe.one },
              { l: "شهران أو 3", n: s.owe.twoThree },
              { l: "4 أشهر أو أكثر", n: s.owe.fourPlus },
            ].map((b) => (
              <li key={b.l}>
                <span className="st-row-l">{b.l}</span>
                <span className="st-owe-bar" aria-hidden="true">
                  <span style={{ width: `${b.n ? Math.max((b.n / behind) * 100, 3) : 0}%` }} />
                </span>
                <b className="st-row-v">
                  <N v={b.n} />
                </b>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** One لوحة: the share who paid, then paid / not yet / exempt and the money. */
export function LevyCard({ l, title }: { l: PLevy; title?: string }) {
  const { d } = useP();
  const s = d.stats.levies[l.id];
  if (!s) return null;
  const owing = s.paid + s.notYet;
  const groups = [
    { k: "A", l: "الفئة أ", ...s.A },
    { k: "B", l: "الفئة ب", ...s.B },
  ].filter((g) => g.total > 0);
  return (
    <section className="st-block" aria-label={title ?? `لوحة ${l.title}`}>
      <h3>{title ?? `لوحة ${l.title}`}</h3>
      <p className="st-mid">
        <P v={s.pct} /> <span>دفعوا نصيبهم</span>
      </p>
      <Bar ok={s.paid} all={owing} />
      <p className="st-counts">
        <span>
          <b className="st-ok">
            <N v={s.paid} />
          </b>{" "}
          دفعوا
        </span>
        <span>
          <b>
            <N v={s.notYet} />
          </b>{" "}
          لم يدفعوا بعد
        </span>
        {s.exempt > 0 && <span>{exemptWords(s.exempt)}</span>}
      </p>
      <p className="st-note">
        جُمع <N v={s.collected} /> من <N v={s.expected} /> أوقية
        {s.days !== null && (
          <>
            {" "}
            · فُتحت قبل <N v={s.days} /> يومًا
          </>
        )}
      </p>
      {groups.length > 1 && (
        <div className="st-rows">
          {groups.map((g) => (
            <Row key={g.k} label={g.l} ok={g.paid} all={g.total} />
          ))}
        </div>
      )}
    </section>
  );
}

/** One تبرع: collected against the target, then who gave. */
export function GiftCard({ c, title }: { c: PCampaign; title?: string }) {
  const { d } = useP();
  const s = d.stats.campaigns[c.id];
  if (!s) return null;
  return (
    <section className="st-block" aria-label={title ?? `تبرع: ${c.title}`}>
      <h3>{title ?? `تبرع: ${c.title}`}</h3>
      <p className="st-mid">
        <N v={s.collected} /> <span>أوقية</span>
      </p>
      {s.pctTarget !== null && (
        <>
          <Bar ok={s.collected} all={s.target} />
          <p className="st-note">
            <P v={s.pctTarget} /> من الهدف (<N v={s.target} /> أوقية)
          </p>
        </>
      )}
      <p className="st-counts">
        <span>
          <b>
            <N v={s.givers} />
          </b>{" "}
          تبرّعوا
        </span>
        <span>
          <b>
            <N v={s.members} />
          </b>{" "}
          من الأعضاء
        </span>
        <span>
          <b>
            <N v={s.outside} />
          </b>{" "}
          من خارج الرابطة
        </span>
      </p>
      <p className="st-note">
        تبرّع <P v={s.pctMembers} /> من أعضاء الرابطة.
      </p>
    </section>
  );
}

export function StatsScreen() {
  const { d } = useP();
  const levies = d.levies.filter((l) => l.status === "open");
  const gifts = d.campaigns.filter((c) => c.status === "open");
  const [share, setShare] = useState(false);
  return (
    <div className="pa-page st">
      <Back to="reports" label="التقارير" />
      <header className="pa-title">
        <h1>الإحصاءات</h1>
      </header>
      <p className="st-legend">
        <span className="st-key st-key-ok" aria-hidden="true" /> دفعوا
        <span className="st-key" aria-hidden="true" /> لم يدفعوا بعد · بلا أسماء
      </p>
      <FeesCard />
      {(levies.length > 0 || gifts.length > 0) && (
        <section className="st-more" aria-labelledby="st-more-h">
          <h2 id="st-more-h">اللوحات والتبرعات المفتوحة</h2>
          {levies.map((l) => (
            <LevyCard key={l.id} l={l} />
          ))}
          {gifts.map((c) => (
            <GiftCard key={c.id} c={c} />
          ))}
        </section>
      )}
      <button
        type="button"
        className="pa-btn pa-btn-primary pa-btn-block"
        onClick={() => setShare(true)}
      >
        {X.share(20)} شارك الإحصاءات في المجموعة
      </button>
      <ReportSheet
        open={share}
        onClose={() => setShare(false)}
        title="شارك الإحصاءات"
        req={{ kind: "stats", year: d.year }}
      />
    </div>
  );
}
