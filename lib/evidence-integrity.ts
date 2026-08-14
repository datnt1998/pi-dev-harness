/**
 * Evidence locator referential integrity check.
 *
 * Verifies that every `evidenceLocator` string on a parsed orchestration
 * envelope resolves to an actual `evidence.recorded` event in the provided
 * run-track branch entries. This prevents fabricated or stale locators from
 * entering the pilot ledger.
 *
 * Opt-in only: the pure `applyEvidencedOutcome` path has no access to the
 * run-track event log and skips this check entirely. Only callers using
 * `applyEvidencedOutcomeWithRunTrack` get referential integrity enforcement.
 */

import type { TeamOrchestrationEnvelopeV1 } from "./team-orchestration-protocol.ts";
import type { RunTrackEvent } from "./run-track-v1.ts";
import { InvariantRegistry } from "./invariant-registry.ts";

export const EVIDENCE_MODULE = "evidence-referential-integrity";

/**
 * Collect every non-empty evidenceLocator from the envelope's evidence fields.
 * Covers dispositions, reviewer seals, and parent-implementation-after-delegation.
 */
export function collectEvidenceLocators(envelope: TeamOrchestrationEnvelopeV1): string[] {
  const locators: string[] = [];

  // FindingDispositionEvidence[].evidenceLocator (required per shape validation)
  for (const d of envelope.dispositions ?? []) {
    if (typeof d.evidenceLocator === "string" && d.evidenceLocator.length > 0) {
      locators.push(d.evidenceLocator);
    }
  }

  // ReviewEvidence[].sealing?.evidenceLocator (required when sealing present)
  for (const r of envelope.reviews ?? []) {
    if (r.sealing && typeof r.sealing.evidenceLocator === "string" && r.sealing.evidenceLocator.length > 0) {
      locators.push(r.sealing.evidenceLocator);
    }
  }

  // ParentImplementationAfterDelegation?.evidenceLocator (when occurred=true)
  const pImpl = envelope.parentImplementationAfterDelegation;
  if (pImpl?.occurred && typeof pImpl.evidenceLocator === "string" && pImpl.evidenceLocator.length > 0) {
    locators.push(pImpl.evidenceLocator);
  }

  // Note: parentGate.evidenceLocator is intentionally excluded. The gate is a
  // final authority action recorded by the owner, not operator-observed evidence
  // minted through run_track_record_evidence; its locator has different semantics.

  return locators;
}

/**
 * Filter raw run-track branch entries down to evidence.recorded events.
 * Tolerates malformed entries (skips them silently).
 */
export function extractEvidenceEvents(entries: readonly unknown[]): Array<{ evidenceId: string }> {
  const result: Array<{ evidenceId: string }> = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (e.kind !== "evidence.recorded") continue;
    if (typeof e.evidenceId !== "string" || e.evidenceId.length === 0) continue;
    result.push({ evidenceId: e.evidenceId });
  }
  return result;
}

/**
 * Assert that every evidenceLocator on the envelope resolves to an
 * evidence.recorded event in the provided run-track entries.
 *
 * @param registry - the invariant registry to throw through.
 * @param envelope - parsed orchestration envelope (shape already validated).
 * @param entries - raw run-track branch entries from the session log.
 * @throws InvariantError via the registry on first unresolvable locator.
 */
export function assertEvidenceLocatorsResolve(
  registry: InvariantRegistry,
  envelope: TeamOrchestrationEnvelopeV1,
  entries: readonly unknown[],
): void {
  const locators = collectEvidenceLocators(envelope);
  if (locators.length === 0) return; // vacuously valid

  const evidenceIds = new Set(extractEvidenceEvents(entries).map((e) => e.evidenceId));

  for (const locator of locators) {
    registry.assert(
      EVIDENCE_MODULE,
      evidenceIds.has(locator),
      "locator-resolves",
      `evidence locator '${locator}' does not resolve to any recorded evidence event`,
    );
  }
}

/**
 * Installer for the evidence-referential-integrity invariant set.
 * Context must be `{ envelope, entries }`. Exported so tests can install it
 * into a fresh registry without importing the module-scoped default.
 */
export function installEvidenceReferentialIntegrity(
  fail: (rule: string, message: string) => never,
  context?: unknown,
): void {
  if (!context || typeof context !== "object") {
    fail("context-required", "assertEvidenceLocatorsResolve requires { envelope, entries }");
  }
  const ctx = context as { envelope?: unknown; entries?: unknown };
  if (!ctx.envelope || !Array.isArray(ctx.entries)) {
    fail("context-shape", "context must have envelope and entries array");
  }
  // Shape validation already passed before this check runs; we trust the
  // envelope is a valid TeamOrchestrationEnvelopeV1. Cast accordingly.
  const envelope = ctx.envelope as TeamOrchestrationEnvelopeV1;
  const locators = collectEvidenceLocators(envelope);
  if (locators.length === 0) return;

  const evidenceIds = new Set(extractEvidenceEvents(ctx.entries).map((e) => e.evidenceId));
  for (const locator of locators) {
    if (!evidenceIds.has(locator)) {
      fail("locator-resolves", `evidence locator '${locator}' does not resolve to any recorded evidence event`);
    }
  }
}
