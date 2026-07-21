/**
 * harness-tui — a brandless, responsive Pi footer that preserves critical
 * visibility (context %, session cost, cwd/path, git branch, thinking level,
 * model) at every terminal width.
 *
 * Portable and identity-free: the label defaults to the project folder name and
 * is configurable; there is no product branding, theme, or project-specific
 * status contract here. Pure layout/format logic lives in `../lib/tui-core.ts`.
 *
 * ONE FOOTER OWNER: setting a footer replaces Pi's built-in one. A project that
 * ships its own footer extension must disable this via `.pi/harness-tui.json`
 * (`{ "enabled": false }`) or `/harness-tui off`, so the two never fight.
 *
 * Config (layered, project wins): `<cwd>/.pi/harness-tui.json`
 *   { "enabled": true, "label": "optional label; defaults to folder name" }
 */
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import {
  contextSeverity,
  formatContextLabel,
  formatSessionCost,
  getFooterLayout,
  shortenPath,
} from "../lib/tui-core.ts";

type Settings = { enabled: boolean; label?: string };
const DEFAULTS: Settings = { enabled: true };
const SEP = " │ ";

function configPath(cwd: string): string {
  return join(cwd, ".pi", "harness-tui.json");
}

function loadSettings(cwd: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(configPath(cwd), "utf8")) as Partial<Settings>;
    return {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULTS.enabled,
      label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : undefined,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function sessionCost(ctx: ExtensionContext): number {
  let cost = 0;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    cost += (entry.message as { usage?: { cost?: { total?: number } } }).usage?.cost?.total ?? 0;
  }
  return cost;
}

/** Right-priority compose: the right cluster is never truncated before the left. */
function compose(left: string, right: string, width: number): string {
  if (visibleWidth(right) + 1 >= width) return truncateToWidth(right, width);
  const leftMax = Math.max(0, width - visibleWidth(right) - 1);
  const l = truncateToWidth(left, leftMax);
  const pad = " ".repeat(Math.max(1, width - visibleWidth(l) - visibleWidth(right)));
  return truncateToWidth(l + pad + right, width);
}

export default function harnessTui(pi: ExtensionAPI) {
  const state = {
    settings: { ...DEFAULTS } as Settings,
    running: false,
    thinking: "off",
    branch: undefined as string | undefined,
  };
  let lastCtx: ExtensionContext | undefined;

  const sev = { ok: "dim", warn: "warning", critical: "error" } as const;

  async function refreshBranch(cwd: string): Promise<void> {
    const result = await pi.exec("git", ["branch", "--show-current"], { cwd }).catch(() => undefined);
    const b = result?.stdout.trim();
    state.branch = b && b.length > 0 ? b : undefined;
  }

  function render(ctx: ExtensionContext): void {
    lastCtx = ctx;
    if (ctx.mode !== "tui") return;
    if (!state.settings.enabled) {
      ctx.ui.setFooter(undefined);
      return;
    }
    const label = state.settings.label ?? basename(ctx.cwd) ?? ctx.cwd;

    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
      return {
        dispose: unsubscribe,
        invalidate() {},
        render(width: number): string[] {
          const usage = ctx.getContextUsage();
          const percent = usage?.percent ?? null;
          const ctxText = `ctx ${formatContextLabel(usage?.tokens ?? null, usage?.contextWindow ?? null, percent)}`;
          const ctxStyled = theme.fg(sev[contextSeverity(percent)], ctxText);
          const cost = theme.fg("muted", formatSessionCost(sessionCost(ctx)));
          const mode = theme.fg(state.running ? "warning" : "success", state.running ? "working" : "ready");
          const branch = theme.fg("muted", state.branch ?? footerData.getGitBranch() ?? "no-git");
          const thinking = theme.fg("muted", state.thinking);
          const modelFull = theme.fg("muted", ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no-model");
          const modelShort = theme.fg("muted", ctx.model?.id ?? "no-model");
          const name = theme.fg("accent", label);
          const dim = (s: string) => theme.fg("dim", s);
          const path = theme.fg("muted", shortenPath(ctx.cwd, homedir(), 3));
          const layout = getFooterLayout(width);

          if (layout === "wide") {
            const left = [name, dim(SEP), mode, dim(SEP), theme.fg("muted", ctx.cwd), dim(SEP), branch].join("");
            const right = [ctxStyled, dim(SEP), cost, dim(SEP), thinking, dim(SEP), modelFull].join("");
            return [compose(left, right, width)];
          }
          if (layout === "standard") {
            const left = [name, dim(SEP), mode, dim(SEP), path, dim(SEP), branch].join("");
            const right = [ctxStyled, dim(SEP), cost, dim(SEP), thinking, dim(SEP), modelShort].join("");
            return [compose(left, right, width)];
          }
          if (layout === "compact") {
            const top = [name, dim(SEP), mode, dim(SEP), path].join("");
            const bottom = [ctxStyled, dim(SEP), cost, dim(SEP), thinking, dim(SEP), modelShort].join("");
            return [truncateToWidth(top, width), truncateToWidth(bottom, width)];
          }
          const top = [name, dim(SEP), theme.fg("muted", shortenPath(ctx.cwd, homedir(), 1))].join("");
          const bottom = [ctxStyled, dim(SEP), thinking, dim(SEP), modelShort].join("");
          return [truncateToWidth(top, width), truncateToWidth(bottom, width)];
        },
      };
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    state.settings = loadSettings(ctx.cwd);
    state.thinking = pi.getThinkingLevel();
    state.running = false;
    await refreshBranch(ctx.cwd);
    render(ctx);
  });
  pi.on("agent_start", (_event, ctx) => { state.running = true; render(ctx); });
  pi.on("agent_settled", (_event, ctx) => { state.running = false; render(ctx); });
  pi.on("thinking_level_select", (event, ctx) => { state.thinking = event.level; render(ctx); });
  pi.on("model_select", (_event, ctx) => { state.thinking = pi.getThinkingLevel(); render(ctx); });
  pi.on("session_shutdown", (_event, ctx) => { if (ctx.mode === "tui") ctx.ui.setFooter(undefined); });

  pi.registerCommand("harness-tui", {
    description: "Harness footer: status | on | off",
    getArgumentCompletions: (prefix) => {
      const items = ["status", "on", "off"].filter((n) => n.startsWith(prefix.toLowerCase())).map((n) => ({ value: n, label: n }));
      return items.length > 0 ? items : null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const cmd = args.trim().toLowerCase();
      if (cmd === "on" || cmd === "off") {
        state.settings.enabled = cmd === "on";
        if (existsSync(join(ctx.cwd, ".pi"))) {
          try {
            writeFileSync(configPath(ctx.cwd), `${JSON.stringify(state.settings, null, 2)}\n`, "utf8");
          } catch (error) {
            ctx.ui.notify(`harness-tui: could not persist (${(error as Error).message})`, "warning");
          }
        }
        if (lastCtx) render(lastCtx);
        ctx.ui.notify(`harness-tui ${cmd}`, "info");
        return;
      }
      ctx.ui.notify(`harness-tui: ${state.settings.enabled ? "enabled" : "disabled"} · label "${state.settings.label ?? basename(ctx.cwd)}"`, "info");
    },
  });
}
