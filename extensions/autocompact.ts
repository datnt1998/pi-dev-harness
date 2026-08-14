/**
 * Auto-compact extension (Claude Code-style context management for Pi).
 * Portable harness extension; pure logic + tests live in
 * `../lib/autocompact-core.ts` and `../tests/autocompact-core.test.ts`.
 *
 * - Persistent indicator near the editor once context gets close to the
 *   warning tier ("N tokens left until auto-compact").
 * - Tiered warnings (warn -> critical) via notifications, deduplicated.
 * - Proactive compaction at a configurable trigger: percent of the context
 *   window (default 90%) AND/OR an absolute token cap (`at 200k`) — the
 *   effective trigger is min(percent, tokens), so large-window (1M) models
 *   compact early instead of wasting cache/cost on a huge context. Fired only
 *   at safe idle boundaries (agent_settled), before Pi's built-in overflow
 *   safety net (~contextWindow - reserveTokens).
 * - `/autocompact` command: status | on | off | at <pct|tokens> | warn <pct> |
 *   focus <text|clear> | native on|off | reorient on|off | now [instructions].
 * - Compaction context recovery: tracks genuine USAGE signals — `/skill:<name>`
 *   invocations and `skills/<name>/SKILL.md` / `.scratch/<effort>/` paths in
 *   tool-call arguments (mentions in listings/greps/results never count) —
 *   seen on the branch SINCE the previous compaction (windowed — stale skills
 *   age out; the extension's own sentinel-tagged follow-ups are never scanned). Extension-triggered compaction without explicit instructions steers
 *   the summary to preserve them; every `session_compact` (any source) sends
 *   one post-compaction follow-up naming what to LAZILY re-read on next use
 *   (never a preemptive re-read, never full re-injection). Toggle with
 *   `reorient on|off` (default on).
 *
 * Settings are layered:
 * - global default:  $PI_CODING_AGENT_DIR (or ~/.pi/agent)/autocompact.json
 * - project override: <cwd>/.pi/autocompact.json (wins entirely when present)
 * Changes made via /autocompact persist to the project file when the project
 * has a .pi/ directory, otherwise to the global file.
 *
 * Pi's built-in compaction remains untouched as a safety net; this extension
 * simply compacts earlier, with custom focus instructions and better UX.
 */
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadJsonSettings, rejectUnknownFields } from "../lib/config-load.ts";
import {
  type ActivityObservations,
  AUTOCOMPACT_HELP_TEXT,
  AUTOCOMPACT_SUBCOMMANDS,
  applyAutoCompactCommand,
  type AutoCompactSettings,
  buildCompactionFocus,
  buildReorientationMessage,
  type CompactTier,
  computeNativeReserveTokens,
  DEFAULT_AUTOCOMPACT_SETTINGS,
  evaluateAutoCompact,
  extractActivityObservations,
  formatCompactionReport,
  formatIndicatorLine,
  formatIndicatorThemed,
  formatStatusText,
  isStaleCtxError,
  normalizeAutoCompactSettings,
  parseAutoCompactCommand,
  resolveCompactionSource,
  safeCtx,
  safeCtxAsync,
  shouldShowIndicator,
  type SkillObservation,
} from "../lib/autocompact-core.ts";

const GLOBAL_SETTINGS_PATH = join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "autocompact.json");
/** Pi's own settings file (project scope) where `compaction.reserveTokens` lives. */
function piProjectSettingsPath(cwd: string): string {
  return join(cwd, ".pi", "settings.json");
}
const UI_KEY = "autocompact";
/** Child agents share the project settings file with the parent and must never mutate it. */
function isSubagentChild(): boolean {
  return process.env.PI_SUBAGENT_CHILD === "1";
}
/** Stop auto-attempts after this many consecutive failures (built-in safety net still applies). */
const MAX_AUTO_FAILURES = 2;

type AutoCompactState = {
  settings: AutoCompactSettings;
  lastTier: CompactTier;
  compacting: boolean;
  /** True while a compaction triggered by our threshold (not /autocompact now) is in flight or just finished. */
  autoTriggered: boolean;
  autoFailures: number;
  /** Last native reserveTokens value we wrote this session (dedup guard). */
  nativeReserveWritten?: number;
  /** Skills/effort dirs observed on the branch so far this session (R1/R2/R3). */
  observations: ActivityObservations;
  /** Number of branch entries already scanned into `observations` (incremental cursor). */
  branchCursor: number;
};

/**
 * Merge newly-scanned observations into the running set: skills unify by
 * name (a later-found path fills in an earlier name-only sighting, per the
 * "best-known path" contract), efforts dedupe by name.
 */
function mergeObservations(base: ActivityObservations, extra: ActivityObservations): ActivityObservations {
  const skills = new Map<string, SkillObservation>(base.skills.map((s) => [s.name, { ...s }]));
  for (const skill of extra.skills) {
    const existing = skills.get(skill.name);
    if (existing) {
      if (!existing.path && skill.path) existing.path = skill.path;
    } else {
      skills.set(skill.name, { ...skill });
    }
  }
  const efforts = new Set([...base.efforts, ...extra.efforts]);
  return { skills: [...skills.values()], efforts: [...efforts].sort() };
}

function projectSettingsPath(cwd: string): string {
  return join(cwd, ".pi", "autocompact.json");
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

export default function autocompact(pi: ExtensionAPI) {
  const state: AutoCompactState = {
    settings: { ...DEFAULT_AUTOCOMPACT_SETTINGS },
    lastTier: "none",
    compacting: false,
    autoTriggered: false,
    autoFailures: 0,
    observations: { skills: [], efforts: [] },
    branchCursor: 0,
  };

  async function loadSettings(cwd: string): Promise<void> {
    const validator = (raw: Record<string, unknown>) => {
      rejectUnknownFields(["enabled", "triggerPercent", "warnPercent", "triggerTokens", "focus", "reorient", "syncNativeReserve"])(raw, "autocompact");
      return normalizeAutoCompactSettings(raw);
    };
    // Project override wins entirely; otherwise global; otherwise defaults.
    const project = loadJsonSettings({ path: projectSettingsPath(cwd), label: "autocompact", validate: validator, defaults: undefined as AutoCompactSettings | undefined });
    if (project !== undefined) {
      state.settings = project;
      return;
    }
    state.settings = loadJsonSettings({ path: GLOBAL_SETTINGS_PATH, label: "autocompact", validate: validator, defaults: { ...DEFAULT_AUTOCOMPACT_SETTINGS } });
  }

  async function persistSettings(ctx: ExtensionContext): Promise<void> {
    // A session replacement across the await below makes every ctx getter throw;
    // treat that as a silent no-op (genuine write failures still warn).
    await safeCtxAsync(async () => {
      const target = (await directoryExists(join(ctx.cwd, ".pi"))) ? projectSettingsPath(ctx.cwd) : GLOBAL_SETTINGS_PATH;
      try {
        await writeFile(target, `${JSON.stringify(state.settings, null, 2)}\n`, "utf8");
      } catch (error) {
        ctx.ui.notify(`autocompact: could not persist settings (${(error as Error).message})`, "warning");
      }
    });
  }

  /**
   * When explicitly enabled, align Pi's native between-turns compaction with our trigger by writing
   * `compaction.reserveTokens` into the PROJECT Pi settings (`.pi/settings.json`),
   * so a long single run compacts mid-run without interrupting it. This is the
   * only non-aborting mid-run mechanism (our own ctx.compact() aborts the run).
   *
   * Project-scoped only (never touches global settings, so a per-model reserve
   * never leaks to other projects) and applies from the next session/reload,
   * since Pi has no runtime setter for reserveTokens. Field-merge preserves any
   * other keys. Child subagents never write the shared project settings file.
   */
  async function syncNativeReserve(ctx: ExtensionContext): Promise<void> {
    if (isSubagentChild() || state.settings.syncNativeReserve !== true || !state.settings.enabled) return;
    // Every ctx getter below throws once the session is replaced across an await
    // (e.g. a fork during `directoryExists`); treat that as a silent no-op so the
    // fire-and-forget turn_end call can never crash teardown. Genuine write
    // failures still warn via the inner catch.
    await safeCtxAsync(async () => {
      if (!(await directoryExists(join(ctx.cwd, ".pi")))) return; // no project scope to write to
      const window = ctx.getContextUsage()?.contextWindow ?? ctx.model?.contextWindow ?? null;
      const desired = computeNativeReserveTokens(window ?? null, state.settings);
      if (desired === undefined) return;
      if (state.nativeReserveWritten === desired) return; // already aligned this session

      const path = piProjectSettingsPath(ctx.cwd);
      const raw = (await readSettingsFile(path)) as Record<string, unknown> | undefined;
      const current = (raw?.compaction as { reserveTokens?: unknown } | undefined)?.reserveTokens;
      if (current === desired) {
        state.nativeReserveWritten = desired;
        return;
      }
      const next = { ...(raw ?? {}) } as Record<string, unknown>;
      next.compaction = { ...((raw?.compaction as Record<string, unknown>) ?? {}), reserveTokens: desired };
      try {
        await writeFile(path, `${JSON.stringify(next, null, 2)}\n`, "utf8");
        state.nativeReserveWritten = desired;
        if (ctx.mode === "tui" && current !== undefined) {
          // Only announce real changes to an existing value; first-time setup is silent.
          ctx.ui.notify("autocompact: mid-run compaction re-aligned (applies next session)", "info");
        }
      } catch (error) {
        ctx.ui.notify(`autocompact: could not align mid-run reserve (${(error as Error).message})`, "warning");
      }
    });
  }

  function updateIndicator(ctx: ExtensionContext): void {
    safeCtx(() => {
      if (!ctx.hasUI || ctx.mode !== "tui") return;
      const usage = ctx.getContextUsage();
      const tokens = usage?.tokens ?? null;
      const contextWindow = usage?.contextWindow ?? null;
      if (tokens === null || contextWindow === null || !shouldShowIndicator(tokens, contextWindow, state.settings)) {
        ctx.ui.setStatus(UI_KEY, undefined);
        ctx.ui.setWidget(UI_KEY, undefined);
        return;
      }
      // Plain, compact string for the status area; colored bar for the widget so
      // it reads as one system with the harness footer / provider-usage bars.
      ctx.ui.setStatus(UI_KEY, formatIndicatorLine(tokens, contextWindow, state.settings));
      const fg = (r: string, t: string) => ctx.ui.theme.fg(r as never, t);
      ctx.ui.setWidget(UI_KEY, [formatIndicatorThemed(fg, tokens, contextWindow, state.settings)], { placement: "belowEditor" });
    });
  }

  /** Full rescan of the branch (session_start): cursor moves to the branch's current end. */
  function rescanBranch(ctx: ExtensionContext): void {
    safeCtx(() => {
      const branch = ctx.sessionManager.getBranch();
      state.observations = extractActivityObservations(branch);
      state.branchCursor = branch.length;
    });
  }

  /** Incremental scan (turn_end): only the entries appended since the last cursor. */
  function scanBranchIncrement(ctx: ExtensionContext): void {
    safeCtx(() => {
      const branch = ctx.sessionManager.getBranch();
      if (branch.length <= state.branchCursor) return;
      const added = extractActivityObservations(branch.slice(state.branchCursor));
      state.observations = mergeObservations(state.observations, added);
      state.branchCursor = branch.length;
    });
  }

  function runCompaction(ctx: ExtensionContext, options: { auto: boolean; instructions?: string }): void {
    state.compacting = true;
    state.autoTriggered = options.auto;
    const customInstructions =
      options.instructions ??
      buildCompactionFocus({
        userFocus: state.settings.focus,
        observations: state.observations,
        reorientEnabled: state.settings.reorient !== false,
      });
    ctx.compact({
      customInstructions,
      onComplete: () => {
        state.compacting = false;
        state.autoFailures = 0;
      },
      // Pi invokes onError from inside a void-ed IIFE's catch block, so a throw
      // here rejects a DETACHED promise → unhandled rejection → exit code 1, the
      // same crash class as the turn_end sync. Compaction can fail long after a
      // fork, so the ctx may be stale: keep state updates outside the guard (the
      // failure counter must still advance) and guard only the ctx access.
      onError: (error) => {
        state.compacting = false;
        state.autoTriggered = false;
        if (options.auto) state.autoFailures += 1;
        safeCtx(() => {
          ctx.ui.notify(`autocompact: compaction failed — ${error.message}`, "error");
          if (options.auto && state.autoFailures === MAX_AUTO_FAILURES) {
            ctx.ui.notify(
              "autocompact: auto-compaction paused after repeated failures (Pi's built-in safety net still applies)",
              "warning",
            );
          }
        });
      },
    });
  }

  function evaluate(ctx: ExtensionContext, canCompact: boolean): void {
    // Synchronous, but a stale ctx still throws from getContextUsage; no-op it.
    safeCtx(() => {
      const usage = ctx.getContextUsage();
      const { decision, nextTier } = evaluateAutoCompact({
        tokens: usage?.tokens ?? null,
        contextWindow: usage?.contextWindow ?? null,
        settings: state.settings,
        lastTier: state.lastTier,
        canCompact: canCompact && !state.compacting && state.autoFailures < MAX_AUTO_FAILURES,
      });
      state.lastTier = nextTier;

      if (decision.action === "notify") {
        ctx.ui.notify(decision.message, decision.severity);
      } else if (decision.action === "compact") {
        ctx.ui.notify(decision.message, "info");
        runCompaction(ctx, { auto: true });
      }
      updateIndicator(ctx);
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    await safeCtxAsync(async () => {
      await loadSettings(ctx.cwd);
      state.lastTier = "none";
      state.compacting = false;
      state.autoTriggered = false;
      state.autoFailures = 0;
      state.nativeReserveWritten = undefined;
      rescanBranch(ctx); // in-memory observations never persist across a restart; rescan fresh
      updateIndicator(ctx);
      await syncNativeReserve(ctx);
    });
  });

  // Warnings + indicator refresh during a run (never compacts mid-run); also a
  // reliable point to align Pi's native mid-run reserve (context window known).
  pi.on("turn_end", (_event, ctx) => {
    scanBranchIncrement(ctx);
    evaluate(ctx, false);
    // Fire-and-forget background sync. syncNativeReserve no-ops on a stale ctx;
    // the catch guarantees a residual rejection can never crash teardown.
    void syncNativeReserve(ctx).catch((error) => {
      if (isStaleCtxError(error)) return;
      // Stay on the SDK's UI channel (a raw stderr write would corrupt the TUI frame).
      safeCtx(() => ctx.ui.notify(`autocompact: native reserve sync failed — ${(error as Error).message}`, "warning"));
    });
  });

  // Safe boundary: no retry/compaction/continuation pending. Compact here.
  pi.on("agent_settled", (_event, ctx) => {
    // Arguments evaluate before evaluate()'s own guard, so guard them here too.
    evaluate(ctx, safeCtx(() => ctx.isIdle() && !ctx.hasPendingMessages()) ?? false);
  });

  pi.on("model_select", async (_event, ctx) => {
    // Context window (and thus thresholds) may have changed; give auto attempts a fresh chance.
    state.lastTier = "none";
    state.autoFailures = 0;
    state.nativeReserveWritten = undefined; // window may differ → recompute
    updateIndicator(ctx);
    await syncNativeReserve(ctx);
  });

  pi.on("session_compact", (event, ctx) => {
    // Extension-triggered compaction reports reason "manual"; resolve the real source.
    const source = resolveCompactionSource(event.reason, state.autoTriggered);
    state.lastTier = "none";
    state.compacting = false;
    state.autoTriggered = false;
    state.autoFailures = 0;
    safeCtx(() =>
      ctx.ui.notify(
        formatCompactionReport({
          tokensBefore: event.compactionEntry.tokensBefore,
          source,
        }),
        "info",
      ),
    );
    updateIndicator(ctx);

    // The branch-scan cursor resets after any compaction (old entries are gone
    // from the live branch). Observations are WINDOWED per compaction: the
    // follow-up covers only activity since the previous compaction, then the
    // window resets. A skill still in use re-enters the next window on its
    // next sighting (including the agent's own lazy re-read), so stale skills
    // age out instead of being re-announced forever.
    const windowObservations = state.observations;
    state.observations = { skills: [], efforts: [] };
    safeCtx(() => {
      state.branchCursor = ctx.sessionManager.getBranch().length;
    });

    if (state.settings.reorient === false) return;
    const message = buildReorientationMessage(windowObservations);
    if (!message) return;
    // sendUserMessage is on `pi`, not `ctx` — no stale-ctx guard needed for the
    // call itself, but a failure here must never be fatal (R5).
    try {
      pi.sendUserMessage(message, { deliverAs: "followUp" });
    } catch (error) {
      safeCtx(() => ctx.ui.notify(`autocompact: re-orientation follow-up failed — ${(error as Error).message}`, "warning"));
    }
  });

  pi.on("session_before_compact", (event, ctx) => {
    if (event.reason === "overflow") {
      safeCtx(() => ctx.ui.notify("Context overflow — running emergency compaction", "warning"));
    }
  });

  // Clean up the indicator status/widget we own so it never leaks past shutdown.
  pi.on("session_shutdown", (_event, ctx) => {
    safeCtx(() => {
      if (ctx.mode !== "tui") return;
      ctx.ui.setStatus(UI_KEY, undefined);
      ctx.ui.setWidget(UI_KEY, undefined);
    });
  });

  pi.registerCommand("autocompact", {
    description: "Auto-compact: status | on | off | at <pct|tokens e.g. 200k> | warn <pct> | focus <text|clear> | native on|off | reorient on|off | now",
    getArgumentCompletions: (prefix) => {
      const items = AUTOCOMPACT_SUBCOMMANDS.filter((name) => name.startsWith(prefix.toLowerCase())).map((name) => ({
        value: name,
        label: name,
      }));
      return items.length > 0 ? items : null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      // ctx is used after the persist/sync awaits below; a session replacement
      // across them makes every getter throw — no-op that silently.
      await safeCtxAsync(async () => {
        const cmd = parseAutoCompactCommand(args);

        switch (cmd.kind) {
          case "status": {
            const usage = ctx.getContextUsage();
            ctx.ui.notify(
              formatStatusText({
                settings: state.settings,
                tokens: usage?.tokens ?? null,
                contextWindow: usage?.contextWindow ?? ctx.model?.contextWindow ?? null,
              }),
              "info",
            );
            return;
          }
          case "help":
            ctx.ui.notify(AUTOCOMPACT_HELP_TEXT, "info");
            return;
          case "error":
            ctx.ui.notify(cmd.message, "error");
            return;
          case "now": {
            if (!ctx.isIdle()) await ctx.waitForIdle();
            ctx.ui.notify("Compacting context…", "info");
            runCompaction(ctx, { auto: false, instructions: cmd.instructions });
            return;
          }
          default: {
            const result = applyAutoCompactCommand(state.settings, cmd);
            if (result.error) {
              ctx.ui.notify(result.error, "error");
              return;
            }
            state.settings = result.settings;
            state.lastTier = "none"; // re-arm warnings for the new thresholds
            if (result.changed) {
              await persistSettings(ctx);
              state.nativeReserveWritten = undefined; // trigger/tokens/native may have changed
              await syncNativeReserve(ctx);
            }
            if (result.reply) ctx.ui.notify(result.reply, "info");
            updateIndicator(ctx);
          }
        }
      });
    },
  });
}
