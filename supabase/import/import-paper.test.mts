// Run: node --test supabase/import/import-paper.test.mts   (also run by supabase/tests/local/run.sh)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const script = new URL("./import-paper.mts", import.meta.url).pathname;
const sample = new URL("./sample/", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "paper-import-"));
const HEAD = "number,name,group,m1,m2,m3,m4,m5,m6,m7,m8,m9,m10,m11,m12";

function run(...args: string[]) {
  const r = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

function csv(name: string, text: string) {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
}

test("sample: dry run summarises and warns about gaps", () => {
  const { code, out } = run("--sheet", `${sample}sheet.csv`, "--phones", `${sample}phones.csv`,
    "--page-totals", `${sample}page_totals.csv`);
  assert.equal(code, 0, out);
  assert.match(out, /members {3}8 \(list A: 5, list B: 3\)/);
  assert.match(out, /no ticks: 1, unreadable: 0/);
  assert.match(out, /payments  7 to import \(39,000 MRO\)/);
  assert.match(out, /amount {4}39,000 MRO \(3,900 MRU\)/);
  assert.match(out, /list A: numbers not on the sheets: 2, 4, 6-8/);
  assert.match(out, /A-3: unticked month\(s\) 4 between ticks/);
  assert.doesNotMatch(out, /page .* month/);
  assert.match(out, /Dry run: nothing written/);
});

test("sample: SQL has stable payment ids and normalised phones", () => {
  const a = join(dir, "a.sql");
  const b = join(dir, "b.sql");
  assert.equal(run("--sheet", `${sample}sheet.csv`, "--phones", `${sample}phones.csv`, "--members-sql", join(dir, "m.sql"), "--sql", a).code, 0);
  assert.equal(run("--sheet", `${sample}sheet.csv`, "--sql", b).code, 0);
  const ids = (f: string) => readFileSync(f, "utf8").match(/'[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'/g);
  assert.equal(ids(a)?.length, 7);
  assert.deepEqual(ids(a), ids(b));
  const sql = readFileSync(a, "utf8");
  assert.match(sql, /'\+22222000012'/);
  assert.match(sql, /'\+22200000015'/);
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;$/m);
});

test("errors block the SQL: duplicate number, unknown group, bad phone, unknown phone owner", () => {
  const sheet = csv("bad.csv", `${HEAD}\n1,Ali,A,x,,,,,,,,,,,\n1,Omar,A,,,,,,,,,,,,\n2,Sidi,C,x,,,,,,,,,,,\n`);
  const phones = csv("bad-phones.csv", "list,number,phone\nA,1,12ab\nA,9,22000000\n");
  const out = join(dir, "never.sql");
  const r = run("--sheet", sheet, "--phones", phones, "--sql", out);
  assert.equal(r.code, 1);
  assert.match(r.out, /A-1 already used at .*bad\.csv:2/);
  assert.match(r.out, /C-2 has unknown group "C"/);
  assert.match(r.out, /A-1 phone is not a valid number/);
  assert.match(r.out, /A-9 is not on the sheets/);
  assert.match(r.out, /Nothing written/);
  assert.throws(() => readFileSync(out));
});

test("page total mismatch is a warning with the difference", () => {
  const sheet = csv("p.csv", `${HEAD}\n1,Ali,A,x,x,,,,,,,,,,\n2,Sidi,B,x,,,,,,,,,,,\n`);
  const pages = csv("p-totals.csv", "page,from_number,to_number,m1,m2,m3,m4,m5,m6,m7,m8,m9,m10,m11,m12\n1,1,2,1500,2000,,,,,,,,,,\n");
  const r = run("--sheet", sheet, "--page-totals", pages);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /page 1 month 2: ticks add up to 1000 MRO, page says 2000 \(diff -1000\)/);
  assert.doesNotMatch(r.out, /month 1:/);
});

test("semicolon CSV, BOM, Arabic group letters and --price", () => {
  const sheet = csv("semi.csv", `﻿${HEAD.replaceAll(",", ";")}\n1;Ali;أ;x;;;;;;;;;;;\n2;Sidi;ب;x;;;;;;;;;;;\n`);
  const r = run("--sheet", sheet, "--price", "A=2000");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /amount {4}2,500 MRO/);
});

test("missing columns are reported", () => {
  const r = run("--sheet", csv("cols.csv", "number,name,m1\n1,Ali,x\n"));
  assert.equal(r.code, 1);
  assert.match(r.out, /missing column\(s\) group, m2/);
});

test("page grand total is checked too; month columns are optional", () => {
  const sheet = csv("t.csv", `${HEAD}\n1,Ali,A,x,x,,,,,,,,,,\n2,Sidi,B,x,,,,,,,,,,,\n`);
  const pages = csv("t-totals.csv", "page,from_number,to_number,total\n1,1,2,3000\n");
  const r = run("--sheet", sheet, "--page-totals", pages);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /page 1 total: ticks add up to 2500 MRO, page says 3000 \(diff -500\)/);
});

test("two lists share numbers; \"?\" rows and --only hold payments back; two-step SQL", () => {
  const a = csv("list-a.csv", `list,${HEAD}\nA,1,Ali,A,x,x,,,,,,,,,,\nA,2,Omar,A,x,,,,,,,,,,,\n`);
  const b = csv("list-b.csv", `list,${HEAD}\nB,1,Sidi,B,?,?,?,?,?,?,?,?,?,?,?,?\nB,2,Baba,B,x,x,x,,,,,,,,,\n`);
  const m = join(dir, "1-members.sql");
  const p = join(dir, "2-payments.sql");
  const r = run("--sheet", a, "--sheet", b, "--only", "A:1-2", "--members-sql", m, "--payments-sql", p);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /members {3}4 \(list A: 2, list B: 2\)/);
  assert.match(r.out, /unreadable: 1/);
  assert.match(r.out, /not readable \("\?"\).*B-1/);
  assert.match(r.out, /payments  2 to import \(3,000 MRO\); held back: 1 with ticks/);
  const members = readFileSync(m, "utf8");
  const payments = readFileSync(p, "utf8");
  assert.match(members, /public\.add_member\(/);
  assert.doesNotMatch(members, /record_payment/);
  assert.match(members, /\('B', 1, 'Sidi'/);
  assert.match(payments, /record_payment/);
  assert.doesNotMatch(payments, /add_member/);
  assert.doesNotMatch(payments, /'Sidi'|'Baba'/);
});

test("--note replaces the default payment note", () => {
  const out = join(dir, "noted.sql");
  assert.equal(run("--sheet", `${sample}sheet.csv`, "--payments-sql", out, "--note", "للمراجعة").code, 0);
  const sql = readFileSync(out, "utf8");
  assert.match(sql, /p_note => 'للمراجعة'/);
  assert.doesNotMatch(sql, /سجل ورقي/);
});
