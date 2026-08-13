/**
 * Test-double fidelity packet: an executable, fail-closed contract against
 * rubber-stamp fakes (spec: docs/specs/test-double-fidelity.md).
 *
 * Three normative rules made machine-checkable at the packet level:
 * 1. Argument sensitivity — a semantic argument must be observed by the double;
 *    a no-op passthrough cannot prove behavior involving it.
 * 2. Refusal capability — a double standing in for an operation that can refuse
 *    must reproduce at least one declared refusal path, or declare tier
 *    blindness naming the covering guard.
 * 3. Monotonic fidelity — a red produced by increasing fidelity is an
 *    implementation defect; the packet cannot express "weakened the double"
 *    as a disposition.
 *
 * Pure: no fs, no child_process, no env reads. Validation follows the
 * lib/team-orchestration-protocol.ts convention of structural, fail-closed
 * checks over caller-provided evidence; the validator checks internal
 * consistency of the packet, never world-truth.
 */

export type ProbeKind = "argument-distinction" | "refusal" | "echo-distinction" | "fidelity-restoration";

/**
 * Where the probe's expected outcome came from. There is deliberately no
 * member for the double's own return value or the caller's input: an echo
 * oracle is unrepresentable in a valid packet.
 */
export type ExpectedSource = "authority" | "fixture-literal";

export type ProbeVerdict = "distinguished" | "refused" | "red" | "green";

export type DoubleOperation = {
  name: string;
  /** True when the operation's arguments carry meaning the double must observe. */
  argumentSensitive: boolean;
  /** True when the real port can refuse this operation. */
  canRefuse: boolean;
  /** Named refusal outcomes; required non-empty exactly when canRefuse is true. */
  refusalOutcomes: string[];
};

export type DoubleContract = {
  doubleName: string;
  portName: string;
  operations: DoubleOperation[];
};

export type FidelityProbe = {
  operation: string;
  kind: ProbeKind;
  /** Command that re-executes this probe against the actual double. */
  replayCommand: string;
  /** Excerpt of the observed outcome; prose with no evidence cannot pass. */
  observedExcerpt: string;
  expectedSource: ExpectedSource;
  verdict: ProbeVerdict;
  /** Refusal probes with verdict "refused" must name a declared outcome. */
  refusalOutcome?: string;
  /** Echo-distinction probes must record the caller input the outcome must differ from. */
  inputExcerpt?: string;
};

export type TierBlindness = {
  operation: string;
  reason: string;
  /** The integration/real-adapter test or gate that owns this blind spot. */
  coveringGuard: string;
};

/**
 * A red surfaced by restoring or increasing double fidelity. The disposition
 * union has exactly one member by design: weakening the double back to green
 * is structurally unexpressible.
 */
export type FidelityRed = {
  operation: string;
  probeReplayCommand: string;
  disposition: "implementation-fix";
};

export type DoubleFidelityPacket = {
  contract: DoubleContract;
  probes: FidelityProbe[];
  blindness: TierBlindness[];
  reds: FidelityRed[];
};

const PROBE_KINDS: readonly string[] = ["argument-distinction", "refusal", "echo-distinction", "fidelity-restoration"];
const EXPECTED_SOURCES: readonly string[] = ["authority", "fixture-literal"];
const PROBE_VERDICTS: readonly string[] = ["distinguished", "refused", "red", "green"];

/** Allowed kind/verdict pairs; anything else is incoherent probe evidence. */
const KIND_VERDICTS: Readonly<Record<ProbeKind, readonly ProbeVerdict[]>> = {
  "argument-distinction": ["distinguished", "green"],
  "echo-distinction": ["distinguished", "green"],
  refusal: ["refused", "green"],
  "fidelity-restoration": ["red", "green"],
};

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function byCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

type OperationStatus = "covered" | "blind" | "failing";

type Analysis = {
  errors: string[];
  statuses: Map<string, OperationStatus>;
  guards: Map<string, string[]>;
};

function analyze(packet: DoubleFidelityPacket): Analysis {
  const errors: string[] = [];
  const statuses = new Map<string, OperationStatus>();
  const guards = new Map<string, string[]>();
  const invalidOps = new Set<string>();
  const flag = (operation: unknown): void => {
    if (nonEmpty(operation)) invalidOps.add(operation);
  };

  const contract = packet?.contract;
  if (!contract || typeof contract !== "object") return { errors: ["contract: missing"], statuses, guards };
  if (!nonEmpty(contract.doubleName)) errors.push("contract.doubleName: empty");
  if (!nonEmpty(contract.portName)) errors.push("contract.portName: empty");
  const operations = Array.isArray(contract.operations) ? contract.operations : [];
  if (!Array.isArray(contract.operations)) errors.push("contract.operations: must be an array");
  else if (operations.length === 0) errors.push("contract.operations: a contract must declare at least one operation");

  const probesValid = Array.isArray(packet?.probes);
  const blindnessValid = Array.isArray(packet?.blindness);
  const redsValid = Array.isArray(packet?.reds);
  if (!probesValid) errors.push("probes: must be an array");
  if (!blindnessValid) errors.push("blindness: must be an array");
  if (!redsValid) errors.push("reds: must be an array");
  const probes = probesValid ? packet.probes : [];
  const blindness = blindnessValid ? packet.blindness : [];
  const reds = redsValid ? packet.reds : [];

  const declared = new Map<string, DoubleOperation>();
  for (const op of operations) {
    if (!nonEmpty(op?.name)) {
      errors.push("contract.operations: operation with empty name");
      continue;
    }
    if (declared.has(op.name)) {
      errors.push(`contract.operations: duplicate operation "${op.name}"`);
      invalidOps.add(op.name);
    }
    declared.set(op.name, op);
    if (typeof op.argumentSensitive !== "boolean") {
      errors.push(`operation "${op.name}": argumentSensitive must be boolean`);
      invalidOps.add(op.name);
    }
    if (typeof op.canRefuse !== "boolean") {
      errors.push(`operation "${op.name}": canRefuse must be boolean`);
      invalidOps.add(op.name);
    }
    if (!Array.isArray(op.refusalOutcomes)) {
      errors.push(`operation "${op.name}": refusalOutcomes must be an array`);
      invalidOps.add(op.name);
      continue;
    }
    if (op.canRefuse === true && (op.refusalOutcomes.length === 0 || !op.refusalOutcomes.every(nonEmpty))) {
      errors.push(`operation "${op.name}": canRefuse without named refusalOutcomes`);
      invalidOps.add(op.name);
    }
    if (op.canRefuse === false && op.refusalOutcomes.length > 0) {
      errors.push(`operation "${op.name}": refusalOutcomes declared but canRefuse is false`);
      invalidOps.add(op.name);
    }
  }

  for (const [index, probe] of probes.entries()) {
    const label = `probes[${index}]`;
    const before = errors.length;
    const op = nonEmpty(probe?.operation) ? declared.get(probe.operation) : undefined;
    if (!op) errors.push(`${label}: references undeclared operation "${probe?.operation ?? ""}"`);
    const knownKind = PROBE_KINDS.includes(probe?.kind as string);
    const knownVerdict = PROBE_VERDICTS.includes(probe?.verdict as string);
    if (!knownKind) errors.push(`${label}: unknown kind "${probe?.kind}"`);
    if (!knownVerdict) errors.push(`${label}: unknown verdict "${probe?.verdict}"`);
    if (knownKind && knownVerdict && !KIND_VERDICTS[probe.kind].includes(probe.verdict)) {
      errors.push(`${label}: verdict "${probe.verdict}" is incoherent for kind "${probe.kind}"`);
    }
    if (!EXPECTED_SOURCES.includes(probe?.expectedSource as string)) {
      errors.push(`${label}: expectedSource must be authority or fixture-literal, not "${probe?.expectedSource}"`);
    }
    if (!nonEmpty(probe?.replayCommand)) errors.push(`${label}: replayCommand empty — a probe that cannot be replayed is prose`);
    if (!nonEmpty(probe?.observedExcerpt)) errors.push(`${label}: observedExcerpt empty — a probe with no observed outcome is prose`);
    if (probe?.kind === "refusal" && probe?.verdict === "refused") {
      if (!nonEmpty(probe.refusalOutcome)) {
        errors.push(`${label}: refused verdict names no refusal outcome`);
      } else if (op && Array.isArray(op.refusalOutcomes) && !op.refusalOutcomes.includes(probe.refusalOutcome)) {
        errors.push(`${label}: refusal outcome "${probe.refusalOutcome}" is not declared on operation "${op.name}"`);
      }
    }
    if (probe?.kind === "echo-distinction") {
      if (!nonEmpty(probe.inputExcerpt)) {
        errors.push(`${label}: echo-distinction requires inputExcerpt to distinguish against`);
      } else if (nonEmpty(probe.observedExcerpt)) {
        const observed = normalize(probe.observedExcerpt);
        const input = normalize(probe.inputExcerpt);
        if (observed.includes(input) || input.includes(observed)) {
          errors.push(`${label}: echo oracle — observed outcome contains or is contained by the caller input`);
        }
      }
    }
    if (probe?.kind === "fidelity-restoration" && probe?.verdict === "red") {
      const matched = reds.some((red) => red?.operation === probe.operation && red?.probeReplayCommand === probe.replayCommand);
      if (!matched) errors.push(`${label}: fidelity-restoration red has no reds entry with an implementation-fix disposition`);
    }
    if (errors.length > before) flag(probe?.operation);
  }

  for (const [index, blind] of blindness.entries()) {
    const label = `blindness[${index}]`;
    const before = errors.length;
    if (!nonEmpty(blind?.operation) || !declared.has(blind.operation)) {
      errors.push(`${label}: references undeclared operation "${blind?.operation ?? ""}"`);
    }
    if (!nonEmpty(blind?.reason)) errors.push(`${label}: reason empty`);
    if (!nonEmpty(blind?.coveringGuard)) errors.push(`${label}: blindness without a named covering guard is a silent waiver`);
    if (errors.length > before) {
      flag(blind?.operation);
    } else {
      const list = guards.get(blind.operation) ?? [];
      list.push(blind.coveringGuard.trim());
      guards.set(blind.operation, list);
    }
  }

  for (const [index, red] of reds.entries()) {
    const label = `reds[${index}]`;
    const before = errors.length;
    if (!nonEmpty(red?.operation) || !declared.has(red.operation)) {
      errors.push(`${label}: references undeclared operation "${red?.operation ?? ""}"`);
    }
    if (!nonEmpty(red?.probeReplayCommand)) errors.push(`${label}: probeReplayCommand empty`);
    if (red?.disposition !== "implementation-fix") {
      errors.push(`${label}: disposition must be implementation-fix — weakening the double is not a disposition`);
    }
    const matched = probes.some(
      (probe) => probe?.kind === "fidelity-restoration" && probe?.verdict === "red"
        && probe?.operation === red?.operation && probe?.replayCommand === red?.probeReplayCommand,
    );
    if (!matched) errors.push(`${label}: no matching fidelity-restoration probe with verdict red`);
    if (errors.length > before) flag(red?.operation);
  }

  for (const op of declared.values()) {
    const blind = guards.has(op.name);
    let covered = true;
    if (op.argumentSensitive === true && !blind) {
      const has = probes.some(
        (probe) => probe?.operation === op.name && probe?.kind === "argument-distinction" && probe?.verdict === "distinguished"
          && nonEmpty(probe?.replayCommand) && nonEmpty(probe?.observedExcerpt),
      );
      if (!has) {
        covered = false;
        errors.push(`operation "${op.name}": argumentSensitive without a distinguishing probe or blindness entry — a no-op passthrough cannot prove behavior involving its arguments`);
      }
    }
    if (op.canRefuse === true && !blind) {
      const has = probes.some(
        (probe) => probe?.operation === op.name && probe?.kind === "refusal" && probe?.verdict === "refused"
          && nonEmpty(probe?.refusalOutcome) && Array.isArray(op.refusalOutcomes) && op.refusalOutcomes.includes(probe.refusalOutcome as string)
          && nonEmpty(probe?.replayCommand) && nonEmpty(probe?.observedExcerpt),
      );
      if (!has) {
        covered = false;
        errors.push(`operation "${op.name}": canRefuse without an executed refusal probe or blindness entry — a fake that cannot refuse is a rubber stamp`);
      }
    }
    const status: OperationStatus = invalidOps.has(op.name) || !covered ? "failing" : blind ? "blind" : "covered";
    statuses.set(op.name, status);
  }

  return { errors, statuses, guards };
}

/**
 * Fail-closed structural validation. Returns an empty list only for a packet
 * whose declared semantics are fully covered by executed probe evidence or
 * explicit blindness declarations.
 */
export function validateDoubleFidelityPacket(packet: DoubleFidelityPacket): string[] {
  return analyze(packet).errors;
}

/**
 * One deterministic line per operation: covered, blind (all guards, sorted),
 * or failing. Status is derived structurally from the same analysis as
 * validation, never recovered from error-message text.
 */
export function summarizeDoubleFidelity(packet: DoubleFidelityPacket): string {
  const { errors, statuses, guards } = analyze(packet);
  const contract = packet?.contract;
  const operations = statuses.size;
  const lines: string[] = [
    `double ${nonEmpty(contract?.doubleName) ? contract.doubleName : "?"} for port ${nonEmpty(contract?.portName) ? contract.portName : "?"}: ${operations} operation(s), ${errors.length} problem(s)`,
  ];
  for (const name of [...statuses.keys()].sort(byCodePoint)) {
    const status = statuses.get(name);
    if (status === "blind") {
      const list = [...new Set(guards.get(name) ?? [])].sort(byCodePoint);
      lines.push(`- ${name}: blind (guard: ${list.join(", ")})`);
    } else {
      lines.push(`- ${name}: ${status}`);
    }
  }
  return lines.join("\n");
}
