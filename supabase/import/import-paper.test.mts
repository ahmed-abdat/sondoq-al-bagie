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
  assert.match(out, /members {3}8 \(A 5, B 3\); no ticks: 1/);
  assert.match(out, /payments {2}7/);
  assert.match(out, /amount {4}39,000 MRO \(3,900 MRU\)/);
  assert.match(out, /numbers not on the sheet: 6-7/);
  assert.match(out, /member 3: unticked month\(s\) 4 between ticks/);
  assert.doesNotMatch(out, /page .* month/);
  assert.match(out, /Dry run: nothing written/);
});

test("sample: SQL has stable payment ids and normalised phones", () => {
  const a = join(dir, "a.sql");
  const b = join(dir, "b.sql");
  assert.equal(run("--sheet", `${sample}sheet.csv`, "--phones", `${sample}phones.csv`, "--sql", a).code, 0);
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
  const phones = csv("bad-phones.csv", "number,phone\n1,12ab\n9,22000000\n");
  const out = join(dir, "never.sql");
  const r = run("--sheet", sheet, "--phones", phones, "--sql", out);
  assert.equal(r.code, 1);
  assert.match(r.out, /number 1 already used on line 2/);
  assert.match(r.out, /member 2 has unknown group "C"/);
  assert.match(r.out, /member 1 phone is not a valid number/);
  assert.match(r.out, /member 9 is not on the sheet/);
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
  assert.match(r.out, /sheet: missing column\(s\) group, m2/);
});

test("page grand total is checked too; month columns are optional", () => {
  const sheet = csv("t.csv", `${HEAD}\n1,Ali,A,x,x,,,,,,,,,,\n2,Sidi,B,x,,,,,,,,,,,\n`);
  const pages = csv("t-totals.csv", "page,from_number,to_number,total\n1,1,2,3000\n");
  const r = run("--sheet", sheet, "--page-totals", pages);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /page 1 total: ticks add up to 2500 MRO, page says 3000 \(diff -500\)/);
});
