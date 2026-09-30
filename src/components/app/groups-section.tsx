"use client";
// «الفئات» (plan §11) inside الإعدادات: each fee group with its monthly amount and members.
// «المسؤول» only: a new group, a group's amount for a year, moving members (from a month, January
// next year by default; the preview says exactly who moves and who blocks it), retiring an empty
// group. Past months keep the amount they had; paper numbers (أ 12) never change.
import { MemberSearch } from "@/components/admin/member-picker";
import { AmountInput, amountValue } from "./amount-input";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OfflineWriteHint, useOnline } from "@/components/providers";
import { MONTHS_AR } from "@/lib/dates";
import { useAct } from "./act";
import { MonthPicker } from "./date-field";
import { fmt, memberCount } from "./derive";
import { I } from "./icons";
import { Num } from "./num";
import { Sheet } from "./sheet";
import { useSnack } from "./shell";
import type { GroupRow } from "./source";

type MoveResult = {
  moved: number;
  skippedAlreadyInTarget: number;
  blocked: { memberId: string; memberRef: string; name: string; reason: string }[];
  fromFee: number | null;
  toFee: number | null;
};

export type GroupMember = {
  memberId: string;
  memberRef: string;
  fullName: string;
  groupCode: string;
};

const n = amountValue;
const ymWords = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS_AR[m - 1]} ${y}`;
};

export function GroupsSection({
  groups,
  members,
  year,
  admin,
}: {
  groups: GroupRow[];
  members: GroupMember[];
  year: number;
  admin: boolean;
}) {
  const [sheet, setSheet] = useState<
    | null
    | { t: "new" }
    | { t: "fee"; g: GroupRow }
    | { t: "move"; from?: GroupRow }
    | { t: "retire"; g: GroupRow }
  >(null);
  const live = groups.filter((g) => g.retiredFrom === null || g.retiredFrom > year);
  const nameOf = (code: string) => groups.find((g) => g.code === code)?.name ?? code;
  return (
    <section className="bq-sec" aria-labelledby="bq-groups-h">
      <h2 id="bq-groups-h">الفئات والمستحقات الشهرية</h2>
      <p className="bq-lead">المستحقات الشهرية لكل فئة، وعدد أعضائها.</p>
      <ul className="bq-list">
        {live.map((g) => (
          <li key={g.code} className="bq-group-row">
            <span className="bq-row-m">
              <span className="bq-row-t">الفئة {g.name}</span>
              <span className="bq-row-s">
                {g.fee !== null ? (
                  <>
                    <Num>{fmt(g.fee)}</Num> أوقية في الشهر
                  </>
                ) : (
                  `لم تُحدَّد مستحقات ${year}`
                )}
                {g.nextYearFee !== null && g.nextYearFee !== g.fee && (
                  <>
                    {" "}
                    · <Num>{year + 1}</Num>: <Num>{fmt(g.nextYearFee)}</Num>
                  </>
                )}
                {" · "}
                <Num>{memberCount(g.members)}</Num>
              </span>
            </span>
            {admin && (
              <span className="bq-group-acts">
                <button
                  type="button"
                  className="bq-btn bq-btn-soft bq-press"
                  onClick={() => setSheet({ t: "fee", g })}
                >
                  المستحقات
                </button>
                {g.members > 0 ? (
                  <button
                    type="button"
                    className="bq-btn bq-btn-ghost bq-press"
                    onClick={() => setSheet({ t: "move", from: g })}
                  >
                    انقل أعضاءها
                  </button>
                ) : (
                  <button
                    type="button"
                    className="bq-btn bq-btn-ghost bq-press"
                    onClick={() => setSheet({ t: "retire", g })}
                  >
                    أوقفها
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
      {admin ? (
        <div className="bq-slip-btns">
          <button
            type="button"
            className="bq-btn bq-btn-soft bq-press"
            onClick={() => setSheet({ t: "new" })}
          >
            {I.plus(18)} فئة جديدة
          </button>
          <button
            type="button"
            className="bq-btn bq-btn-ghost bq-press"
            onClick={() => setSheet({ t: "move" })}
          >
            انقل أعضاء إلى فئة
          </button>
        </div>
      ) : (
        <p className="bq-hint">يغيّرها المسؤول فقط.</p>
      )}
      {sheet?.t === "new" && (
        <Sheet label="فئة جديدة" onDone={() => setSheet(null)}>
          <NewGroup year={year} onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet?.t === "fee" && (
        <Sheet label={`مستحقات الفئة ${sheet.g.name}`} onDone={() => setSheet(null)}>
          <GroupFee g={sheet.g} year={year} onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet?.t === "retire" && (
        <Sheet label={`أوقف الفئة ${sheet.g.name}`} onDone={() => setSheet(null)}>
          <RetireGroup g={sheet.g} year={year} onDone={() => setSheet(null)} />
        </Sheet>
      )}
      {sheet?.t === "move" && (
        <Sheet label="انقل أعضاء إلى فئة" onDone={() => setSheet(null)}>
          <MoveMembers
            from={sheet.from}
            groups={live}
            members={members}
            year={year}
            nameOf={nameOf}
            onDone={() => setSheet(null)}
          />
        </Sheet>
      )}
    </section>
  );
}

function Err({ m }: { m: string }) {
  return m ? (
    <p className="bq-alert" role="alert">
      {m}
    </p>
  ) : null;
}

function YearChips({
  year,
  value,
  onChange,
}: {
  year: number;
  value: number;
  onChange: (y: number) => void;
}) {
  return (
    <div className="bq-chips" role="group" aria-label="السنة">
      {[year, year + 1].map((y) => (
        <button
          key={y}
          type="button"
          className="bq-chip bq-press"
          aria-pressed={value === y}
          onClick={() => onChange(y)}
        >
          <Num>{y}</Num>
        </button>
      ))}
    </div>
  );
}

function NewGroup({ year, onDone }: { year: number; onDone: () => void }) {
  const router = useRouter();
  const online = useOnline();
  const say = useSnack();
  const { createGroup } = useAct();
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");
  const [from, setFrom] = useState(year + 1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ok = name.trim() && n(fee) > 0;
  return (
    <div className="bq-rec">
      <h2>فئة جديدة</h2>
      <p className="bq-rec-k">اسمها</p>
      <input
        className="bq-input"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        placeholder="مثل: ج"
        aria-label="اسم الفئة"
      />
      <p className="bq-rec-k">المستحقات الشهرية بالأوقية القديمة</p>
      <AmountInput
        className="bq-input"
        value={fee}
        onChange={setFee}
        aria-label="المستحقات الشهرية"
      />
      <p className="bq-rec-k">ابتداءً من سنة</p>
      <YearChips year={year} value={from} onChange={setFrom} />
      <div className="bq-rec-foot">
        <Err m={err} />
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          disabled={!ok || busy || !online}
          onClick={async () => {
            setBusy(true);
            setErr("");
            const r = await createGroup({
              name: name.trim(),
              monthlyAmount: n(fee),
              fromYear: from,
            });
            setBusy(false);
            if (!r.ok) return setErr(r.message);
            router.refresh();
            say(`أُنشئت الفئة ${name.trim()}`);
            onDone();
          }}
        >
          {busy ? "جارٍ الحفظ…" : "أنشئ الفئة"}
        </button>
        <OfflineWriteHint />
      </div>
    </div>
  );
}

function GroupFee({ g, year, onDone }: { g: GroupRow; year: number; onDone: () => void }) {
  const router = useRouter();
  const online = useOnline();
  const say = useSnack();
  const { setGroupPrice } = useAct();
  const [y, setY] = useState(year + 1);
  const [fee, setFee] = useState(String((y === year ? g.fee : (g.nextYearFee ?? g.fee)) ?? ""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="bq-rec">
      <h2>مستحقات الفئة {g.name}</h2>
      <p className="bq-rec-k">لسنة</p>
      <YearChips
        year={year}
        value={y}
        onChange={(v) => {
          setY(v);
          setFee(String((v === year ? g.fee : (g.nextYearFee ?? g.fee)) ?? ""));
        }}
      />
      {y === year && <p className="bq-hint">لا تتغيّر مستحقات سنة فيها دفعات مسجّلة.</p>}
      <p className="bq-rec-k">المستحقات الشهرية بالأوقية القديمة</p>
      <AmountInput
        className="bq-input"
        value={fee}
        onChange={setFee}
        aria-label="المستحقات الشهرية"
      />
      <div className="bq-rec-foot">
        <Err m={err} />
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          disabled={!n(fee) || busy || !online}
          onClick={async () => {
            setBusy(true);
            setErr("");
            const r = await setGroupPrice({ groupCode: g.code, year: y, monthlyAmount: n(fee) });
            setBusy(false);
            if (!r.ok) return setErr(r.message);
            router.refresh();
            say(`مستحقات الفئة ${g.name} لسنة ${y}: ${fmt(n(fee))} أوقية`);
            onDone();
          }}
        >
          {busy ? "جارٍ الحفظ…" : "احفظ"}
        </button>
        <OfflineWriteHint />
      </div>
    </div>
  );
}

function RetireGroup({ g, year, onDone }: { g: GroupRow; year: number; onDone: () => void }) {
  const router = useRouter();
  const online = useOnline();
  const say = useSnack();
  const { retireGroup } = useAct();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="bq-rec">
      <h2>أوقف الفئة {g.name}</h2>
      <p className="bq-lead">
        لا أعضاء فيها الآن. تبقى في السجل وفي تقارير السنوات السابقة، ولا تظهر ابتداءً من{" "}
        <Num>{year + 1}</Num>.
      </p>
      <div className="bq-rec-foot">
        <Err m={err} />
        <button
          type="button"
          className="bq-btn bq-btn-primary bq-btn-lg bq-press"
          disabled={busy || !online}
          onClick={async () => {
            setBusy(true);
            setErr("");
            const r = await retireGroup({ groupCode: g.code, fromYear: year + 1 });
            setBusy(false);
            if (!r.ok) return setErr(r.message);
            router.refresh();
            say(`أُوقفت الفئة ${g.name}`);
            onDone();
          }}
        >
          {busy ? "جارٍ الحفظ…" : "أوقف الفئة"}
        </button>
      </div>
    </div>
  );
}

/** Choose who, to which group, from which month; see exactly what happens; then move. */
function MoveMembers({
  from,
  groups,
  members,
  year,
  nameOf,
  onDone,
}: {
  from?: GroupRow;
  groups: GroupRow[];
  members: GroupMember[];
  year: number;
  nameOf: (code: string) => string;
  onDone: () => void;
}) {
  const router = useRouter();
  const online = useOnline();
  const say = useSnack();
  const { moveMembersToGroup, setGroupPrice } = useAct();
  const [picked, setPicked] = useState<string[]>(
    from ? members.filter((m) => m.groupCode === from.code).map((m) => m.memberId) : [],
  );
  const [to, setTo] = useState<string>(groups.find((g) => g.code !== from?.code)?.code ?? "");
  const [month, setMonth] = useState(`${year + 1}-01`);
  const [midYearOk, setMidYearOk] = useState(false);
  const [preview, setPreview] = useState<MoveResult | null>(null);
  const [noPrice, setNoPrice] = useState<number | null>(null);
  const [fee, setFee] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [my] = month.split("-").map(Number);
  const midYear = !month.endsWith("-01");
  // the January that keeps every month of a started year at its fixed amount
  const jan = my > year ? my : my + 1;
  const people = members.map((m) => ({
    id: m.memberId,
    ref: m.memberRef,
    name: m.fullName,
    sub: `الفئة ${nameOf(m.groupCode)}`,
  }));
  const chosen = people.filter((p) => picked.includes(p.id));
  const input = {
    toGroup: to,
    fromMonth: `${month}-01`,
    memberIds: picked,
  };
  const reset = () => {
    setPreview(null);
    setNoPrice(null);
    setErr("");
  };

  const runPreview = async () => {
    setBusy(true);
    setErr("");
    setNoPrice(null);
    const r = await moveMembersToGroup({ ...input, dryRun: true });
    setBusy(false);
    if (!r.ok) {
      if (r.code === "no_price") return setNoPrice(my);
      return setErr(r.message);
    }
    setPreview(r.data);
  };

  return (
    <div className="bq-rec">
      <h2>انقل أعضاء إلى فئة</h2>
      {from ? (
        <p className="bq-lead">
          كل أعضاء الفئة {from.name}: <Num>{memberCount(picked.length)}</Num>.
        </p>
      ) : (
        <>
          <p className="bq-rec-k">من ينتقل؟</p>
          {/* the shared picker; before typing, the chosen ones (tap = remove) */}
          <MemberSearch
            label="ابحث عن عضو"
            people={people}
            selected={chosen.map((m) => m.ref)}
            start={chosen}
            startHint="من اخترتهم:"
            onPick={(m) => {
              reset();
              setPicked((p) => (p.includes(m.id) ? p.filter((x) => x !== m.id) : [...p, m.id]));
            }}
          />
        </>
      )}
      <p className="bq-rec-k">إلى الفئة</p>
      <div className="bq-chips" role="group" aria-label="إلى الفئة">
        {groups
          .filter((g) => g.code !== from?.code)
          .map((g) => (
            <button
              key={g.code}
              type="button"
              className="bq-chip bq-press"
              aria-pressed={to === g.code}
              onClick={() => {
                reset();
                setTo(g.code);
              }}
            >
              الفئة {g.name}
            </button>
          ))}
      </div>
      <p className="bq-rec-k">ابتداءً من شهر</p>
      <MonthPicker
        value={month}
        onChange={(v) => {
          reset();
          setMidYearOk(false);
          setMonth(v);
        }}
        label="ابتداءً من شهر"
      />
      {midYear && !midYearOk && (
        <div className="bq-rej" role="group" aria-label="تنبيه">
          <p className="bq-lead">
            السنة لها مستحقات ثابتة. الأفضل أن يبدأ التغيير من يناير {jan} حتى لا تتغيّر أشهر السنة.
          </p>
          <div className="bq-stack">
            <button
              type="button"
              className="bq-btn bq-btn-primary bq-press"
              onClick={() => {
                reset();
                setMonth(`${jan}-01`);
              }}
            >
              ابدأ من يناير {jan}
            </button>
            <button
              type="button"
              className="bq-btn bq-btn-ghost bq-press"
              onClick={() => setMidYearOk(true)}
            >
              أفهم، ابدأ من {ymWords(month)}
            </button>
          </div>
        </div>
      )}
      <p className="bq-hint">الأشهر المدفوعة لا تتغيّر، وأرقام الأعضاء في الورقة تبقى كما هي.</p>

      {noPrice !== null && (
        <div className="bq-rej" role="alert">
          <p className="bq-lead">
            لم تُحدَّد مستحقات {noPrice} للفئة {nameOf(to)} بعد. حدّد مستحقات {noPrice} أولًا، ثم
            نكمل النقل.
          </p>
          <AmountInput
            className="bq-input"
            value={fee}
            onChange={setFee}
            aria-label={`مستحقات ${noPrice} للفئة ${nameOf(to)}`}
            placeholder="بالأوقية القديمة"
          />
          <button
            type="button"
            className="bq-btn bq-btn-primary bq-press"
            disabled={!n(fee) || busy || !online}
            onClick={async () => {
              setBusy(true);
              const r = await setGroupPrice({
                groupCode: to,
                year: noPrice,
                monthlyAmount: n(fee),
              });
              setBusy(false);
              if (!r.ok) return setErr(r.message);
              router.refresh();
              await runPreview();
            }}
          >
            حدّد مستحقات {noPrice} وأكمل
          </button>
        </div>
      )}

      {preview && (
        <div className="bq-move-preview" role="status">
          <p className="bq-lead">
            سينتقل <Num>{memberCount(preview.moved)}</Num> إلى الفئة {nameOf(to)} ابتداءً من{" "}
            {ymWords(month)}.
            {preview.fromFee !== null && preview.toFee !== null && (
              <>
                {" "}
                مستحقاتهم الشهرية <Num>{fmt(preview.toFee)}</Num> بدل{" "}
                <Num>{fmt(preview.fromFee)}</Num>.
              </>
            )}
          </p>
          {preview.skippedAlreadyInTarget > 0 && (
            <p className="bq-hint">
              <Num>{preview.skippedAlreadyInTarget}</Num> منهم في هذه الفئة من قبل.
            </p>
          )}
          {preview.blocked.length > 0 && (
            <>
              <p className="bq-rej-l">لا يمكن نقل هؤلاء الآن:</p>
              <ul className="bq-list">
                {preview.blocked.map((b) => (
                  <li key={b.memberId} className="bq-row-s">
                    {b.name}: {b.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="bq-rec-foot">
        <Err m={err} />
        {!preview ? (
          <button
            type="button"
            className="bq-btn bq-btn-primary bq-btn-lg bq-press"
            disabled={!picked.length || !to || (midYear && !midYearOk) || busy || !online}
            onClick={() => void runPreview()}
          >
            {busy ? "جارٍ التحقق…" : !picked.length ? "اختر الأعضاء" : "راجع النقل"}
          </button>
        ) : (
          <button
            type="button"
            className="bq-btn bq-btn-primary bq-btn-lg bq-press"
            disabled={busy || !online || preview.blocked.length > 0 || !preview.moved}
            onClick={async () => {
              setBusy(true);
              setErr("");
              const r = await moveMembersToGroup(input);
              setBusy(false);
              if (!r.ok) return setErr(r.message);
              router.refresh();
              say(`انتقل ${memberCount(r.data.moved)} إلى الفئة ${nameOf(to)}`);
              onDone();
            }}
          >
            {preview.blocked.length ? "أخرج المانعين أولًا" : busy ? "جارٍ النقل…" : "انقل"}
          </button>
        )}
        <OfflineWriteHint />
      </div>
    </div>
  );
}
