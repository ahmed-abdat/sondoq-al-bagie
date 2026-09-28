// Paper-sheet import: turns the yearly paper sheets into members and confirmed 'paper' payments.
//
//   node supabase/import/import-paper.mts --sheet data/sheet.csv [--phones data/phones.csv]
//        [--page-totals data/page_totals.csv] [--year 2026] [--price A=1000 --price B=500] [--sql data/import.sql]
//
// Without --sql it is a dry run: it validates and prints a summary, and writes nothing.
// With --sql it writes ONE transaction for the owner to paste into the Supabase SQL editor (runs as
// the server, so no secret key is needed). The file holds names and phones: never commit it.
//
// Inputs (CSV, comma or semicolon, first row = header):
//   sheet        number,name,group,m1..m12       any non-empty month cell = paid
//   phones       number,phone                    8 local digits become +222XXXXXXXX
//   page totals  page,from_number,to_number,m1..m12   amount per month written on the page, MRO
//
// One payment per member covers all ticked months. Its id is derived from year + number, so running
// the same SQL again replays instead of paying twice (record_payment is idempotent on the id).
// Existing member numbers are kept (not re-added) when the name matches; a different name aborts.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

type Member = { line: number; number: number; name: string; group: string; months: number[]; phone: string | null };
type PageTotal = { line: number; page: string; from: number; to: number; amounts: (number | null)[] };
type Table = { header: string[]; rows: { line: number; cells: string[] }[] };

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const GROUP_ALIASES: Record<string, string> = { "أ": "A", "ب": "B" };

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

function readSheet(path: string, prices: Record<string, number>): Member[] {
  const t = readTable(path, "sheet", ["number", "name", "group", ...MONTHS.map((m) => `m${m}`)]);
  if (!t) return [];
  const members: Member[] = [];
  const seen = new Map<number, number>();
  for (const { line, cells } of t.rows) {
    const where = `sheet line ${line}`;
    const number = positiveInt(col(t, cells, "number"));
    const name = col(t, cells, "name").replace(/\s+/g, " ");
    const rawGroup = col(t, cells, "group");
    const group = GROUP_ALIASES[rawGroup] ?? rawGroup.toUpperCase();
    if (number === null) { errors.push(`${where}: number "${col(t, cells, "number")}" is not a positive whole number`); continue; }
    if (seen.has(number)) errors.push(`${where}: number ${number} already used on line ${seen.get(number)}`);
    seen.set(number, line);
    if (!name) errors.push(`${where}: member ${number} has no name`);
    if (!(group in prices)) errors.push(`${where}: member ${number} has unknown group "${rawGroup}"`);
    const months = MONTHS.filter((m) => col(t, cells, `m${m}`) !== "");
    members.push({ line, number, name, group, months, phone: null });
  }
  return members.sort((a, b) => a.number - b.number);
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
  const byNumber = new Map(members.map((m) => [m.number, m]));
  const seen = new Set<number>();
  for (const { line, cells } of t.rows) {
    const where = `phones line ${line}`;
    const number = positiveInt(col(t, cells, "number"));
    const raw = col(t, cells, "phone");
    if (number === null) { errors.push(`${where}: bad member number`); continue; }
    if (!raw) continue;
    const member = byNumber.get(number);
    if (!member) { errors.push(`${where}: member ${number} is not on the sheet`); continue; }
    if (seen.has(number)) errors.push(`${where}: member ${number} has a second phone`);
    seen.add(number);
    const phone = normalizePhone(raw);
    if (!phone) errors.push(`${where}: member ${number} phone is not a valid number`);
    member.phone = phone;
  }
}

function readPageTotals(path: string): PageTotal[] {
  const t = readTable(path, "page totals", ["page", "from_number", "to_number", ...MONTHS.map((m) => `m${m}`)]);
  if (!t) return [];
  const pages: PageTotal[] = [];
  for (const { line, cells } of t.rows) {
    const where = `page totals line ${line}`;
    const from = positiveInt(col(t, cells, "from_number"));
    const to = positiveInt(col(t, cells, "to_number"));
    if (from === null || to === null || to < from) { errors.push(`${where}: bad from_number/to_number`); continue; }
    const amounts = MONTHS.map((m) => {
      const raw = col(t, cells, `m${m}`).replace(/[\s,]/g, "");
      if (raw === "") return null;
      if (!/^\d+$/.test(raw)) { errors.push(`${where}: m${m} "${raw}" is not a whole amount in MRO`); return null; }
      return Number(raw);
    });
    const page = col(t, cells, "page") || `line ${line}`;
    const overlap = pages.find((p) => from <= p.to && p.from <= to);
    if (overlap) errors.push(`${where}: page ${page} overlaps page ${overlap.page}`);
    pages.push({ line, page, from, to, amounts });
  }
  return pages;
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
  const numbers = new Set(members.map((m) => m.number));
  const max = Math.max(0, ...numbers);
  const missing = Array.from({ length: max }, (_, i) => i + 1).filter((n) => !numbers.has(n));
  if (missing.length) warnings.push(`numbers not on the sheet: ${ranges(missing)}`);

  for (const m of members) {
    if (m.months.length < 2) continue;
    const first = m.months[0];
    const last = m.months[m.months.length - 1];
    const holes = MONTHS.filter((x) => x > first && x < last && !m.months.includes(x));
    if (holes.length) warnings.push(`member ${m.number}: unticked month(s) ${holes.join(", ")} between ticks`);
  }

  for (const p of pages) {
    const onPage = members.filter((m) => m.number >= p.from && m.number <= p.to);
    for (const month of MONTHS) {
      const written = p.amounts[month - 1];
      if (written === null) continue;
      const ticked = onPage.reduce((s, m) => s + (m.months.includes(month) ? (prices[m.group] ?? 0) : 0), 0);
      if (ticked !== written) {
        warnings.push(`page ${p.page} month ${month}: ticks add up to ${ticked} MRO, page says ${written} (diff ${ticked - written})`);
      }
    }
  }
}

/* ───────────────────────── output ───────────────────────── */

// Stable id per (year, member number): an md5-based UUID (version 3 layout).
function paymentId(year: number, number: number): string {
  const h = createHash("md5").update(`paper-${year}-${number}`).digest("hex").split("");
  h[12] = "3";
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const pad = (s: string | number, w: number) => String(s).padStart(w);

function summary(members: Member[], pages: PageTotal[], prices: Record<string, number>, year: number): string {
  const groups = Object.keys(prices).filter((g) => members.some((m) => m.group === g));
  const out = [`Paper import ${year}`, ""];
  const count = (g: string) => members.filter((m) => m.group === g).length;
  out.push(`members   ${members.length} (${groups.map((g) => `${g} ${count(g)}`).join(", ")}); no ticks: ${members.filter((m) => !m.months.length).length}`);
  out.push(`payments  ${members.filter((m) => m.months.length).length} (one per member with ticks)`);
  out.push(`phones    ${members.filter((m) => m.phone).length}`);
  out.push("", `ticks     ${MONTHS.map((m) => pad(`m${m}`, 4)).join("")}   total`);
  let grand = 0;
  for (const g of groups) {
    const perMonth = MONTHS.map((mo) => members.filter((m) => m.group === g && m.months.includes(mo)).length);
    const ticks = perMonth.reduce((a, b) => a + b, 0);
    grand += ticks * prices[g];
    out.push(`  ${g} ${pad(prices[g], 5)} ${perMonth.map((n) => pad(n, 4)).join("")}   ${pad(ticks, 5)} = ${fmt(ticks * prices[g])} MRO`);
  }
  out.push(`amount    ${fmt(grand)} MRO (${fmt(grand / 10)} MRU)`);
  if (pages.length) out.push(`pages     ${pages.length} page total row(s) checked`);
  return out.join("\n");
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;

function toSql(members: Member[], prices: Record<string, number>, year: number, today: string): string {
  const used = Object.keys(prices).filter((g) => members.some((m) => m.group === g));
  const rows = members.map((m) => {
    const last = m.months[m.months.length - 1];
    const paidOn = last ? [`${year}-${String(last).padStart(2, "0")}-01`, today].sort()[0] : null;
    return `  (${[
      m.number, lit(m.name), lit(m.group), m.phone ? lit(m.phone) : "null",
      m.months.length ? lit(paymentId(year, m.number)) : "null",
      m.months.length * prices[m.group], prices[m.group], paidOn ? lit(paidOn) : "null",
      `'{${m.months.join(",")}}'`,
    ].join(", ")})`;
  });
  const note = lit(`سجل ورقي ${year}`);
  return `-- Paper-sheet import ${year}, generated ${today} by supabase/import/import-paper.mts.
-- CONTAINS MEMBERS' NAMES AND PHONES: do not commit or share this file.
-- Paste the whole file into the Supabase SQL editor and run it once. It is one transaction:
-- any error rolls everything back. Running it again adds nothing (payments replay by id).

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
  number integer, full_name text, group_code text, phone text,
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
  for r in select * from paper_import order by number loop
    begin
      select m.id, m.full_name into mid, old_name from public.members m where m.number = r.number;
      if mid is null then
        mid := public.add_member(p_number => r.number, p_full_name => r.full_name, p_group_code => r.group_code,
                                 p_from_month => date '${year}-01-01', p_phone => r.phone);
      elsif old_name <> r.full_name then
        raise exception 'number already belongs to another name';
      end if;
      if r.payment_id is not null then
        perform public.record_payment(
          p_id => r.payment_id, p_payer_name => r.full_name, p_method => 'paper', p_amount => r.amount,
          p_paid_on => r.paid_on, p_note => ${note},
          p_allocations => (select jsonb_agg(jsonb_build_object('kind', 'months', 'member_id', mid, 'year', ${year},
                                                                'month', mo, 'amount', r.price) order by mo)
                            from unnest(r.months) mo));
      end if;
    exception when others then
      get stacked diagnostics hint = pg_exception_hint;
      raise exception 'paper import: member %: % (%)', r.number, sqlerrm, coalesce(nullif(hint, ''), sqlstate);
    end;
  end loop;
end $$;

commit;

select (select count(*) from public.members) as members,
       (select count(*) from public.payments where method = 'paper' and status = 'confirmed') as paper_payments,
       (select coalesce(sum(amount), 0) from public.payments where method = 'paper' and status = 'confirmed') as paper_total_mro;
`;
}

/* ───────────────────────── main ───────────────────────── */

function main() {
  const { values } = parseArgs({
    options: {
      sheet: { type: "string" },
      phones: { type: "string" },
      "page-totals": { type: "string" },
      year: { type: "string", default: "2026" },
      price: { type: "string", multiple: true },
      sql: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help || !values.sheet) {
    console.log("usage: node supabase/import/import-paper.mts --sheet <csv> [--phones <csv>] [--page-totals <csv>]\n" +
      "       [--year 2026] [--price A=1000 --price B=500] [--sql <out.sql>]");
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

  const members = readSheet(values.sheet, prices);
  if (values.phones) readPhones(values.phones, members);
  const pages = values["page-totals"] ? readPageTotals(values["page-totals"]) : [];
  if (!errors.length) check(members, pages, prices);

  if (members.length) console.log(summary(members, pages, prices, year));
  if (warnings.length) console.log(`\nwarnings (${warnings.length})\n${warnings.map((w) => `  - ${w}`).join("\n")}`);
  if (errors.length) {
    console.log(`\nerrors (${errors.length})\n${errors.map((e) => `  - ${e}`).join("\n")}`);
    console.log("\nNothing written: fix the errors first.");
    process.exit(1);
  }
  if (values.sql) {
    const today = new Date().toISOString().slice(0, 10);
    writeFileSync(values.sql, toSql(members, prices, year, today));
    console.log(`\nSQL written to ${values.sql} (contains names/phones: do not commit it).`);
  } else {
    console.log("\nDry run: nothing written. Add --sql <file> to produce the import.");
  }
}

main();
