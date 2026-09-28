// Supabase loads pg_safeupdate in API sessions: an UPDATE or DELETE without WHERE fails there
// (not in this local Postgres). Reads function bodies (one per line, JSON) from stdin and fails
// if any UPDATE/DELETE statement has no WHERE. ON CONFLICT … DO UPDATE is exempt.
import { createInterface } from "node:readline";

const bad = [];
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  const { name, src } = JSON.parse(line);
  const body = src.replace(/--[^\n]*/g, " ");
  for (const m of body.matchAll(/\b(update|delete\s+from)\s+([\w."]+)([\s\S]*?)(;|$)/gi)) {
    if (/^(of|on)$/i.test(m[2])) continue;
    const before = body.slice(Math.max(0, m.index - 12), m.index);
    if (/do\s*$/i.test(before)) continue; // ON CONFLICT … DO UPDATE
    if (!/\bwhere\b/i.test(m[3])) bad.push(`${name}: ${m[0].replace(/\s+/g, " ").slice(0, 90)}`);
  }
}
if (bad.length) {
  console.log(`FAIL writes without WHERE (pg_safeupdate would reject them):\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log("  ok  every UPDATE/DELETE in public/app_private functions has a WHERE");
