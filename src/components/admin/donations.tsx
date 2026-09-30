"use client";
// «التبرعات» (owner pick B): voluntary donations (تبرع) and fixed shares (لوحة). A لوحة page shows
// ✓ / لم يدفع بعد / معفى per member; only «مسؤول» creates, closes, exempts or changes a share.
// Analytics (plan §10): counts and percentages, no names.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOnline } from "@/components/providers";
import { useAct } from "@/components/app/act";
import { memberCount } from "@/components/app/derive";
import { DateField } from "@/components/app/date-field";
import { sendOnce, useOnceId } from "@/components/app/once-id";
import { failure } from "@/lib/data/errors";
import { parseAmount, toWesternDigits } from "@/lib/money";
import {
  Avatar,
  Back,
  Bar,
  Chips,
  day,
  fmt,
  levyShare,
  Money,
  paidLine,
  Num,
  Seg,
  Sheet,
  useP,
  Wallet,
  X,
} from "./kit";
import { ExpenseSheet } from "./expense-sheet";
import { MemberPicker } from "./member-picker";
import { EditCampaignSheet, NewCampaignSheet } from "./manage-sheets";
import { ReportSheet } from "./report-doc";
import { GiftCard, LevyCard } from "./stats-screen";
import type { PLevy, PMember } from "./types";
import "./dir-b.css";

type Res = { ok: true } | { ok: false; message: string };
/** One write: busy flag, error line, refresh on success. */
function useWrite() {
  const router = useRouter();
  const online = useOnline();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async (f: () => Promise<Res>, done: () => void) => {
    if (busy) return;
    setBusy(true);
    setErr("");
    let r: Res;
    try {
      r = await f();
    } catch {
      r = failure("network");
    }
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    router.refresh();
    done();
  };
  return { busy, err, run, online };
}
function Err({ err }: { err: string }) {
  return err ? (
    <p className="pa-alert" role="alert">
      {err}
    </p>
  ) : null;
}
const amountOf = (s: string) => Math.round(parseAmount(toWesternDigits(s)) ?? 0);

/* ───────── the list ───────── */
export function CampaignsScreen() {
  const { d, href } = useP();
  const [kind, setKind] = useState<"gift" | "levy">("gift");
  const [add, setAdd] = useState(false);
  const open = d.campaigns.filter((c) => c.status === "open");
  const closed = d.campaigns.filter((c) => c.status === "closed");
  return (
    <div className="pa-page">
      <header className="pa-title">
        <h1>التبرعات</h1>
        {d.me.admin && (
          <button
            type="button"
            className="pa-btn pa-btn-primary pa-btn-sm"
            onClick={() => setAdd(true)}
          >
            {X.plus(20)} {kind === "gift" ? "تبرع جديد" : "لوحة جديدة"}
          </button>
        )}
      </header>
      <Seg
        label="النوع"
        value={kind}
        onChange={setKind}
        options={[
          { k: "gift", l: `تبرعات (${d.campaigns.length})` },
          { k: "levy", l: `لوحات (${d.levies.length})` },
        ]}
      />
      {kind === "gift" ? (
        <>
          <p className="pa-hint">يساهم من يريد، من الأعضاء أو من خارج الرابطة.</p>
          {!open.length && <p className="pa-empty">لا تبرع مفتوح الآن.</p>}
          <ul className="pb-camps">
            {open.map((c) => (
              <li key={c.id}>
                <Link href={href(`campaigns/${c.id}`)} className="pb-camp">
                  <b>{c.title}</b>
                  <span className="pb-camp-n">
                    <Money v={c.collected} />
                    {c.target > 0 && (
                      <small>
                        {" "}
                        من <Money v={c.target} />
                      </small>
                    )}
                  </span>
                  {c.target > 0 && <Bar value={c.collected} max={c.target} gold />}
                  <small>
                    المساهمون: <Num>{c.gifts.length}</Num>
                    {c.deadline ? ` · آخر يوم ${day(c.deadline)}` : ""}
                  </small>
                </Link>
              </li>
            ))}
          </ul>
          {closed.length > 0 && (
            <section className="pa-sec">
              <h2>مغلقة</h2>
              <ul className="pa-rows">
                {closed.map((c) => (
                  <li key={c.id}>
                    <Link href={href(`campaigns/${c.id}`)} className="pa-row">
                      <span className="pa-ic">{X.heart(22)}</span>
                      <span className="pa-row-t">
                        <b>{c.title}</b>
                        <small>
                          جُمع <Money v={c.collected} />
                        </small>
                      </span>
                      {X.go(20)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <>
          <p className="pa-hint">مبلغ ثابت على كل عضو. ما لم يدفعه يبقى من متأخراته.</p>
          {!d.levies.length && <p className="pa-empty">لا لوحات بعد.</p>}
          <ul className="pa-rows">
            {d.levies.map((l) => {
              const s = d.stats.levies[l.id];
              return (
                <li key={l.id}>
                  <Link href={href(`campaigns/${l.id}`)} className="pa-row">
                    <span className="pa-ic pa-ic-g">{X.list(22)}</span>
                    <span className="pa-row-t">
                      <b>{l.title}</b>
                      <small>
                        <Money v={l.perMember} /> على كل عضو
                        {l.status === "closed" ? " · مغلقة" : ""}
                      </small>
                      <small>
                        {paidLine(s.paid, s.notYet)} · <Num>{`${s.pct}٪`}</Num>
                      </small>
                    </span>
                    {X.go(20)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {add && kind === "gift" && <NewCampaignSheet onClose={() => setAdd(false)} />}
      {add && kind === "levy" && <NewLevySheet onClose={() => setAdd(false)} />}
    </div>
  );
}

/* ───────── one تبرع ───────── */
export function CampaignScreen({ id }: { id: string }) {
  const { d, href } = useP();
  const c = d.campaigns.find((x) => x.id === id);
  const [exp, setExp] = useState(false);
  const [share, setShare] = useState(false);
  const [close, setClose] = useState(false);
  const [edit, setEdit] = useState(false);
  if (!c)
    return (
      <div className="pa-page">
        <Back to="campaigns" label="التبرعات" />
        <p className="pa-empty">لا يوجد تبرع بهذا الرقم.</p>
      </div>
    );
  const left = c.collected - c.spent;
  return (
    <div className="pa-page">
      <Back to="campaigns" label="التبرعات" />
      <header className="pa-camp-h">
        <span className="pa-kind">{c.status === "open" ? "تبرع مفتوح" : "تبرع مغلق"}</span>
        <h1>{c.title}</h1>
        {c.purpose && <p className="pa-sub">{c.purpose}</p>}
      </header>
      <section className="pa-tonal pb-camp-sum">
        <div className="pa-kv3">
          <span>
            <small>المصاريف</small>
            <Money v={c.spent} />
          </span>
          <span>
            <small>بقي في التبرع</small>
            <Money v={left} />
          </span>
          <span>
            <small>آخر يوم</small>
            <b>{c.deadline ? day(c.deadline) : "بلا موعد"}</b>
          </span>
        </div>
      </section>
      <div className="pa-actions">
        {c.status === "open" && (
          <Link href={href("record", { c: c.id })} className="pa-btn pa-btn-primary">
            {X.plus(20)} سجّل مساهمة
          </Link>
        )}
        {c.status === "open" && (
          <button type="button" className="pa-btn pa-btn-tonal" onClick={() => setExp(true)}>
            {X.bag(20)} سجّل مصروفًا
          </button>
        )}
        <button type="button" className="pa-btn pa-btn-tonal" onClick={() => setShare(true)}>
          {X.share(20)} شارك التقرير
        </button>
      </div>
      <GiftCard c={c} title="الإحصاءات" />
      <section className="pa-sec">
        <h2>
          المساهمون (<Num>{c.gifts.length}</Num>)
        </h2>
        {c.gifts.length ? (
          <ul className="pa-rows">
            {c.gifts.map((g, i) => (
              <li key={i}>
                <div className="pa-row pa-row-plain">
                  {g.ref ? (
                    <Avatar refs={g.ref} />
                  ) : (
                    <span className="pa-ic pa-ic-gold">{X.heart(22)}</span>
                  )}
                  <span className="pa-row-t">
                    <b>{g.name}</b>
                    <small className="pb-inline">
                      {day(g.at)}
                      {g.method !== "cash" && (
                        <>
                          {" "}
                          · <Wallet method={g.method} size={18} />
                        </>
                      )}
                    </small>
                  </span>
                  <Money v={g.amount} unit={false} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pa-quiet">لم يساهم أحد بعد.</p>
        )}
      </section>
      <section className="pa-sec">
        <h2>المصاريف</h2>
        {c.spends.length ? (
          <ul className="pa-rows">
            {c.spends.map((x, i) => (
              <li key={i}>
                <div className="pa-row pa-row-plain">
                  <span className="pa-ic">{X.bag(22)}</span>
                  <span className="pa-row-t">
                    <b>{x.note}</b>
                    <small>{day(x.at)}</small>
                  </span>
                  <Money v={x.amount} unit={false} sign="−" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pa-quiet">لا مصاريف منه بعد.</p>
        )}
      </section>
      {d.me.admin && (
        <div className="pa-actions">
          <button type="button" className="pa-btn pa-btn-ghost" onClick={() => setEdit(true)}>
            {X.edit(20)} تعديل
          </button>
          {c.status === "open" && (
            <button type="button" className="pa-btn pa-btn-ghost" onClick={() => setClose(true)}>
              أغلق التبرع
            </button>
          )}
        </div>
      )}
      <ExpenseSheet open={exp} onClose={() => setExp(false)} campaign={c.id} />
      <ReportSheet
        open={share}
        onClose={() => setShare(false)}
        title={`تقرير ${c.title}`}
        req={{ kind: "campaign", id: c.id }}
      />
      {close && <CloseSheet id={c.id} left={left} gift onClose={() => setClose(false)} />}
      {edit && <EditCampaignSheet id={c.id} onClose={() => setEdit(false)} />}
    </div>
  );
}

/** «مسؤول» only. A donation's rest goes to the fund or stays in it; a لوحة's goes to the fund. */
function CloseSheet({
  id,
  left,
  gift,
  onClose,
}: {
  id: string;
  left: number;
  gift?: boolean;
  onClose: () => void;
}) {
  const { snack } = useP();
  const { closeCampaign } = useAct();
  const w = useWrite();
  const [to, setTo] = useState<"to_fund" | "keep">("to_fund");
  return (
    <Sheet
      open
      onClose={onClose}
      title={gift ? "أغلق التبرع" : "أغلق اللوحة"}
      foot={
        <>
          <Err err={w.err} />
          <button
            type="button"
            className="pa-btn pa-btn-primary pa-btn-block"
            disabled={w.busy || !w.online}
            onClick={() =>
              w.run(
                async () => {
                  const r = await closeCampaign({ id, surplusAction: to });
                  return r.ok ? { ok: true } : r;
                },
                () => {
                  onClose();
                  snack(gift ? "أُغلق التبرع." : "أُغلقت اللوحة.");
                },
              )
            }
          >
            {w.busy ? "جارٍ الإغلاق…" : "أغلق"}
          </button>
        </>
      }
    >
      {gift ? (
        <>
          <p className="pa-quiet">
            بقي فيه <Money v={left} />. أين يذهب الباقي؟
          </p>
          <Chips
            label="الباقي"
            value={to}
            onChange={setTo}
            options={[
              { k: "to_fund", l: "إلى الصندوق" },
              { k: "keep", l: "يبقى في التبرع" },
            ]}
          />
        </>
      ) : (
        <p className="pa-quiet">
          لا تُقبل بعدها أنصبة جديدة. ما بقي على الأعضاء يبقى من متأخراتهم.
        </p>
      )}
    </Sheet>
  );
}

/* ───────── one لوحة ───────── */
type LF = "no" | "yes" | "ex";
const shareState = (l: PLevy, ref: string): LF =>
  l.exemptRefs?.includes(ref) ? "ex" : l.paidRefs.includes(ref) ? "yes" : "no";

export function LevyScreen({ id }: { id: string }) {
  const { d, href } = useP();
  const l = d.levies.find((x) => x.id === id);
  const [f, setF] = useState<LF>("no");
  const [share, setShare] = useState(false);
  const [close, setClose] = useState(false);
  const [who, setWho] = useState<PMember | null>(null);
  const [exp, setExp] = useState(false);
  if (!l)
    return (
      <div className="pa-page">
        <Back to="campaigns" label="التبرعات" />
        <p className="pa-empty">لا توجد لوحة بهذا الرقم.</p>
      </div>
    );
  const s = d.stats.levies[l.id];
  const byRef = new Map(d.members.map((m) => [m.ref, m]));
  const people = l.refs.flatMap((r) => (byRef.has(r) ? [byRef.get(r)!] : []));
  const list = people.filter((m) => shareState(l, m.ref) === f);
  return (
    <div className="pa-page">
      <Back to="campaigns" label="التبرعات" />
      <header className="pa-camp-h">
        <span className="pa-kind pa-kind-levy">
          {l.status === "open" ? "لوحة مفتوحة" : "لوحة مغلقة"}
        </span>
        <h1>{l.title}</h1>
        {l.purpose && <p className="pa-sub">{l.purpose}</p>}
        <p className="pa-sub">
          على كل عضو <Money v={l.perMember} />
          {s.days !== null && (
            <>
              {" "}
              · مفتوحة منذ <Num>{s.days}</Num> يومًا
            </>
          )}
        </p>
      </header>
      <div className="pa-actions">
        {l.status === "open" && (
          <button type="button" className="pa-btn pa-btn-tonal" onClick={() => setExp(true)}>
            {X.bag(20)} سجّل مصروفًا
          </button>
        )}
        <button type="button" className="pa-btn pa-btn-tonal" onClick={() => setShare(true)}>
          {X.share(20)} شارك التقرير
        </button>
      </div>
      <ExpenseSheet open={exp} onClose={() => setExp(false)} campaign={l.id} />
      <LevyCard l={l} title="الإحصاءات" />
      <Seg
        label="من دفع"
        value={f}
        onChange={setF}
        options={[
          { k: "no", l: `لم يدفع بعد (${s.notYet})` },
          { k: "yes", l: `دفعوا (${s.paid})` },
          ...(s.exempt ? [{ k: "ex" as LF, l: `معفى (${s.exempt})` }] : []),
        ]}
      />
      <ul className="pa-rows">
        {list.map((m) => {
          const st = shareState(l, m.ref);
          return (
            <li key={m.ref}>
              <button type="button" className="pa-row" onClick={() => setWho(m)}>
                <Avatar refs={m.ref} />
                <span className="pa-row-t">
                  <b>{m.name}</b>
                  <small>
                    {st === "yes" ? "دفع نصيبه" : st === "ex" ? "معفى" : "لم يدفع بعد"}
                    {levyShare(l, m.ref) !== l.perMember && (
                      <>
                        {" "}
                        · نصيبه <Money v={levyShare(l, m.ref)} />
                      </>
                    )}
                  </small>
                </span>
                <span className="pa-tick-big">{st === "yes" ? "✓" : ""}</span>
              </button>
            </li>
          );
        })}
        {!list.length && <li className="pa-empty">لا أحد هنا.</li>}
      </ul>
      {l.status === "open" && d.me.admin && (
        <button
          type="button"
          className="pa-btn pa-btn-ghost pa-btn-block"
          onClick={() => setClose(true)}
        >
          أغلق اللوحة
        </button>
      )}
      <ReportSheet
        open={share}
        onClose={() => setShare(false)}
        title={`لوحة ${l.title}`}
        req={{ kind: "campaign", id: l.id }}
      />
      {close && <CloseSheet id={l.id} left={0} onClose={() => setClose(false)} />}
      {who && (
        <ShareSheet key={who.ref} l={l} m={who} onClose={() => setWho(null)} recordHref={href} />
      )}
    </div>
  );
}

/** One member's share: record it, open his statement; «مسؤول»: change it, exempt, undo exempt. */
function ShareSheet({
  l,
  m,
  onClose,
  recordHref,
}: {
  l: PLevy;
  m: PMember;
  onClose: () => void;
  recordHref: (p: string, e?: Record<string, string>) => string;
}) {
  const { d, snack } = useP();
  const { setLevyShare, exemptLevyShare, unexemptLevyShare } = useAct();
  const w = useWrite();
  const st = shareState(l, m.ref);
  const [mode, setMode] = useState<null | "amount" | "exempt">(null);
  const [amt, setAmt] = useState(String(levyShare(l, m.ref)));
  const [why, setWhy] = useState("");
  const done = (msg: string) => () => {
    onClose();
    snack(msg);
  };
  return (
    <Sheet open onClose={onClose} title={m.name}>
      <p className="pa-quiet">
        {st === "yes" ? "دفع نصيبه" : st === "ex" ? "معفى من هذه اللوحة" : "لم يدفع بعد"} · نصيبه{" "}
        <Money v={levyShare(l, m.ref)} />
      </p>
      <div className="pa-actions pa-actions-col">
        {st === "no" && l.status === "open" && (
          <Link
            href={recordHref("record", { m: m.ref, levy: l.id })}
            className="pa-btn pa-btn-primary pa-btn-block"
          >
            {X.plus(20)} سجّل نصيبه
          </Link>
        )}
        <Link href={recordHref(`members/${m.ref}`)} className="pa-btn pa-btn-tonal pa-btn-block">
          كشف حسابه
        </Link>
        {d.me.admin && st === "no" && mode === null && (
          <>
            <button
              type="button"
              className="pa-btn pa-btn-ghost pa-btn-block"
              onClick={() => setMode("amount")}
            >
              غيّر نصيبه
            </button>
            <button
              type="button"
              className="pa-btn pa-btn-ghost pa-btn-block"
              onClick={() => setMode("exempt")}
            >
              أعفه من اللوحة
            </button>
          </>
        )}
        {d.me.admin && st === "ex" && (
          <button
            type="button"
            className="pa-btn pa-btn-ghost pa-btn-block"
            disabled={w.busy || !w.online}
            onClick={() =>
              w.run(async () => {
                const r = await unexemptLevyShare({ id: l.id, memberId: m.id });
                return r.ok ? { ok: true } : r;
              }, done("أُلغي الإعفاء. عاد نصيبه عليه."))
            }
          >
            ألغِ الإعفاء
          </button>
        )}
      </div>
      {mode === "amount" && (
        <>
          <label className="pa-field">
            <span>نصيبه بالأوقية القديمة</span>
            <input
              inputMode="numeric"
              dir="ltr"
              value={amt}
              onChange={(e) => setAmt(toWesternDigits(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="pa-btn pa-btn-primary pa-btn-block"
            disabled={!amountOf(amt) || w.busy || !w.online}
            onClick={() =>
              w.run(
                async () => {
                  const r = await setLevyShare({ id: l.id, memberId: m.id, amount: amountOf(amt) });
                  return r.ok ? { ok: true } : r;
                },
                done(`صار نصيبه ${fmt(amountOf(amt))} أوقية.`),
              )
            }
          >
            احفظ النصيب
          </button>
        </>
      )}
      {mode === "exempt" && (
        <>
          <label className="pa-field">
            <span>سبب الإعفاء</span>
            <input value={why} maxLength={200} onChange={(e) => setWhy(e.target.value)} />
          </label>
          <button
            type="button"
            className="pa-btn pa-btn-primary pa-btn-block"
            disabled={!why.trim() || w.busy || !w.online}
            onClick={() =>
              w.run(async () => {
                const r = await exemptLevyShare({ id: l.id, memberId: m.id, reason: why.trim() });
                return r.ok ? { ok: true } : r;
              }, done("أُعفي من هذه اللوحة."))
            }
          >
            أعفه
          </button>
        </>
      )}
      <Err err={w.err} />
    </Sheet>
  );
}

/* ───────── new تبرع / لوحة («مسؤول») ───────── */

type Who = "all" | "A" | "B" | "pick";
function NewLevySheet({ onClose }: { onClose: () => void }) {
  const { d, snack } = useP();
  const { createLevy } = useAct();
  const once = useOnceId();
  const w = useWrite();
  const [title, setTitle] = useState("");
  const [amt, setAmt] = useState("");
  const [twoAmounts, setTwoAmounts] = useState(false);
  const [amtB, setAmtB] = useState("");
  const [who, setWho] = useState<Who>("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [purpose, setPurpose] = useState("");
  const [deadline, setDeadline] = useState("");
  const active = d.members.filter((m) => m.status === "active");
  const members =
    who === "pick"
      ? active.filter((m) => picked.includes(m.id))
      : active.filter((m) => who === "all" || m.group === who);
  const amount = amountOf(amt);
  const amountB = twoAmounts ? amountOf(amtB) : 0;
  const next = !title.trim()
    ? "اكتب العنوان"
    : !amount
      ? "اكتب المبلغ"
      : twoAmounts && !amountB
        ? "اكتب مبلغ الفئة ب"
        : !members.length
          ? "اختر الأعضاء"
          : null;
  return (
    <Sheet
      open
      onClose={onClose}
      title="لوحة جديدة"
      foot={
        <>
          <Err err={w.err} />
          <button
            type="button"
            className="pa-btn pa-btn-primary pa-btn-block"
            disabled={!!next || w.busy || !w.online}
            onClick={() =>
              w.run(
                async () => {
                  const r = await sendOnce(once, (id) =>
                    createLevy({
                      id,
                      title: title.trim(),
                      amount,
                      amountB: twoAmounts ? amountB : undefined,
                      memberIds: members.map((m) => m.id),
                      purpose: purpose.trim() || undefined,
                      deadline: deadline || undefined,
                    }),
                  );
                  return r.ok ? { ok: true } : r;
                },
                () => {
                  onClose();
                  snack(`أُنشئت اللوحة على ${memberCount(members.length, "obl")}.`);
                },
              )
            }
          >
            {w.busy
              ? "جارٍ الحفظ…"
              : (next ?? `أنشئ اللوحة على ${memberCount(members.length, "obl")}`)}
          </button>
        </>
      }
    >
      <p className="pa-hint">مبلغ ثابت على كل عضو لحاجة معيّنة. ما لم يدفعه يبقى من متأخراته.</p>
      <label className="pa-field">
        <span>العنوان</span>
        <input
          value={title}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="مثل: علاج أحد الإخوة"
        />
      </label>
      <label className="pa-field">
        <span>{twoAmounts ? "المبلغ على عضو الفئة أ" : "المبلغ على كل عضو"}</span>
        <input
          inputMode="numeric"
          dir="ltr"
          value={amt}
          onChange={(e) => setAmt(toWesternDigits(e.target.value))}
          placeholder="بالأوقية القديمة"
        />
      </label>
      <label className="pa-check">
        <input
          type="checkbox"
          checked={twoAmounts}
          onChange={(e) => setTwoAmounts(e.target.checked)}
        />
        <span>مبلغ مختلف للفئة ب</span>
      </label>
      {twoAmounts && (
        <label className="pa-field">
          <span>المبلغ على عضو الفئة ب</span>
          <input
            inputMode="numeric"
            dir="ltr"
            value={amtB}
            onChange={(e) => setAmtB(toWesternDigits(e.target.value))}
          />
        </label>
      )}
      <p className="pa-label">على من؟</p>
      <Chips
        label="على من"
        value={who}
        onChange={setWho}
        options={[
          { k: "all", l: "كل الأعضاء" },
          { k: "A", l: "الفئة أ" },
          { k: "B", l: "الفئة ب" },
          { k: "pick", l: "أختارهم" },
        ]}
      />
      {/* the shared picker: typing finds anyone; before typing, the chosen ones (tap = remove) */}
      {who === "pick" && (
        <MemberPicker
          label="أضف عضوًا"
          selected={members.map((m) => m.ref)}
          start={members}
          startHint="من اخترتهم:"
          onPick={(m) =>
            setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]))
          }
        />
      )}
      <p className="pa-hint">يمكنك بعد الإنشاء تغيير نصيب عضو أو إعفاؤه من صفحة اللوحة.</p>
      <label className="pa-field">
        <span>لماذا؟ (اختياري)</span>
        <input value={purpose} maxLength={500} onChange={(e) => setPurpose(e.target.value)} />
      </label>
      <div className="pa-field">
        <span>آخر يوم (اختياري)</span>
        <DateField value={deadline} onChange={setDeadline} label="آخر يوم" noPast optional />
      </div>
    </Sheet>
  );
}
