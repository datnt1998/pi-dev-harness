import assert from "node:assert/strict";
import test from "node:test";
import {
  type DoubleContract,
  type DoubleFidelityPacket,
  type DoubleOperation,
  type FidelityProbe,
  summarizeDoubleFidelity,
  validateDoubleFidelityPacket,
} from "../lib/test-double-fidelity.ts";

function operation(overrides: Partial<DoubleOperation> & { name: string }): DoubleOperation {
  return { argumentSensitive: false, canRefuse: false, refusalOutcomes: [], ...overrides };
}

function contract(operations: DoubleOperation[], overrides: Partial<DoubleContract> = {}): DoubleContract {
  return { doubleName: "fakeStore", portName: "StorePort", operations, ...overrides };
}

function probe(overrides: Partial<FidelityProbe> & { operation: string; kind: FidelityProbe["kind"] }): FidelityProbe {
  return {
    replayCommand: "pnpm exec vitest run path/to.spec.ts -t probe",
    observedExcerpt: "observed: rows ordered DESC",
    expectedSource: "fixture-literal",
    verdict: "distinguished",
    ...overrides,
  };
}

function packet(overrides: Partial<DoubleFidelityPacket> = {}): DoubleFidelityPacket {
  return { contract: contract([operation({ name: "list" })]), probes: [], blindness: [], reds: [], ...overrides };
}

test("minimal fake: all operations non-sensitive and non-refusing passes with zero probes", () => {
  const value = packet({
    contract: contract([operation({ name: "registerHost" }), operation({ name: "reset" })]),
  });
  assert.deepEqual(validateDoubleFidelityPacket(value), []);
});

test("canRefuse with empty refusalOutcomes is invalid at contract level; outcomes without canRefuse also fail", () => {
  const missing = packet({ contract: contract([operation({ name: "create", canRefuse: true })]) });
  assert.ok(validateDoubleFidelityPacket(missing).some((e) => e.includes('operation "create": canRefuse without named refusalOutcomes')));

  const stray = packet({ contract: contract([operation({ name: "create", refusalOutcomes: ["not_found"] })]) });
  assert.ok(validateDoubleFidelityPacket(stray).some((e) => e.includes("canRefuse is false")));
});

test("H16 chain-builder shape: argumentSensitive orderBy/where fail without a distinguishing probe", () => {
  const value = packet({
    contract: contract([
      operation({ name: "where", argumentSensitive: true }),
      operation({ name: "orderBy", argumentSensitive: true }),
    ]),
  });
  const errors = validateDoubleFidelityPacket(value);
  assert.ok(errors.some((e) => e.includes('operation "where": argumentSensitive without a distinguishing probe')));
  assert.ok(errors.some((e) => e.includes('operation "orderBy": argumentSensitive without a distinguishing probe')));
});

test("argumentSensitive passes via a distinguished probe, and separately via a blindness entry", () => {
  const base = contract([operation({ name: "orderBy", argumentSensitive: true })]);
  const withProbe = packet({
    contract: base,
    probes: [probe({ operation: "orderBy", kind: "argument-distinction", observedExcerpt: "ASC input yields reversed rows vs DESC" })],
  });
  assert.deepEqual(validateDoubleFidelityPacket(withProbe), []);

  const withBlindness = packet({
    contract: base,
    blindness: [{ operation: "orderBy", reason: "ordering only observable against real SQL", coveringGuard: "pnpm migrate:check keyset scenario" }],
  });
  assert.deepEqual(validateDoubleFidelityPacket(withBlindness), []);
});

test("a green (non-distinguished) argument probe does not count as coverage", () => {
  const value = packet({
    contract: contract([operation({ name: "where", argumentSensitive: true })]),
    probes: [probe({ operation: "where", kind: "argument-distinction", verdict: "green" })],
  });
  assert.ok(validateDoubleFidelityPacket(value).some((e) => e.includes('operation "where": argumentSensitive')));
});

test("canRefuse passes only via an executed refused probe naming a declared outcome", () => {
  const base = contract([operation({ name: "createPromotion", canRefuse: true, refusalOutcomes: ["not_found"] })]);
  const uncovered = packet({ contract: base });
  assert.ok(validateDoubleFidelityPacket(uncovered).some((e) => e.includes("a fake that cannot refuse is a rubber stamp")));

  const covered = packet({
    contract: base,
    probes: [probe({ operation: "createPromotion", kind: "refusal", verdict: "refused", refusalOutcome: "not_found", observedExcerpt: "refused: not_found for unknown product id" })],
  });
  assert.deepEqual(validateDoubleFidelityPacket(covered), []);

  const undeclared = packet({
    contract: base,
    probes: [probe({ operation: "createPromotion", kind: "refusal", verdict: "refused", refusalOutcome: "conflict" })],
  });
  const errors = validateDoubleFidelityPacket(undeclared);
  assert.ok(errors.some((e) => e.includes('refusal outcome "conflict" is not declared')));
  assert.ok(errors.some((e) => e.includes("rubber stamp")));

  const unnamed = packet({
    contract: base,
    probes: [probe({ operation: "createPromotion", kind: "refusal", verdict: "refused" })],
  });
  assert.ok(validateDoubleFidelityPacket(unnamed).some((e) => e.includes("refused verdict names no refusal outcome")));
});

test("H16 echo oracle: an echo-distinction probe whose observed outcome merely echoes caller input fails", () => {
  const base = contract([operation({ name: "createPromotion", argumentSensitive: true })]);
  const echoed = packet({
    contract: base,
    probes: [probe({
      operation: "createPromotion",
      kind: "echo-distinction",
      inputExcerpt: '{ products: ["slug-a"] }',
      observedExcerpt: '{ products: ["slug-a"] }',
    })],
  });
  const errors = validateDoubleFidelityPacket(echoed);
  assert.ok(errors.some((e) => e.includes("echo oracle")));

  const distinguished = packet({
    contract: base,
    probes: [
      probe({
        operation: "createPromotion",
        kind: "echo-distinction",
        inputExcerpt: '{ products: ["slug-a"] }',
        observedExcerpt: 'refused: not_found — "slug-a" is not an id',
      }),
      probe({ operation: "createPromotion", kind: "argument-distinction", observedExcerpt: "distinct ids yield distinct promotions" }),
    ],
  });
  assert.deepEqual(validateDoubleFidelityPacket(distinguished), []);

  const missingInput = packet({
    contract: contract([operation({ name: "createPromotion" })]),
    probes: [probe({ operation: "createPromotion", kind: "echo-distinction" })],
  });
  assert.ok(validateDoubleFidelityPacket(missingInput).some((e) => e.includes("requires inputExcerpt")));
});

test("expectedSource outside the union is rejected — the double's own return value is unrepresentable", () => {
  const value = packet({
    contract: contract([operation({ name: "list" })]),
    probes: [probe({ operation: "list", kind: "argument-distinction", expectedSource: "double-return" as never })],
  });
  assert.ok(validateDoubleFidelityPacket(value).some((e) => e.includes("expectedSource must be authority or fixture-literal")));
});

test("unknown kind, unknown verdict, and undeclared operation references are rejected", () => {
  const value = packet({
    contract: contract([operation({ name: "list" })]),
    probes: [probe({ operation: "missing", kind: "vibes" as never, verdict: "fine" as never })],
    blindness: [{ operation: "missing", reason: "r", coveringGuard: "g" }],
    reds: [{ operation: "missing", probeReplayCommand: "x", disposition: "implementation-fix" }],
  });
  const errors = validateDoubleFidelityPacket(value);
  assert.ok(errors.some((e) => e.includes('probes[0]: references undeclared operation "missing"')));
  assert.ok(errors.some((e) => e.includes('unknown kind "vibes"')));
  assert.ok(errors.some((e) => e.includes('unknown verdict "fine"')));
  assert.ok(errors.some((e) => e.includes('blindness[0]: references undeclared operation "missing"')));
  assert.ok(errors.some((e) => e.includes('reds[0]: references undeclared operation "missing"')));
});

test("prose cannot pass: empty replayCommand or observedExcerpt fails and voids coverage", () => {
  const base = contract([operation({ name: "orderBy", argumentSensitive: true })]);
  const value = packet({
    contract: base,
    probes: [probe({ operation: "orderBy", kind: "argument-distinction", replayCommand: " ", observedExcerpt: "" })],
  });
  const errors = validateDoubleFidelityPacket(value);
  assert.ok(errors.some((e) => e.includes("replayCommand empty")));
  assert.ok(errors.some((e) => e.includes("observedExcerpt empty")));
  assert.ok(errors.some((e) => e.includes('operation "orderBy": argumentSensitive')));
});

test("blindness with an empty coveringGuard is a silent waiver and does not grant coverage", () => {
  const value = packet({
    contract: contract([operation({ name: "where", argumentSensitive: true })]),
    blindness: [{ operation: "where", reason: "expensive", coveringGuard: "" }],
  });
  const errors = validateDoubleFidelityPacket(value);
  assert.ok(errors.some((e) => e.includes("silent waiver")));
  assert.ok(errors.some((e) => e.includes('operation "where": argumentSensitive')));
});

test("H19 monotonic fidelity: a restoration red needs a reds entry, and a reds entry needs its probe", () => {
  const base = contract([operation({ name: "rerun" })]);
  const redProbe = probe({
    operation: "rerun",
    kind: "fidelity-restoration",
    verdict: "red",
    replayCommand: "pnpm exec vitest run rerun.spec.ts",
    observedExcerpt: "3/8 tests red after restoring faithful projection",
  });

  const orphanProbe = packet({ contract: base, probes: [redProbe] });
  assert.ok(validateDoubleFidelityPacket(orphanProbe).some((e) => e.includes("no reds entry with an implementation-fix disposition")));

  const orphanRed = packet({
    contract: base,
    reds: [{ operation: "rerun", probeReplayCommand: "pnpm exec vitest run rerun.spec.ts", disposition: "implementation-fix" }],
  });
  assert.ok(validateDoubleFidelityPacket(orphanRed).some((e) => e.includes("no matching fidelity-restoration probe")));

  const matched = packet({
    contract: base,
    probes: [redProbe],
    reds: [{ operation: "rerun", probeReplayCommand: "pnpm exec vitest run rerun.spec.ts", disposition: "implementation-fix" }],
  });
  assert.deepEqual(validateDoubleFidelityPacket(matched), []);
});

test("weakening the double is unexpressible: any disposition other than implementation-fix is rejected", () => {
  const value = packet({
    contract: contract([operation({ name: "rerun" })]),
    probes: [probe({ operation: "rerun", kind: "fidelity-restoration", verdict: "red", replayCommand: "cmd", observedExcerpt: "red" })],
    reds: [{ operation: "rerun", probeReplayCommand: "cmd", disposition: "double-weakened" as never }],
  });
  assert.ok(validateDoubleFidelityPacket(value).some((e) => e.includes("weakening the double is not a disposition")));
});

test("contract-level structure: empty names, zero operations, duplicates", () => {
  assert.deepEqual(validateDoubleFidelityPacket({ probes: [], blindness: [], reds: [] } as never), ["contract: missing"]);
  const errors = validateDoubleFidelityPacket(packet({
    contract: contract([operation({ name: "a" }), operation({ name: "a" })], { doubleName: " ", portName: "" }),
  }));
  assert.ok(errors.some((e) => e.includes("contract.doubleName: empty")));
  assert.ok(errors.some((e) => e.includes("contract.portName: empty")));
  assert.ok(errors.some((e) => e.includes('duplicate operation "a"')));
  assert.ok(validateDoubleFidelityPacket(packet({ contract: contract([]) })).some((e) => e.includes("at least one operation")));
});

test("fail-closed structure: missing probes/blindness/reds arrays and non-array refusalOutcomes are rejected", () => {
  const bare = validateDoubleFidelityPacket({ contract: contract([operation({ name: "a" })]) } as never);
  assert.ok(bare.some((e) => e.includes("probes: must be an array")));
  assert.ok(bare.some((e) => e.includes("blindness: must be an array")));
  assert.ok(bare.some((e) => e.includes("reds: must be an array")));

  const badOutcomes = validateDoubleFidelityPacket(packet({
    contract: contract([{ name: "a", argumentSensitive: false, canRefuse: false, refusalOutcomes: undefined as never }]),
  }));
  assert.ok(badOutcomes.some((e) => e.includes('operation "a": refusalOutcomes must be an array')));

  const blankMember = validateDoubleFidelityPacket(packet({
    contract: contract([operation({ name: "a", canRefuse: true, refusalOutcomes: [""] })]),
  }));
  assert.ok(blankMember.some((e) => e.includes('operation "a": canRefuse without named refusalOutcomes')));
});

test("wrapped echo is still an echo oracle: observed containing the caller input fails", () => {
  const base = contract([operation({ name: "createPromotion" })]);
  const wrapped = packet({
    contract: base,
    probes: [probe({
      operation: "createPromotion",
      kind: "echo-distinction",
      inputExcerpt: '{ products: ["slug-a"] }',
      observedExcerpt: 'created: { products:  ["slug-a"] }',
    })],
  });
  assert.ok(validateDoubleFidelityPacket(wrapped).some((e) => e.includes("echo oracle")));

  const subset = packet({
    contract: base,
    probes: [probe({
      operation: "createPromotion",
      kind: "echo-distinction",
      inputExcerpt: 'ids: ["p1", "p2"] plus flags',
      observedExcerpt: 'ids: ["p1", "p2"]',
    })],
  });
  assert.ok(validateDoubleFidelityPacket(subset).some((e) => e.includes("echo oracle")));
});

test("coverage cannot bleed across operations or kinds", () => {
  const both = contract([
    operation({ name: "where", argumentSensitive: true }),
    operation({ name: "orderBy", argumentSensitive: true }),
  ]);
  const oneProbe = packet({ contract: both, probes: [probe({ operation: "where", kind: "argument-distinction" })] });
  const errors = validateDoubleFidelityPacket(oneProbe);
  assert.ok(!errors.some((e) => e.includes('operation "where":')));
  assert.ok(errors.some((e) => e.includes('operation "orderBy": argumentSensitive')));

  const wrongKind = packet({
    contract: contract([operation({ name: "where", argumentSensitive: true })]),
    probes: [probe({ operation: "where", kind: "echo-distinction", inputExcerpt: "in", observedExcerpt: "distinct out" })],
  });
  assert.ok(validateDoubleFidelityPacket(wrongKind).some((e) => e.includes('operation "where": argumentSensitive')));

  const refusing = contract([
    operation({ name: "create", canRefuse: true, refusalOutcomes: ["not_found"] }),
    operation({ name: "remove", canRefuse: true, refusalOutcomes: ["not_found"] }),
  ]);
  const oneRefusal = packet({
    contract: refusing,
    probes: [probe({ operation: "create", kind: "refusal", verdict: "refused", refusalOutcome: "not_found" })],
  });
  const refusalErrors = validateDoubleFidelityPacket(oneRefusal);
  assert.ok(!refusalErrors.some((e) => e.includes('operation "create":')));
  assert.ok(refusalErrors.some((e) => e.includes('operation "remove": canRefuse')));

  const greenRefusal = packet({
    contract: contract([operation({ name: "create", canRefuse: true, refusalOutcomes: ["not_found"] })]),
    probes: [probe({ operation: "create", kind: "refusal", verdict: "green" })],
  });
  assert.ok(validateDoubleFidelityPacket(greenRefusal).some((e) => e.includes('operation "create": canRefuse')));
});

test("canRefuse is satisfiable via a blindness entry, and blindness for one operation does not waive another", () => {
  const refusing = contract([
    operation({ name: "create", canRefuse: true, refusalOutcomes: ["not_found"] }),
    operation({ name: "remove", canRefuse: true, refusalOutcomes: ["not_found"] }),
  ]);
  const value = packet({
    contract: refusing,
    blindness: [{ operation: "create", reason: "refusal only reachable against real constraints", coveringGuard: "pnpm migrate:check" }],
  });
  const errors = validateDoubleFidelityPacket(value);
  assert.ok(!errors.some((e) => e.includes('operation "create":')));
  assert.ok(errors.some((e) => e.includes('operation "remove": canRefuse')));
});

test("each evidence field must be independently non-empty", () => {
  const base = contract([operation({ name: "list" })]);
  const emptyReplay = validateDoubleFidelityPacket(packet({
    contract: base,
    probes: [probe({ operation: "list", kind: "argument-distinction", replayCommand: " " })],
  }));
  assert.ok(emptyReplay.some((e) => e.includes("replayCommand empty")));
  assert.ok(!emptyReplay.some((e) => e.includes("observedExcerpt empty")));

  const emptyObserved = validateDoubleFidelityPacket(packet({
    contract: base,
    probes: [probe({ operation: "list", kind: "argument-distinction", observedExcerpt: "" })],
  }));
  assert.ok(emptyObserved.some((e) => e.includes("observedExcerpt empty")));
  assert.ok(!emptyObserved.some((e) => e.includes("replayCommand empty")));
});

test("reds matching requires both operation and replay command to match the red probe", () => {
  const base = contract([operation({ name: "rerun" }), operation({ name: "other" })]);
  const redProbe = probe({
    operation: "rerun",
    kind: "fidelity-restoration",
    verdict: "red",
    replayCommand: "cmd-a",
    observedExcerpt: "red",
  });
  const crossedCommand = packet({
    contract: base,
    probes: [redProbe],
    reds: [{ operation: "rerun", probeReplayCommand: "cmd-b", disposition: "implementation-fix" }],
  });
  const errors1 = validateDoubleFidelityPacket(crossedCommand);
  assert.ok(errors1.some((e) => e.includes("no reds entry")));
  assert.ok(errors1.some((e) => e.includes("no matching fidelity-restoration probe")));

  const crossedOperation = packet({
    contract: base,
    probes: [redProbe],
    reds: [{ operation: "other", probeReplayCommand: "cmd-a", disposition: "implementation-fix" }],
  });
  const errors2 = validateDoubleFidelityPacket(crossedOperation);
  assert.ok(errors2.some((e) => e.includes("no reds entry")));
  assert.ok(errors2.some((e) => e.includes("no matching fidelity-restoration probe")));
});

test("incoherent kind/verdict pairs are rejected", () => {
  const base = contract([operation({ name: "list" })]);
  const cases: Array<[FidelityProbe["kind"], FidelityProbe["verdict"]]> = [
    ["refusal", "distinguished"],
    ["argument-distinction", "refused"],
    ["fidelity-restoration", "distinguished"],
    ["echo-distinction", "red"],
  ];
  for (const [kind, verdict] of cases) {
    const value = packet({
      contract: base,
      probes: [probe({ operation: "list", kind, verdict, inputExcerpt: "in", observedExcerpt: "distinct out" })],
    });
    assert.ok(
      validateDoubleFidelityPacket(value).some((e) => e.includes(`verdict "${verdict}" is incoherent for kind "${kind}"`)),
      `${kind}/${verdict} accepted`,
    );
  }
});

test("summary derives failing structurally, not from error-message text", () => {
  const invalidProbe = summarizeDoubleFidelity(packet({
    contract: contract([operation({ name: "list" })]),
    probes: [probe({ operation: "list", kind: "argument-distinction", expectedSource: "double-return" as never })],
  }));
  assert.ok(invalidProbe.includes("- list: failing"));
  assert.ok(invalidProbe.includes("1 problem(s)"));

  const invalidBlindness = summarizeDoubleFidelity(packet({
    contract: contract([operation({ name: "list" })]),
    blindness: [{ operation: "list", reason: "", coveringGuard: "guard" }],
  }));
  assert.ok(invalidBlindness.includes("- list: failing"));
});

test("summary lists all guards sorted and is stable across blindness entry order", () => {
  const base = contract([operation({ name: "orderBy", argumentSensitive: true })]);
  const entries = [
    { operation: "orderBy", reason: "sql-only", coveringGuard: "migrate:check" },
    { operation: "orderBy", reason: "sql-only", coveringGuard: "acceptance:run" },
  ];
  const forward = summarizeDoubleFidelity(packet({ contract: base, blindness: entries }));
  const reversed = summarizeDoubleFidelity(packet({ contract: base, blindness: [...entries].reverse() }));
  assert.equal(forward, reversed);
  assert.ok(forward.includes("- orderBy: blind (guard: acceptance:run, migrate:check)"));
});

test("summary is deterministic across shuffled operation order and reports covered/blind/failing", () => {
  const ops = [
    operation({ name: "where", argumentSensitive: true }),
    operation({ name: "orderBy", argumentSensitive: true }),
    operation({ name: "registerHost" }),
  ];
  const build = (order: DoubleOperation[]): DoubleFidelityPacket => packet({
    contract: contract(order),
    probes: [probe({ operation: "where", kind: "argument-distinction" })],
    blindness: [{ operation: "orderBy", reason: "sql-only", coveringGuard: "migrate:check" }],
  });
  const forward = summarizeDoubleFidelity(build(ops));
  const shuffled = summarizeDoubleFidelity(build([ops[2], ops[0], ops[1]]));
  assert.equal(forward, shuffled);
  assert.ok(forward.includes("- where: covered"));
  assert.ok(forward.includes("- orderBy: blind (guard: migrate:check)"));
  assert.ok(forward.includes("- registerHost: covered"));

  const failing = summarizeDoubleFidelity(packet({ contract: contract([operation({ name: "where", argumentSensitive: true })]) }));
  assert.ok(failing.includes("- where: failing"));
  assert.ok(failing.includes("1 problem(s)"));
});
