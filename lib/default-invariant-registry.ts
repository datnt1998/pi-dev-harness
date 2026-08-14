/**
 * Production singleton wiring for the invariant registry.
 *
 * Imports the default registry from `invariants.ts` (which pre-installs the
 * `"ticket-runner-state"` set at module load) and re-exports it under a name
 * that makes the singleton intent explicit. Tests never import this file;
 * they construct fresh `InvariantRegistry` instances directly.
 */

export { defaultRegistry as registry } from "./invariants.ts";
