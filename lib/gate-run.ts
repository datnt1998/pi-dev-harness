// Reusable ticket-readiness gate runner shipped by pi-dev-harness.
// Resolve this file from the installed skill/package location:
//
//   node --experimental-strip-types <pi-dev-harness>/lib/gate-run.ts <tickets.md>
//
// Prints the fingerprint, status summary, runnable order, cycles, warnings, and
// a per-ticket breakdown. Do NOT hand-classify — this is the source of truth.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeBatch } from "./ticket-readiness.ts";

const src = process.argv[2];
if (!src) {
  console.error("usage: gate-run <path-to-tickets.md>");
  process.exit(2);
}

const md = readFileSync(resolve(process.cwd(), src), "utf8");
const pkgPath = resolve(process.cwd(), "package.json");
let scripts: string[] = [];
try {
  scripts = Object.keys(JSON.parse(readFileSync(pkgPath, "utf8")).scripts ?? {}).map((name) => `npm run ${name}`);
} catch {
  // no package.json / scripts → validation-command checks simply skip
}

const r = analyzeBatch(md, { repoScripts: scripts });
console.log("fingerprint:", r.fingerprint);
console.log("summary:", JSON.stringify(r.summary));
console.log("order:", r.order.join(" -> "));
console.log("cycles:", JSON.stringify(r.cycles));
console.log("warnings:", JSON.stringify(r.warnings, null, 2));
for (const t of r.tickets) {
  console.log(`\n[${t.status}] ${t.id} — ${t.title}`);
  console.log("  deps:", t.dependencies.join(", ") || "none");
  console.log(
    "  AC:", t.acceptanceCriteria.length,
    "| validation:", t.validation.length,
    "| doneWhen:", t.doneWhen.length,
  );
  if (t.issues.length) console.log("  issues:", JSON.stringify(t.issues));
  if (t.autoFixes.length) console.log("  autoFixes:", JSON.stringify(t.autoFixes));
}

// Non-zero exit when the batch is not fully runnable, so callers can gate on it.
const blocked = r.summary.BLOCKED ?? 0;
const needs = r.summary.NEEDS_DECISION ?? 0;
process.exit(blocked + needs > 0 || r.warnings.length > 0 ? 1 : 0);
