/**
 * Session/artifact GC planning core (pure, no fs or clock access).
 *
 * Given injected filesystem facts (path, mtime, size, kind) for a set of scan
 * areas and a retention policy, produces a deterministic GC plan: per-area
 * candidate lists (age + bytes) plus a summary. Protection is fail-closed —
 * see `isProtected` below for the full rule set (spec R3). The extension
 * (`extensions/session-gc.ts`) supplies real facts and performs deletion;
 * this module never touches the filesystem or the clock.
 */
import { basename, dirname, extname, normalize } from "node:path";

export type GcAreaKind = "sessions" | "subagent-temp" | "project-artifacts";

export type GcFileFact = {
  path: string;
  mtimeMs: number;
  sizeBytes: number;
  kind: "file" | "dir";
};

/** Run-state classification for a top-level child, keyed by child name. */
export type GcRunState = "terminal" | "active" | "unknown";

export type GcAreaInput = {
  kind: GcAreaKind;
  root: string;
  facts: GcFileFact[];
  /** Maps a top-level child name (basename) to its run state. */
  runStates?: Record<string, GcRunState>;
};

export type GcPolicy = {
  nowMs: number;
  sessionsDays: number;
  artifactsDays: number;
  /** Stem (basename without extension) of the current session's `.jsonl` file. */
  currentSessionStem?: string;
};

export type GcCandidate = {
  path: string;
  ageDays: number;
  sizeBytes: number;
};

export type GcAreaPlan = {
  kind: GcAreaKind;
  root: string;
  candidates: GcCandidate[];
  protectedCount: number;
  reclaimBytes: number;
};

export type GcPlan = {
  areas: GcAreaPlan[];
  totalReclaimBytes: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Timestamp-shaped stem prefix expected of every sessions-area top-level child. */
const SESSION_TIMESTAMP_PREFIX_RE = /^\d+-/;

/** Normalize a path for comparison (collapse separators/`.`/`..`, strip trailing slash). */
function normalizePath(path: string): string {
  const normalized = normalize(path);
  return normalized.length > 1 && (normalized.endsWith("/") || normalized.endsWith("\\"))
    ? normalized.slice(0, -1)
    : normalized;
}

/** Basename with its extension stripped for files; the basename itself for dirs. */
function fileStem(path: string, kind: "file" | "dir"): string {
  const base = basename(path);
  if (kind === "dir") return base;
  const ext = extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

function windowDaysFor(kind: GcAreaKind, policy: GcPolicy): number {
  return kind === "sessions" ? policy.sessionsDays : policy.artifactsDays;
}

/**
 * Fail-closed protection check (R3). A fact is protected when any of:
 * - `mtimeMs` is missing/non-finite (unreadable metadata);
 * - its path is not a direct child of the area root (unknown layout);
 * - it is a sessions-area child whose stem is not timestamp-shaped;
 * - its stem matches the current session (file or same-stem sibling dir);
 * - its `runStates` entry (by basename) is `active` or `unknown`;
 * - it is newer than the area's retention window.
 * A child absent from `runStates` falls back to the age rule.
 */
function isProtected(fact: GcFileFact, area: GcAreaInput, normalizedRoot: string, policy: GcPolicy): boolean {
  if (!Number.isFinite(fact.mtimeMs)) return true;

  const normalizedPath = normalizePath(fact.path);
  if (dirname(normalizedPath) !== normalizedRoot) return true;

  const stem = fileStem(fact.path, fact.kind);
  if (area.kind === "sessions" && !SESSION_TIMESTAMP_PREFIX_RE.test(stem)) return true;

  if (policy.currentSessionStem !== undefined && stem === policy.currentSessionStem) return true;

  const runState = area.runStates?.[basename(normalizedPath)];
  if (runState === "active" || runState === "unknown") return true;

  const ageDays = (policy.nowMs - fact.mtimeMs) / MS_PER_DAY;
  if (ageDays < windowDaysFor(area.kind, policy)) return true;

  return false;
}

function buildAreaPlan(area: GcAreaInput, policy: GcPolicy): GcAreaPlan {
  const normalizedRoot = normalizePath(area.root);
  const candidates: GcCandidate[] = [];
  let protectedCount = 0;

  for (const fact of area.facts) {
    if (isProtected(fact, area, normalizedRoot, policy)) {
      protectedCount += 1;
      continue;
    }
    const ageDays = (policy.nowMs - fact.mtimeMs) / MS_PER_DAY;
    candidates.push({ path: fact.path, ageDays, sizeBytes: fact.sizeBytes });
  }

  candidates.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const reclaimBytes = candidates.reduce((sum, c) => sum + c.sizeBytes, 0);

  return { kind: area.kind, root: area.root, candidates, protectedCount, reclaimBytes };
}

/** Build a deterministic GC plan from injected area facts and a retention policy (R1). */
export function buildGcPlan(areas: readonly GcAreaInput[], policy: GcPolicy): GcPlan {
  const areaPlans = areas.map((area) => buildAreaPlan(area, policy));
  const totalReclaimBytes = areaPlans.reduce((sum, a) => sum + a.reclaimBytes, 0);
  return { areas: areaPlans, totalReclaimBytes };
}

/** One short line per area plus a total line, for `/gc dry-run` / `/gc status` output. */
export function summarizeGcPlan(plan: GcPlan): string {
  const lines = plan.areas.map(
    (area) =>
      `${area.kind}: ${area.candidates.length} candidate(s), ${area.protectedCount} protected, ${area.reclaimBytes} bytes reclaimable`,
  );
  lines.push(`Total: ${plan.totalReclaimBytes} bytes reclaimable`);
  return lines.join("\n");
}
