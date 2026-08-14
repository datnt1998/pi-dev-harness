/**
 * Default registry instance for the evidence-referential-integrity module.
 * Separate from `invariants.ts` to avoid circular imports between
 * team-orchestration-protocol and ticket-runner-state.
 */

import { InvariantRegistry } from "./invariant-registry.ts";
import { EVIDENCE_MODULE, installEvidenceReferentialIntegrity } from "./evidence-integrity.ts";

export const defaultRegistry = new InvariantRegistry();
defaultRegistry.register(EVIDENCE_MODULE, installEvidenceReferentialIntegrity);
