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
 *   focus <text|clear> | now [instructions].
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
import {
  AUTOCOMPACT_HELP_TEXT,
  AUTOCOMPACT_SUBCOMMANDS,
  applyAutoCompactCommand,
  type AutoCompactSettings,
  type CompactTier,
  DEFAULT_AUTOCOMPACT_SETTINGS,
  evaluateAutoCompact,
  formatCompactionReport,
  formatIndicatorLine,
  formatStatusText,
  normalizeAutoCompactSettings,
  parseAutoCompactCommand,
  resolveCompactionSource,
  shouldShowIndicator,
} from "../lib/autocompact-core.ts";

const GLOBAL_SETTINGS_PATH = join(process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent"), "autocompact.json");
const UI_KEY = "autocompact";
/** Stop auto-attempts after this many consecutive failures (built-in safety net still applies). */
const MAX_AUTO_FAILURES = 2;

type AutoCompactState = {
  settings: AutoCompactSettings;
  lastTier: CompactTier;
  compacting: boolean;
  /** True while a compaction triggered by our threshold (not /autocompact now) is in flight or just finished. */
  autoTriggered: boolean;
  autoFailures: number;
};

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
  };

  async function loadSettings(cwd: string): Promise<void> {
    // Project override wins entirely; otherwise global; otherwise defaults.
    const projectRaw = await readSettingsFile(projectSettingsPath(cwd));
    if (projectRaw !== undefined) {
      state.settings = normalizeAutoCompactSettings(projectRaw);
      return;
    }
    const globalRaw = await readSettingsFile(GLOBAL_SETTINGS_PATH);
    state.settings = globalRaw !== undefined ? normalizeAutoCompactSettings(globalRaw) : { ...DEFAULT_AUTOCOMPACT_SETTINGS };
  }

  async function persistSettings(ctx: ExtensionContext): Promise<void> {
    const target = (await directoryExists(join(ctx.cwd, ".pi"))) ? projectSettingsPath(ctx.cwd) : GLOBAL_SETTINGS_PATH;
    try {
      await writeFile(target, `${JSON.stringify(state.settings, null, 2)}\n`, "utf8");
    } catch (error) {
      ctx.ui.notify(`autocompact: could not persist settings (${(error as Error).message})`, "warning");
    }
  }

  function updateIndicator(ctx: ExtensionContext): void {
    if (!ctx.hasUI || ctx.mode !== "tui") return;
    const usage = ctx.getContextUsage();
    const tokens = usage?.tokens ?? null;
    const contextWindow = usage?.contextWindow ?? null;
    if (tokens === null || contextWindow === null || !shouldShowIndicator(tokens, contextWindow, state.settings)) {
      ctx.ui.setStatus(UI_KEY, undefined);
      ctx.ui.setWidget(UI_KEY, undefined);
      return;
    }
    const line = formatIndicatorLine(tokens, contextWindow, state.settings);
    ctx.ui.setStatus(UI_KEY, line);
    ctx.ui.setWidget(UI_KEY, [line], { placement: "belowEditor" });
  }

  function runCompaction(ctx: ExtensionContext, options: { auto: boolean; instructions?: string }): void {
    state.compacting = true;
    state.autoTriggered = options.auto;
    ctx.compact({
      customInstructions: options.instructions ?? state.settings.focus,
      onComplete: () => {
        state.compacting = false;
        state.autoFailures = 0;
      },
      onError: (error) => {
        state.compacting = false;
        state.autoTriggered = false;
        ctx.ui.notify(`autocompact: compaction failed — ${error.message}`, "error");
        if (options.auto) {
          state.autoFailures += 1;
          if (state.autoFailures === MAX_AUTO_FAILURES) {
            ctx.ui.notify(
              "autocompact: auto-compaction paused after repeated failures (Pi's built-in safety net still applies)",
              "warning",
            );
          }
        }
      },
    });
  }

  function evaluate(ctx: ExtensionContext, canCompact: boolean): void {
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
  }

  pi.on("session_start", async (_event, ctx) => {
    await loadSettings(ctx.cwd);
    state.lastTier = "none";
    state.compacting = false;
    state.autoTriggered = false;
    state.autoFailures = 0;
    updateIndicator(ctx);
  });

  // Warnings + indicator refresh during a run (never compacts mid-run).
  pi.on("turn_end", (_event, ctx) => {
    evaluate(ctx, false);
  });

  // Safe boundary: no retry/compaction/continuation pending. Compact here.
  pi.on("agent_settled", (_event, ctx) => {
    evaluate(ctx, ctx.isIdle() && !ctx.hasPendingMessages());
  });

  pi.on("model_select", (_event, ctx) => {
    // Context window (and thus thresholds) may have changed; give auto attempts a fresh chance.
    state.lastTier = "none";
    state.autoFailures = 0;
    updateIndicator(ctx);
  });

  pi.on("session_compact", (event, ctx) => {
    // Extension-triggered compaction reports reason "manual"; resolve the real source.
    const source = resolveCompactionSource(event.reason, state.autoTriggered);
    state.lastTier = "none";
    state.compacting = false;
    state.autoTriggered = false;
    state.autoFailures = 0;
    ctx.ui.notify(
      formatCompactionReport({
        tokensBefore: event.compactionEntry.tokensBefore,
        source,
      }),
      "info",
    );
    updateIndicator(ctx);
  });

  pi.on("session_before_compact", (event, ctx) => {
    if (event.reason === "overflow") {
      ctx.ui.notify("Context overflow — running emergency compaction", "warning");
    }
  });

  // Clean up the indicator status/widget we own so it never leaks past shutdown.
  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setStatus(UI_KEY, undefined);
    ctx.ui.setWidget(UI_KEY, undefined);
  });

  pi.registerCommand("autocompact", {
    description: "Auto-compact: status | on | off | at <pct|tokens e.g. 200k> | warn <pct> | focus <text|clear> | now",
    getArgumentCompletions: (prefix) => {
      const items = AUTOCOMPACT_SUBCOMMANDS.filter((name) => name.startsWith(prefix.toLowerCase())).map((name) => ({
        value: name,
        label: name,
      }));
      return items.length > 0 ? items : null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const cmd = parseAutoCompactCommand(args);

      switch (cmd.kind) {
        case "status": {
          const usage = ctx.getContextUsage();
          ctx.ui.notify(
            formatStatusText({
              settings: state.settings,
              tokens: usage?.tokens ?? null,
              contextWindow: usage?.contextWindow ?? null,
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
          if (result.changed) await persistSettings(ctx);
          if (result.reply) ctx.ui.notify(result.reply, "info");
          updateIndicator(ctx);
        }
      }
    },
  });
}
