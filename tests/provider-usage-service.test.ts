import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonQuotaLedgerStore, ProviderQuotaAuthority, getProviderQuotaAuthority, resetProviderQuotaAuthoritiesForTests } from "../lib/provider-usage-service.ts";
import type { UsageState } from "../lib/provider-usage-core.ts";

const NOW = Date.parse("2026-02-01T12:00:00Z");
const usage: UsageState = {
  provider: "provider-a",
  windows: [
    { label: "3h", kind: "short", usedPercent: 20, resetAt: Date.parse("2026-02-01T15:00:00Z") },
    { label: "Week", kind: "weekly", usedPercent: 30, resetAt: Date.parse("2026-02-08T00:00:00Z") },
  ],
  updatedAt: NOW,
  quotaStatus: "ready",
  allowSingleWeeklyWindow: true,
};

test("one authority deduplicates refresh and publishes the same snapshot object to every consumer", async () => {
  let calls = 0;
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const authority = new ProviderQuotaAuthority({
    provider: "provider-a",
    providerIdentity: "provider-a/account-1",
    fetchUsage: async () => { calls += 1; await wait; return usage; },
    now: () => NOW,
  });
  const first = authority.refresh();
  const second = authority.refresh();
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.equal(authority.snapshot, a);
  assert.equal(a.status, "ready");
  assert.ok(a.categoryBalances);
});

test("registry returns one quota client per provider identity", () => {
  resetProviderQuotaAuthoritiesForTests();
  const options = {
    provider: "provider-a",
    providerIdentity: "provider-a/account-1",
    fetchUsage: async () => usage,
    now: () => NOW,
  };
  assert.equal(getProviderQuotaAuthority(options), getProviderQuotaAuthority(options));
  assert.notEqual(
    getProviderQuotaAuthority(options),
    getProviderQuotaAuthority({ ...options, provider: "provider-b" }),
    "provider is part of the registry key even when an explicit identity collides",
  );
});

test("authority start/finish is the live atomic launch seam shared with snapshot consumers", async () => {
  const authority = new ProviderQuotaAuthority({
    provider: "provider-a",
    providerIdentity: "provider-a/account-live",
    fetchUsage: async () => usage,
    now: () => NOW,
  });
  await authority.refresh();
  const lease = await authority.start({
    tier: "scarce-premium",
    quotaCategory: "main",
    attribution: { source: "tickets/work.md", ticket: "T-live", purpose: "production" },
    context: "fresh",
    requestedThinking: "high",
    importantReasoning: true,
    route: { selectedTier: "scarce-premium", effectiveThinking: "high", fallback: "none" },
  });
  assert.equal(lease.decision.decision, "allow");
  assert.equal(authority.snapshot.pendingDebitPercent, 1);
  await lease.finish({ outcome: "failed-before-request" });
  assert.equal(authority.snapshot.pendingDebitPercent, 0);
});

test("auth and fetch failures become machine-readable fail-closed snapshots", async () => {
  for (const [kind, expected] of [["auth-error", "auth-error"], ["fetch-error", "fetch-error"]] as const) {
    const authority = new ProviderQuotaAuthority({
      provider: "provider-a",
      providerIdentity: `provider-a/${kind}`,
      fetchUsage: async () => { throw Object.assign(new Error(kind), { quotaStatus: kind }); },
      now: () => NOW,
    });
    const snapshot = await authority.refresh();
    assert.equal(snapshot.status, expected);
    assert.equal(snapshot.band, "unknown");
    assert.notEqual(snapshot.gateReason, "ready");
  }
});

test("JSON ledger store persists one reset-keyed ledger per provider identity without credentials", async () => {
  const dir = mkdtempSync(join(tmpdir(), "quota-ledger-"));
  const path = join(dir, "ledgers.json");
  const store = new JsonQuotaLedgerStore(path);
  const authority = new ProviderQuotaAuthority({
    provider: "provider-a",
    providerIdentity: "provider-a/account-1",
    fetchUsage: async () => usage,
    store,
    now: () => NOW,
  });
  await authority.refresh();
  const loaded = await store.load("provider-a/account-1");
  assert.equal(loaded?.resetEpoch, "2026-02-08T00:00:00.000Z");
  const raw = readFileSync(path, "utf8");
  assert.doesNotMatch(raw, /token|secret|oauth/i);
  assert.match(raw, /provider-a\/account-1/);
});
