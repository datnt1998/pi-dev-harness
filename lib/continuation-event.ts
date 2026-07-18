/**
 * Versioned continuation coordination contract (`harness:continuation:v1`).
 *
 * Producers (e.g. ticket-runner) synchronously announce `planned=true` before
 * queuing follow-up work and clear it at the next turn boundary. Consumers
 * (e.g. pi-memory) check the registry after deferred finalization so an
 * automatic enqueue can never race a planned continuation.
 *
 * Importers of this physical module share its registry through the module
 * cache. Separately packaged consumers may keep their own registry copy; the
 * synchronous `pi.events` announcement is therefore the portable coordination
 * boundary and each consumer applies received events to its local registry.
 */

export const CONTINUATION_EVENT = "harness:continuation:v1";

export type ContinuationAnnouncement = {
  version: 1;
  owner: string;
  sessionId: string;
  planned: boolean;
  /** Monotonic per-process generation; consumers can detect changes. */
  generation: number;
};

const OWNER = /^[a-zA-Z0-9._-]{1,64}$/;

export function validateContinuationEvent(value: unknown): { ok: true; event: ContinuationAnnouncement } | { ok: false; error: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false, error: "not an object" };
  const event = value as Record<string, unknown>;
  const keys = Object.keys(event);
  if (keys.some((key) => !["version", "owner", "sessionId", "planned", "generation"].includes(key))) {
    return { ok: false, error: "unknown key" };
  }
  if (event.version !== 1) return { ok: false, error: "unsupported version" };
  if (typeof event.owner !== "string" || !OWNER.test(event.owner)) return { ok: false, error: "invalid owner" };
  if (typeof event.sessionId !== "string" || event.sessionId === "" || event.sessionId.length > 128) {
    return { ok: false, error: "invalid sessionId" };
  }
  if (typeof event.planned !== "boolean") return { ok: false, error: "invalid planned" };
  if (typeof event.generation !== "number" || !Number.isInteger(event.generation) || event.generation < 0) {
    return { ok: false, error: "invalid generation" };
  }
  return { ok: true, event: event as ContinuationAnnouncement };
}

export type ContinuationRegistry = {
  announce(owner: string, sessionId: string, planned: boolean): ContinuationAnnouncement;
  /** Applies an externally received event (bus consumers). */
  apply(event: unknown): boolean;
  anyPlanned(): boolean;
  plannedBy(): string[];
  generation(): number;
  reset(): void;
};

export function createContinuationRegistry(): ContinuationRegistry {
  let generation = 0;
  const planned = new Map<string, boolean>();
  return {
    announce(owner, sessionId, plannedFlag) {
      if (!OWNER.test(owner)) throw new TypeError("invalid continuation owner");
      generation += 1;
      planned.set(owner, plannedFlag === true);
      return { version: 1, owner, sessionId, planned: plannedFlag === true, generation };
    },
    apply(event) {
      const validated = validateContinuationEvent(event);
      if (!validated.ok) return false;
      generation = Math.max(generation, validated.event.generation);
      planned.set(validated.event.owner, validated.event.planned);
      return true;
    },
    anyPlanned() {
      return [...planned.values()].some(Boolean);
    },
    plannedBy() {
      return [...planned.entries()].filter(([, value]) => value).map(([owner]) => owner).sort();
    },
    generation() {
      return generation;
    },
    reset() {
      planned.clear();
      generation += 1;
    },
  };
}

/** Singleton for importers of this physical module instance. */
export const continuationRegistry: ContinuationRegistry = createContinuationRegistry();
