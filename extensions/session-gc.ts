/**
 * Session/artifact garbage-collection extension (spec R2, R4, R5).
 * Pure planning logic lives in `../lib/gc-core.ts`; this file wires it to the
 * host filesystem, following the same conventions as `./autocompact.ts`:
 * layered project/global settings persistence, `safeCtx`/`safeCtxAsync`
 * guarded host access (reused from `../lib/autocompact-core.ts`), and a
 * single registered command with status/help output.
 *
 * `/gc` scans three areas at call time (R2):
 * - sessions: the host session store directory for the current project's cwd
 *   slug (agent sessions root + encoded cwd), holding `.jsonl` transcripts
 *   and their same-stem sibling directories;
 * - subagent-temp: `<tmpdir>/pi-subagents-uid-<uid>/{async-subagent-runs,
 *   async-subagent-results,nested-subagent-events}`;
 * - project-artifacts: `<cwd>/.pi-subagents/artifacts`.
 * Missing/unresolvable roots are skipped, never guessed.
 *
 * `status` reports per-area child count and bytes; `dry-run` shows the plan
 * summary plus up to ten example candidate paths per area; `run` deletes
 * exactly the freshly computed plan's candidates (re-verifying each path is
 * still a direct child of its resolved root immediately before removal),
 * collects per-path errors, and reports bytes reclaimed per area (R5). With
 * `auto` on, one throttled sweep runs per day at session start, silent
 * unless it reclaimed something; sweep errors never propagate (R4).
 */
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFile, writeFile, readdir, lstat, rm, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import { safeCtx, safeCtxAsync } from "../lib/autocompact-core.ts";
import {
  buildGcPlan,
  summarizeGcPlan,
  type GcAreaInput,
  type GcFileFact,
  type GcPlan,
  type GcPolicy,
  type GcRunState,
} from "../lib/gc-core.ts";

// --- Settings (mirrors autocompact.ts's layered project/global persistence) ---

export type SessionGcSettings = {
  sessionsDays: number;
  artifactsDays: number;
  auto: boolean;
  /** Epoch ms of the last completed auto sweep (throttles to once per day). */
  lastSweepMs?: number;
};

export const DEFAULT_SESSION_GC_SETTINGS: SessionGcSettings = {
  sessionsDays: 30,
  artifactsDays: 7,
  auto: false,
};

/** Normalize possibly-partial/garbage persisted settings into a safe shape. */
export function normalizeSessionGcSettings(raw: unknown): SessionGcSettings {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sessionsDays =
    typeof source.sessionsDays === "number" && Number.isFinite(source.sessionsDays) && source.sessionsDays > 0
      ? Math.round(source.sessionsDays)
      : DEFAULT_SESSION_GC_SETTINGS.sessionsDays;
  const artifactsDays =
    typeof source.artifactsDays === "number" && Number.isFinite(source.artifactsDays) && source.artifactsDays > 0
      ? Math.round(source.artifactsDays)
      : DEFAULT_SESSION_GC_SETTINGS.artifactsDays;
  const settings: SessionGcSettings = { sessionsDays, artifactsDays, auto: source.auto === true };
  if (typeof source.lastSweepMs === "number" && Number.isFinite(source.lastSweepMs)) {
    settings.lastSweepMs = source.lastSweepMs;
  }
  return settings;
}

function agentDir(): string {
  return process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
}

function globalSettingsPath(): string {
  return join(agentDir(), "session-gc.json");
}

function projectSettingsPath(cwd: string): string {
  return join(cwd, ".pi", "session-gc.json");
}

async function readSettingsFile(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

// --- Area resolution (R2) ---

const SUBAGENT_TEMP_SUBDIRS = ["async-subagent-runs", "async-subagent-results", "nested-subagent-events"] as const;

/** Terminal-ish `status.json` states; anything else recognized is "active". Unrecognized/unparsable -> "unknown" (fail closed). */
const TERMINAL_RUN_STATES = new Set(["completed", "success", "succeeded", "failed", "error", "errored", "cancelled", "canceled", "terminated", "done"]);
const ACTIVE_RUN_STATES = new Set(["running", "pending", "queued", "started", "in_progress", "in-progress"]);

function sessionsRoot(cwd: string): string {
  const resolvedCwd = resolve(cwd);
  const safeSlug = `--${resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  return join(agentDir(), "sessions", safeSlug);
}

/**
 * Test-only override for the subagent temp root env var. The real root
 * (`<tmpdir>/pi-subagents-uid-<uid>`) is live, shared, host-wide state used
 * by concurrently running subagent orchestration; tests must never scan or
 * delete inside it, so they point this at a private sandboxed directory
 * instead. Unset in production, where the real path is always used.
 */
export const SUBAGENT_TEMP_ROOT_OVERRIDE_ENV = "__SESSION_GC_TEST_SUBAGENT_TEMP_ROOT__";

function subagentTempRoot(): string | undefined {
  const override = process.env[SUBAGENT_TEMP_ROOT_OVERRIDE_ENV];
  if (override) return override;
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid === undefined) return undefined;
  return join(tmpdir(), `pi-subagents-uid-${uid}`);
}

function projectArtifactsRoot(cwd: string): string {
  return join(cwd, ".pi-subagents", "artifacts");
}

/** Normalize a path for comparison (collapse separators/`.`/`..`, strip trailing slash). */
function normalizePath(path: string): string {
  const normalized = normalize(path);
  return normalized.length > 1 && (normalized.endsWith("/") || normalized.endsWith("\\")) ? normalized.slice(0, -1) : normalized;
}

/** Basename with its extension stripped for files; the basename itself for dirs. */
function fileStem(path: string, kind: "file" | "dir"): string {
  const base = basename(path);
  if (kind === "dir") return base;
  const ext = extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}

async function lstatSafe(path: string) {
  try {
    return await lstat(path);
  } catch {
    return undefined;
  }
}

/** Recursively sum file sizes under `path`, never following symlinks (R5). */
async function walkSizeBytes(path: string): Promise<number> {
  const st = await lstatSafe(path);
  if (!st || st.isSymbolicLink()) return 0;
  if (st.isFile()) return st.size;
  if (!st.isDirectory()) return 0;
  let entries: Dirent[];
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    total += await walkSizeBytes(join(path, entry.name));
  }
  return total;
}

type ChildFact = { name: string; fact: GcFileFact };

/** Direct children of `root` only (symlinked children are skipped entirely); sizes via recursive walk. */
async function gatherChildFacts(root: string): Promise<ChildFact[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const results: ChildFact[] = [];
  for (const entry of entries) {
    const childPath = join(root, entry.name);
    const st = await lstatSafe(childPath);
    if (!st || st.isSymbolicLink()) continue;
    const kind: "file" | "dir" = st.isDirectory() ? "dir" : "file";
    const sizeBytes = kind === "dir" ? await walkSizeBytes(childPath) : st.size;
    results.push({ name: entry.name, fact: { path: childPath, mtimeMs: st.mtimeMs, sizeBytes, kind } });
  }
  return results;
}

/** Read a subagent run child's `status.json` and classify it (missing/unparsable -> "unknown", fail closed). */
async function readRunState(childPath: string, isDir: boolean): Promise<GcRunState> {
  if (!isDir) return "unknown";
  try {
    const raw = JSON.parse(await readFile(join(childPath, "status.json"), "utf8")) as Record<string, unknown>;
    const state = typeof raw.state === "string" ? raw.state.toLowerCase() : undefined;
    if (state === undefined) return "unknown";
    if (TERMINAL_RUN_STATES.has(state)) return "terminal";
    if (ACTIVE_RUN_STATES.has(state)) return "active";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/** Resolve every scan area's facts at call time; missing/unresolvable roots are skipped (R2). */
export async function gatherGcAreas(cwd: string): Promise<GcAreaInput[]> {
  const areas: GcAreaInput[] = [];

  const sessRoot = sessionsRoot(cwd);
  if (await directoryExists(sessRoot)) {
    const children = await gatherChildFacts(sessRoot);
    areas.push({ kind: "sessions", root: sessRoot, facts: children.map((c) => c.fact) });
  }

  const tempRoot = subagentTempRoot();
  if (tempRoot) {
    for (const sub of SUBAGENT_TEMP_SUBDIRS) {
      const subRoot = join(tempRoot, sub);
      if (!(await directoryExists(subRoot))) continue;
      const children = await gatherChildFacts(subRoot);
      let runStates: Record<string, GcRunState> | undefined;
      if (sub === "async-subagent-runs") {
        runStates = {};
        for (const child of children) {
          runStates[child.name] = await readRunState(child.fact.path, child.fact.kind === "dir");
        }
      }
      areas.push({ kind: "subagent-temp", root: subRoot, facts: children.map((c) => c.fact), runStates });
    }
  }

  const artifactsRoot = projectArtifactsRoot(cwd);
  if (await directoryExists(artifactsRoot)) {
    const children = await gatherChildFacts(artifactsRoot);
    areas.push({ kind: "project-artifacts", root: artifactsRoot, facts: children.map((c) => c.fact) });
  }

  return areas;
}

/** Resolve the current session's stem (basename without extension) from a guarded ctx access. */
function currentSessionStem(ctx: ExtensionContext): string | undefined {
  const sessionFile = safeCtx(() => ctx.sessionManager?.getSessionFile());
  return sessionFile ? fileStem(sessionFile, "file") : undefined;
}

function resolvePolicy(ctx: ExtensionContext, settings: SessionGcSettings): GcPolicy {
  return {
    nowMs: Date.now(),
    sessionsDays: settings.sessionsDays,
    artifactsDays: settings.artifactsDays,
    currentSessionStem: currentSessionStem(ctx),
  };
}

// --- Reporting ---

function totalBytes(facts: GcFileFact[]): number {
  return facts.reduce((sum, f) => sum + f.sizeBytes, 0);
}

export function formatStatusText(areas: GcAreaInput[]): string {
  if (areas.length === 0) return "session-gc: no scan areas found";
  return areas.map((area) => `${area.kind} (${area.root}): ${area.facts.length} item(s), ${totalBytes(area.facts)} bytes`).join("\n");
}

export function formatDryRunText(plan: GcPlan): string {
  const lines = [summarizeGcPlan(plan)];
  for (const area of plan.areas) {
    if (area.candidates.length === 0) continue;
    lines.push(`${area.kind} (${area.root}) candidates:`);
    for (const candidate of area.candidates.slice(0, 10)) {
      lines.push(`  - ${candidate.path} (${candidate.sizeBytes} bytes, ${Math.floor(candidate.ageDays)}d old)`);
    }
  }
  return lines.join("\n");
}

/**
 * Delete exactly the plan's candidates. Never deletes when the plan is
 * empty; re-verifies each path is still a direct child of its resolved area
 * root immediately before removal (a forged/stale candidate is refused, not
 * thrown on) and collects per-path errors instead of throwing (R5).
 */
export async function executeGcPlan(plan: GcPlan): Promise<string> {
  const hasCandidates = plan.areas.some((area) => area.candidates.length > 0);
  if (!hasCandidates) return "session-gc: nothing to reclaim (plan is empty)";

  const lines: string[] = [];
  const errors: string[] = [];
  let grandTotal = 0;

  for (const area of plan.areas) {
    if (area.candidates.length === 0) continue;
    const normalizedRoot = normalizePath(area.root);
    let reclaimed = 0;
    for (const candidate of area.candidates) {
      const normalizedPath = normalizePath(candidate.path);
      if (dirname(normalizedPath) !== normalizedRoot) {
        errors.push(`${candidate.path}: refused (outside resolved root ${area.root})`);
        continue;
      }
      try {
        await rm(candidate.path, { recursive: true, force: true });
        reclaimed += candidate.sizeBytes;
      } catch (error) {
        errors.push(`${candidate.path}: ${(error as Error).message}`);
      }
    }
    grandTotal += reclaimed;
    lines.push(`${area.kind} (${area.root}): reclaimed ${reclaimed} bytes`);
  }
  lines.push(`Total reclaimed: ${grandTotal} bytes`);
  if (errors.length > 0) lines.push("Errors:", ...errors.map((e) => `  - ${e}`));
  return lines.join("\n");
}

// --- Command parsing ---

export type GcCommand =
  | { kind: "status" }
  | { kind: "dry-run" }
  | { kind: "run" }
  | { kind: "auto"; on: boolean }
  | { kind: "days"; sessionsDays: number; artifactsDays: number }
  | { kind: "help" }
  | { kind: "error"; message: string };

export const GC_SUBCOMMANDS = ["status", "dry-run", "run", "auto", "days", "help"] as const;

export function parseGcCommand(args: string): GcCommand {
  const trimmed = args.trim();
  if (trimmed.length === 0) return { kind: "status" };
  const [head, ...rest] = trimmed.split(/\s+/);
  switch (head.toLowerCase()) {
    case "status":
      return { kind: "status" };
    case "dry-run":
      return { kind: "dry-run" };
    case "run":
      return { kind: "run" };
    case "help":
      return { kind: "help" };
    case "auto": {
      const v = (rest[0] ?? "").toLowerCase();
      if (v === "on") return { kind: "auto", on: true };
      if (v === "off") return { kind: "auto", on: false };
      return { kind: "error", message: "Usage: /gc auto on|off" };
    }
    case "days": {
      const sessionsDays = Number(rest[0]);
      const artifactsDays = Number(rest[1]);
      if (!Number.isFinite(sessionsDays) || !Number.isFinite(artifactsDays) || sessionsDays <= 0 || artifactsDays <= 0) {
        return { kind: "error", message: "Usage: /gc days <sessionsDays> <artifactsDays>" };
      }
      return { kind: "days", sessionsDays: Math.round(sessionsDays), artifactsDays: Math.round(artifactsDays) };
    }
    default:
      return { kind: "help" };
  }
}

export const GC_HELP_TEXT = [
  "/gc — show per-area status",
  "/gc status — per-area child count and bytes",
  "/gc dry-run — plan summary plus up to ten example candidate paths per area",
  "/gc run — delete plan candidates, report bytes reclaimed per area",
  "/gc auto on|off — toggle throttled daily auto sweep at session start",
  "/gc days <sessionsDays> <artifactsDays> — set retention windows",
].join("\n");

// --- Extension wiring ---

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type SessionGcState = {
  settings: SessionGcSettings;
};

export default function sessionGc(pi: ExtensionAPI) {
  const state: SessionGcState = { settings: { ...DEFAULT_SESSION_GC_SETTINGS } };

  async function loadSettings(cwd: string): Promise<void> {
    const projectRaw = await readSettingsFile(projectSettingsPath(cwd));
    if (projectRaw !== undefined) {
      state.settings = normalizeSessionGcSettings(projectRaw);
      return;
    }
    const globalRaw = await readSettingsFile(globalSettingsPath());
    state.settings = globalRaw !== undefined ? normalizeSessionGcSettings(globalRaw) : { ...DEFAULT_SESSION_GC_SETTINGS };
  }

  async function persistSettings(ctx: ExtensionContext): Promise<void> {
    await safeCtxAsync(async () => {
      const target = (await directoryExists(join(ctx.cwd, ".pi"))) ? projectSettingsPath(ctx.cwd) : globalSettingsPath();
      try {
        await writeFile(target, `${JSON.stringify(state.settings, null, 2)}\n`, "utf8");
      } catch (error) {
        ctx.ui.notify(`session-gc: could not persist settings (${(error as Error).message})`, "warning");
      }
    });
  }

  /** Throttled daily auto sweep at session start (R4): silent unless it reclaimed bytes; errors never propagate. */
  async function maybeAutoSweep(ctx: ExtensionContext): Promise<void> {
    if (!state.settings.auto) return;
    const now = Date.now();
    const last = state.settings.lastSweepMs ?? 0;
    if (now - last < ONE_DAY_MS) return;
    try {
      const cwd = ctx.cwd;
      const areas = await gatherGcAreas(cwd);
      const policy = resolvePolicy(ctx, state.settings);
      const plan = buildGcPlan(areas, policy);
      await executeGcPlan(plan);
      state.settings = { ...state.settings, lastSweepMs: now };
      await persistSettings(ctx);
      if (plan.totalReclaimBytes > 0) {
        safeCtx(() => ctx.ui.notify(`session-gc: auto sweep reclaimed ${plan.totalReclaimBytes} bytes`, "info"));
      }
    } catch {
      // Auto sweep must never fail or block the session (R4).
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    await safeCtxAsync(async () => {
      await loadSettings(ctx.cwd);
      await maybeAutoSweep(ctx);
    });
  });

  pi.registerCommand("gc", {
    description: "Session/artifact GC: status | dry-run | run | auto on|off | days <sessions> <artifacts>",
    getArgumentCompletions: (prefix) => {
      const items = GC_SUBCOMMANDS.filter((name) => name.startsWith(prefix.toLowerCase())).map((name) => ({ value: name, label: name }));
      return items.length > 0 ? items : null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await safeCtxAsync(async () => {
        const cmd = parseGcCommand(args);
        switch (cmd.kind) {
          case "help":
            ctx.ui.notify(GC_HELP_TEXT, "info");
            return;
          case "error":
            ctx.ui.notify(cmd.message, "error");
            return;
          case "auto": {
            state.settings = { ...state.settings, auto: cmd.on };
            await persistSettings(ctx);
            ctx.ui.notify(`session-gc: auto sweep ${cmd.on ? "ON" : "OFF"}`, "info");
            return;
          }
          case "days": {
            state.settings = { ...state.settings, sessionsDays: cmd.sessionsDays, artifactsDays: cmd.artifactsDays };
            await persistSettings(ctx);
            ctx.ui.notify(`session-gc: retention set to ${cmd.sessionsDays}d sessions / ${cmd.artifactsDays}d artifacts`, "info");
            return;
          }
          case "status": {
            const areas = await gatherGcAreas(ctx.cwd);
            ctx.ui.notify(formatStatusText(areas), "info");
            return;
          }
          case "dry-run": {
            const areas = await gatherGcAreas(ctx.cwd);
            const plan = buildGcPlan(areas, resolvePolicy(ctx, state.settings));
            ctx.ui.notify(formatDryRunText(plan), "info");
            return;
          }
          case "run": {
            const areas = await gatherGcAreas(ctx.cwd);
            const plan = buildGcPlan(areas, resolvePolicy(ctx, state.settings));
            const report = await executeGcPlan(plan);
            ctx.ui.notify(report, "info");
            return;
          }
        }
      });
    },
  });
}
