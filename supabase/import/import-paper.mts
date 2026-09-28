// Paper-sheet import: turns the yearly paper sheets into members and confirmed 'paper' payments.
//
//   node supabase/import/import-paper.mts --sheet data/a.csv --sheet data/b.csv [--phones data/phones.csv]
//        [--page-totals data/page_totals.csv] [--only A:1-21,B:54-70] [--year 2026] [--price A=1000]
//        [--members-sql data/1-members.sql] [--payments-sql data/2-payments.sql] [--sql data/all.sql]
//        [--note "…"]   note on the payments (default «سجل ورقي <year>»)
//
// Without an output flag it is a dry run: it validates and prints a summary, and writes nothing.
// Outputs are SQL files for the owner to paste into the Supabase SQL editor (it runs as the server,
// so no secret key is needed). Each file is ONE transaction and can be run again safely:
//   --members-sql   step 1: members only (a member whose list+number exists with the same name is kept)
//   --payments-sql  step 2: one confirmed 'paper' payment per member with ticks (members must exist)
//   --sql           both steps in one file (local rehearsal)
// The files hold names and phones: never commit or share them.
//
// Inputs (CSV, comma or semicolon, first row = header):
//   sheet        [list,]number,name,group,m1..m12   list = the paper list (A or B, default: the group)
//                month cell: empty = not paid, "?" = not readable, anything else = paid
//   phones       [list,]number,phone                8 local digits become +222XXXXXXXX
//   page totals  page,[list,]from_number,to_number[,m1..m12][,total]   amounts written on the page, MRO
//
// A member with any "?" month gets no payment until the committee confirms the row. --only limits
// payments to the given list ranges (e.g. pages whose totals add up). A payment id is derived from
// year + list + number, so a re-run replays instead of paying twice.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

type Member = {
  line: string;
  list: string;
  number: number;
  name: string;
  group: string;
  months: number[];
  unreadable: number[];
  phone: string | null;
};
type PageTotal = {
  line: number;
  page: string;
  list: string | null;
  from: number;
  to: number;
  amounts: (number | null)[];
  total: number | null;
};
type Table = { header: string[]; rows: { line: number; cells: string[] }[] };
type Range = { list: string; from: number; to: number };

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const LETTER_ALIASES: Record<string, string> = { "أ": "A", "ب": "B" };
const letter = (raw: string) => LETTER_ALIASES[raw] ?? raw.toUpperCase();
const ref = (m: { list: string; number: number }) => `${m.list}-${m.number}`;

const errors: string[] = [];
const warnings: string[] = [];

/* ───────────────────────── CSV ───────────────────────── */

function parseCsv(text: string): Table {
  text = text.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const sep = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    cells.push(field);
    if (cells.some((c) => c.trim() !== "")) rows.push({ line: rowLine, cells: cells.map((c) => c.trim()) });
    cells = [];
    field = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else { if (ch === "\n") line++; field += ch; }
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { cells.push(field); field = ""; }
    else if (ch === "\n") { endRow(); line++; rowLine = line; }
    else if (ch !== "\r") field += ch;
  }
  endRow();
  const [head, ...body] = rows;
  return { header: (head?.cells ?? []).map((h) => h.toLowerCase()), rows: body };
}

function readTable(path: string, label: string, required: string[]): Table | null {
  let table: Table;
  try {
    table = parseCsv(readFileSync(path, "utf8"));
  } catch (e) {
    errors.push(`${label}: cannot read ${path} (${(e as Error).message})`);
    return null;
  }
  const missing = required.filter((c) => !table.header.includes(c));
  if (missing.length) {
    errors.push(`${label}: missing column(s) ${missing.join(", ")}`);
    return null;
  }
  return table;
}

const col = (t: Table, cells: string[], name: string) => cells[t.header.indexOf(name)] ?? "";
const positiveInt = (s: string) => (/^\d+$/.test(s) && Number(s) > 0 ? Number(s) : null);

/* ───────────────────────── inputs ───────────────────────── */

function readSheet(path: string, prices: Record<string, number>, seen: Map<string, string>): Member[] {
  const t = readTable(path, `sheet ${path}`, ["number", "name", "group", ...MONTHS.map((m) => `m${m}`)]);
  if (!t) return [];
  const out: Member[] = [];
  for (const { line, cells } of t.rows) {
    const where = `${path}:${line}`;
    const number = positiveInt(col(t, cells, "number"));
    const name = col(t, cells, "name").replace(/\s+/g, " ");
    const rawGroup = col(t, cells, "group");
    const group = letter(rawGroup);
    const list = t.header.includes("list") && col(t, cells, "list") ? letter(col(t, cells, "list")) : group;
    if (number === null) { errors.push(`${where}: number "${col(t, cells, "number")}" is not a positive whole number`); continue; }
    const id = `${list}-${number}`;
    if (seen.has(id)) errors.push(`${where}: ${id} already used at ${seen.get(id)}`);
    seen.set(id, where);
    if (!/^[A-Z]$/.test(list)) errors.push(`${where}: ${id} has an unknown list`);
    if (!name) errors.push(`${where}: ${id} has no name`);
    if (!(group in prices)) errors.push(`${where}: ${id} has unknown group "${rawGroup}"`);
    const cell = (m: number) => col(t, cells, `m${m}`);
    const unreadable = MONTHS.filter((m) => cell(m) === "?");
    const months = MONTHS.filter((m) => cell(m) !== "" && cell(m) !== "?");
    out.push({ line: where, list, number, name, group, months, unreadable, phone: null });
  }
  return out;
}

function normalizePhone(raw: string): string | null {
  let p = raw.replace(/[\s\-.()]/g, "");
  if (p.startsWith("00")) p = `+${p.slice(2)}`;
  if (/^[0-9]{8}$/.test(p)) p = `+222${p}`;
  return /^\+?[0-9]{8,15}$/.test(p) ? p : null;
}

function readPhones(path: string, members: Member[]) {
  const t = readTable(path, "phones", ["number", "phone"]);
  if (!t) return;
  const byRef = new Map(members.map((m) => [ref(m), m]));
  const lists = new Set(members.map((m) => m.list));
  const seen = new Set<string>();
  for (const { line, cells } of t.rows) {
    const where = `phones line ${line}`;
    const number = positiveInt(col(t, cells, "number"));
    const raw = col(t, cells, "phone");
    if (number === null) { errors.push(`${where}: bad member number`); continue; }
    if (!raw) continue;
    let list = t.header.includes("list") ? letter(col(t, cells, "list")) : "";
    if (!list) {
      if (lists.size > 1) { errors.push(`${where}: add a "list" column (there are several lists)`); continue; }
      list = [...lists][0] ?? "";
    }
    const id = `${list}-${number}`;
    const member = byRef.get(id);
    if (!member) { errors.push(`${where}: ${id} is not on the sheets`); continue; }
    if (seen.has(id)) errors.push(`${where}: ${id} has a second phone`);
    seen.add(id);
    const phone = normalizePhone(raw);
    if (!phone) errors.push(`${where}: ${id} phone is not a valid number`);
    member.phone = phone;
  }
}

function readPageTotals(path: string): PageTotal[] {
  const t = readTable(path, "page totals", ["page", "from_number", "to_number"]);
  if (!t) return [];
  const pages: PageTotal[] = [];
  for (const { line, cells } of t.rows) {
    const where = `page totals line ${line}`;
    const from = positiveInt(col(t, cells, "from_number"));
    const to = positiveInt(col(t, cells, "to_number"));
    if (from === null || to === null || to < from) { errors.push(`${where}: bad from_number/to_number`); continue; }
    const amount = (name: string) => {
      const raw = (t.header.includes(name) ? col(t, cells, name) : "").replace(/[\s,]/g, "");
      if (raw === "") return null;
      if (!/^\d+$/.test(raw)) { errors.push(`${where}: ${name} "${raw}" is not a whole amount in MRO`); return null; }
      return Number(raw);
    };
    const list = t.header.includes("list") && col(t, cells, "list") ? letter(col(t, cells, "list")) : null;
    const page = col(t, cells, "page") || `line ${line}`;
    const overlap = pages.find((p) => p.list === list && from <= p.to && p.from <= to);
    if (overlap) errors.push(`${where}: page ${page} overlaps page ${overlap.page}`);
    pages.push({ line, page, list, from, to, amounts: MONTHS.map((m) => amount(`m${m}`)), total: amount("total") });
  }
  return pages;
}

function parseOnly(spec: string | undefined): Range[] | null {
  if (!spec) return null;
  const ranges: Range[] = [];
  for (const part of spec.split(",").map((x) => x.trim()).filter(Boolean)) {
    const m = /^([A-Za-zأب]):(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) { errors.push(`--only "${part}": expected e.g. A:1-21`); continue; }
    ranges.push({ list: letter(m[1]), from: Number(m[2]), to: Number(m[3] ?? m[2]) });
  }
  return ranges;
}

/* ───────────────────────── checks ───────────────────────── */

function ranges(nums: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < nums.length; i++) {
    let j = i;
    while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++;
    out.push(i === j ? `${nums[i]}` : `${nums[i]}-${nums[j]}`);
    i = j;
  }
  return out.join(", ");
}

function check(members: Member[], pages: PageTotal[], prices: Record<string, number>) {
  for (const list of [...new Set(members.map((m) => m.list))].sort()) {
    const numbers = new Set(members.filter((m) => m.list === list).map((m) => m.number));
    const max = Math.max(0, ...numbers);
    const missing = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !numbers.has(n));
    if (missing.length) warnings.push(`list ${list}: numbers not on the sheets: ${ranges(missing)}`);
  }
  const unread = members.filter((m) => m.unreadable.length);
  if (unread.length) {
    warnings.push(`months not readable ("?") — no payment until the committee confirms: ${unread.map(ref).join(", ")}`);
  }
  for (const m of members) {
    if (m.months.length < 2) continue;
    const first = m.months[0];
    const last = m.months[m.months.length - 1];
    const holes = MONTHS.filter((x) => x > first && x < last && !m.months.includes(x));
    if (holes.length) warnings.push(`${ref(m)}: unticked month(s) ${holes.join(", ")} between ticks`);
  }
  for (const p of pages) {
    const onPage = members.filter((m) => (p.list === null || m.list === p.list) && m.number >= p.from && m.number <= p.to);
    for (const month of MONTHS) {
      const written = p.amounts[month - 1];
      if (written === null) continue;
      const ticked = onPage.reduce((s, m) => s + (m.months.includes(month) ? (prices[m.group] ?? 0) : 0), 0);
      if (ticked !== written) {
        warnings.push(`page ${p.page} month ${month}: ticks add up to ${ticked} MRO, page says ${written} (diff ${ticked - written})`);
      }
    }
    if (p.total !== null) {
      const ticked = onPage.reduce((s, m) => s + m.months.length * (prices[m.group] ?? 0), 0);
      if (ticked !== p.total) {
        warnings.push(`page ${p.page} total: ticks add up to ${ticked} MRO, page says ${p.total} (diff ${ticked - p.total})`);
      }
    }
  }
}

/** Members whose payments go into step 2. */
function payable(members: Member[], only: Range[] | null): Member[] {
  return members.filter(
    (m) =>
      m.months.length > 0 &&
      m.unreadable.length === 0 &&
      (!only || only.some((r) => r.list === m.list && m.number >= r.from && m.number <= r.to)),
  );
}

/* ───────────────────────── output ───────────────────────── */

// Stable id per (year, list, member number): an md5-based UUID (version 3 layout).
function paymentId(year: number, list: string, number: number): string {
  const h = createHash("md5").update(`paper-${year}-${list}-${number}`).digest("hex").split("");
  h[12] = "3";
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const pad = (s: string | number, w: number) => String(s).padStart(w);

function summary(members: Member[], pay: Member[], pages: PageTotal[], prices: Record<string, number>, year: number): string {
  const lists = [...new Set(members.map((m) => m.list))].sort();
  const groups = Object.keys(prices).filter((g) => members.some((m) => m.group === g));
  const out = [`Paper import ${year}`, ""];
  out.push(`members   ${members.length} (${lists.map((l) => `list ${l}: ${members.filter((m) => m.list === l).length}`).join(", ")})`);
  out.push(`          no ticks: ${members.filter((m) => !m.months.length && !m.unreadable.length).length}, unreadable: ${members.filter((m) => m.unreadable.length).length}`);
  out.push(`phones    ${members.filter((m) => m.phone).length}`);
  out.push("", `ticks     ${MONTHS.map((m) => pad(`m${m}`, 4)).join("")}   total`);
  let grand = 0;
  for (const g of groups) {
    const perMonth = MONTHS.map((mo) => members.filter((m) => m.group === g && m.months.includes(mo)).length);
    const ticks = perMonth.reduce((a, b) => a + b, 0);
    grand += ticks * prices[g];
    out.push(`  ${g} ${pad(prices[g], 5)} ${perMonth.map((n) => pad(n, 4)).join("")}   ${pad(ticks, 5)} = ${fmt(ticks * prices[g])} MRO`);
  }
  out.push(`amount    ${fmt(grand)} MRO (${fmt(grand / 10)} MRU) ticked on the sheets`);
  const payAmount = pay.reduce((s, m) => s + m.months.length * (prices[m.group] ?? 0), 0);
  out.push(`payments  ${pay.length} to import (${fmt(payAmount)} MRO); held back: ${members.filter((m) => m.months.length && !pay.includes(m)).length} with ticks`);
  if (pages.length) out.push(`pages     ${pages.length} page total row(s) checked`);
  return out.join("\n");
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

type Steps = { members: boolean; payments: boolean };

function toSql(members: Member[], pay: Member[], prices: Record<string, number>, year: number, today: string, steps: Steps, noteText: string): string {
  const rows = (steps.members ? members : pay).map((m) => {
    const paid = pay.includes(m);
    const last = m.months[m.months.length - 1];
    const paidOn = paid && last ? [`${year}-${String(last).padStart(2, "0")}-01`, today].sort()[0] : null;
    return `  (${[
      lit(m.list), m.number, lit(m.name), lit(m.group), m.phone ? lit(m.phone) : "null",
      paid ? lit(paymentId(year, m.list, m.number)) : "null",
      paid ? m.months.length * prices[m.group] : "null", prices[m.group], paidOn ? lit(paidOn) : "null",
      paid ? `'{${m.months.join(",")}}'` : "'{}'",
    ].join(", ")})`;
  });
  const used = Object.keys(prices).filter((g) => members.some((m) => m.group === g));
  const note = lit(noteText);
  const what = steps.members && steps.payments ? "members and payments" : steps.members ? "step 1: members" : "step 2: payments";
  const memberBlock = `
      if mid is null then
        mid := public.add_member(p_number => r.number, p_full_name => r.full_name, p_group_code => r.group_code,
                                 p_from_month => date '${year}-01-01', p_phone => r.phone, p_list_code => r.list_code);
      elsif old_name <> r.full_name then
        raise exception 'this list number already belongs to another name';
      end if;`;
  const missingBlock = `
      if mid is null then raise exception 'member not found: run step 1 (members) first'; end if;`;
  const paymentBlock = `
      if r.payment_id is not null then
        perform public.record_payment(
          p_id => r.payment_id, p_payer_name => r.full_name, p_method => 'paper', p_amount => r.amount,
          p_paid_on => r.paid_on, p_note => ${note},
          p_allocations => (select jsonb_agg(jsonb_build_object('kind', 'months', 'member_id', mid, 'year', ${year},
                                                                'month', mo, 'amount', r.price) order by mo)
                            from unnest(r.months) mo));
      end if;`;
  return `-- Paper-sheet import ${year} (${what}), generated ${today} by supabase/import/import-paper.mts.
-- CONTAINS MEMBERS' NAMES AND PHONES: do not commit or share this file.
-- Paste the whole file into the Supabase SQL editor and run it. It is one transaction: any error
-- rolls everything back. Running it again adds nothing.

begin;

do $$
begin
  if exists (
    select 1 from (values ${used.map((g) => `(${lit(g)}, ${prices[g]})`).join(", ")}) v(code, price)
    left join public.groups g on g.code = v.code
    left join public.group_prices gp on gp.group_id = g.id and gp.year = ${year}
    where gp.monthly_amount is distinct from v.price) then
    raise exception 'paper import: the ${year} group prices in the database differ from this file (${used.map((g) => `${g}=${prices[g]}`).join(", ")})';
  end if;
end $$;

create temp table paper_import (
  list_code text, number integer, full_name text, group_code text, phone text,
  payment_id uuid, amount integer, price integer, paid_on date, months smallint[]
) on commit drop;

insert into paper_import values
${rows.join(",\n")};

do $$
declare
  r record;
  mid uuid;
  old_name text;
  hint text;
begin
  for r in select * from paper_import order by list_code, number loop
    begin
      mid := null;
      select m.id, m.full_name into mid, old_name from public.members m
      where m.list_code = r.list_code and m.number = r.number;${steps.members ? memberBlock : missingBlock}${steps.payments ? paymentBlock : ""}
    exception when others then
      get stacked diagnostics hint = pg_exception_hint;
      raise exception 'paper import: member %-%: % (%)', r.list_code, r.number, sqlerrm, coalesce(nullif(hint, ''), sqlstate);
    end;
  end loop;
end $$;

commit;

select (select count(*) from public.members) as members,
       (select count(*) from public.members where list_code = 'A') as list_a,
       (select count(*) from public.members where list_code = 'B') as list_b,
       (select count(*) from public.payments where method = 'paper' and status = 'confirmed') as paper_payments,
       (select coalesce(sum(amount), 0) from public.payments where method = 'paper' and status = 'confirmed') as paper_total_mro;
`;
}

/* ───────────────────────── main ───────────────────────── */

function main() {
  const { values } = parseArgs({
    options: {
      sheet: { type: "string", multiple: true },
      phones: { type: "string" },
      "page-totals": { type: "string" },
      only: { type: "string" },
      year: { type: "string", default: "2026" },
      price: { type: "string", multiple: true },
      sql: { type: "string" },
      "members-sql": { type: "string" },
      "payments-sql": { type: "string" },
      note: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help || !values.sheet?.length) {
    console.log("usage: node supabase/import/import-paper.mts --sheet <csv> [--sheet <csv>…] [--phones <csv>]\n" +
      "       [--page-totals <csv>] [--only A:1-21,B:54-70] [--year 2026] [--price A=1000 --price B=500]\n" +
      "       [--members-sql <file>] [--payments-sql <file>] [--sql <file>]");
    process.exit(values.help ? 0 : 2);
  }
  const year = positiveInt(values.year ?? "");
  if (year === null || year < 2020 || year > 2100) { console.error("--year must be between 2020 and 2100"); process.exit(2); }
  const prices: Record<string, number> = { A: 1000, B: 500 };
  for (const p of values.price ?? []) {
    const m = /^([A-Z])=(\d+)$/.exec(p);
    if (!m || Number(m[2]) <= 0) { console.error(`--price ${p}: expected e.g. A=1000`); process.exit(2); }
    prices[m[1]] = Number(m[2]);
  }

  const seen = new Map<string, string>();
  const members = values.sheet
    .flatMap((f) => readSheet(f, prices, seen))
    .sort((a, b) => a.list.localeCompare(b.list) || a.number - b.number);
  if (values.phones) readPhones(values.phones, members);
  const pages = values["page-totals"] ? readPageTotals(values["page-totals"]) : [];
  const only = parseOnly(values.only);
  if (!errors.length) check(members, pages, prices);
  const pay = payable(members, only);

  if (members.length) console.log(summary(members, pay, pages, prices, year));
  if (warnings.length) console.log(`\nwarnings (${warnings.length})\n${warnings.map((w) => `  - ${w}`).join("\n")}`);
  if (errors.length) {
    console.log(`\nerrors (${errors.length})\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    console.log("\nNothing written: fix the errors first.");
    process.exit(1);
  }
  const today = new Date().toISOString().slice(0, 10);
  const outputs: [string | undefined, Steps][] = [
    [values["members-sql"], { members: true, payments: false }],
    [values["payments-sql"], { members: false, payments: true }],
    [values.sql, { members: true, payments: true }],
  ];
  let wrote = false;
  for (const [file, steps] of outputs) {
    if (!file) continue;
    writeFileSync(file, toSql(members, pay, prices, year, today, steps, values.note?.trim() || `سجل ورقي ${year}`));
    console.log(`\nSQL written to ${file} (contains names/phones: do not commit it).`);
    wrote = true;
  }
  if (!wrote) console.log("\nDry run: nothing written. Add --members-sql / --payments-sql <file> to produce the import.");
}

main();
