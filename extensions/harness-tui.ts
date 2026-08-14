/**
 * harness-tui — a brandless, responsive Pi footer that preserves critical
 * visibility (context %, session cost, cwd/path, git branch, thinking level,
 * model) at every terminal width, plus a colored provider-quota second line
 * (Claude 5h/Week, Codex) so a fresh project looks cohesive out of the box.
 *
 * Portable and identity-free: the label defaults to the project folder name and
 * is configurable; no product branding or theme. Colors come from the active
 * theme's semantic roles. Pure layout/format logic in `../lib/tui-core.ts` and
 * `../lib/provider-usage-core.ts`.
 *
 * ONE FOOTER OWNER: setting a footer replaces Pi's built-in one. A project with
 * its own footer disables this via `.pi/harness-tui.json` (`{ "enabled": false }`)
 * or `/harness-tui off`. The quota line can be turned off with `"showUsage": false`.
 *
 * Config (layered, project wins): `<cwd>/.pi/harness-tui.json`
 *   { "enabled": true, "label": "optional; defaults to folder name", "showUsage": true }
 */
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { loadJsonSettings, rejectUnknownFields } from "../lib/config-load.ts";
import { contextSeverity, formatContextLabel, formatSessionCost, getFooterLayout, shortenPath } from "../lib/tui-core.ts";
import { formatQuotaSnapshotThemed } from "../lib/provider-usage-core.ts";
import { defaultQuotaLedgerPath, fetchUsage, resolveQuotaTarget } from "../lib/provider-usage-fetch.ts";
import { JsonQuotaLedgerStore, getProviderQuotaAuthority, type ProviderQuotaAuthority } from "../lib/provider-usage-service.ts";

type Settings = { enabled: boolean; label?: string; showUsage: boolean };
const DEFAULTS: Settings = { enabled: true, showUsage: true };
const SEP = " │ ";
// The shared authority deduplicates fetches; the footer only requests cadence.
const REFRESH_MS = 5 * 60_000;

function configPath(cwd: string): string {
  return join(cwd, ".pi", "harness-tui.json");
}

function loadSettings(cwd: string): Settings {
  return loadJsonSettings({
    path: configPath(cwd),
    label: "harness-tui",
    validate: (raw) => {
      rejectUnknownFields(["enabled", "showUsage", "label"])(raw, "harness-tui");
      return {
        enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULTS.enabled,
        showUsage: typeof raw.showUsage === "boolean" ? raw.showUsage : DEFAULTS.showUsage,
        label: typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : undefined,
      };
    },
    defaults: { ...DEFAULTS },
  });
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
    usageLoading: false,
  };
  let lastCtx: ExtensionContext | undefined;
  let footerTui: { requestRender(): void } | undefined;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let authority: ProviderQuotaAuthority | undefined;
  let unsubscribeQuota: (() => void) | undefined;

  const sev = { ok: "dim", warn: "warning", critical: "error" } as const;

  async function refreshUsage(ctx: ExtensionContext): Promise<void> {
    if (!state.settings.enabled || !state.settings.showUsage || !authority) return;
    controller?.abort();
    controller = new AbortController();
    state.usageLoading = true;
    footerTui?.requestRender();
    await authority.refresh(controller.signal);
    state.usageLoading = false;
    footerTui?.requestRender();
  }

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
    const showUsage = state.settings.showUsage;
    const hasProvider = !!authority;

    ctx.ui.setFooter((tui, theme, footerData) => {
      footerTui = tui;
      const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
      const fg = (r: string, t: string) => theme.fg(r as never, t);
      return {
        dispose: unsubscribe,
        invalidate() {},
        render(width: number): string[] {
          const usage = ctx.getContextUsage();
          const percent = usage?.percent ?? null;
          const ctxStyled = fg(sev[contextSeverity(percent)], `ctx ${formatContextLabel(usage?.tokens ?? null, usage?.contextWindow ?? null, percent)}`);
          const cost = fg("muted", formatSessionCost(sessionCost(ctx)));
          const mode = fg(state.running ? "warning" : "success", state.running ? "working" : "ready");
          const branch = fg("muted", state.branch ?? footerData.getGitBranch() ?? "no-git");
          const thinking = fg("muted", state.thinking);
          const modelFull = fg("muted", ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "no-model");
          const modelShort = fg("muted", ctx.model?.id ?? "no-model");
          const name = fg("accent", label);
          const dim = (s: string) => fg("dim", s);
          const path = fg("muted", shortenPath(ctx.cwd, homedir(), 3));
          const layout = getFooterLayout(width);

          // Second line: colored provider quota (only where there is room).
          const usageLine =
            showUsage && hasProvider && width >= 100
              ? state.usageLoading && authority?.snapshot.status === "unknown"
                ? dim("Usage loading…")
                : formatQuotaSnapshotThemed(fg, authority?.snapshot, { barWidth: width >= 140 ? 10 : 8 })
              : undefined;

          let main: string;
          if (layout === "wide") {
            const left = [name, dim(SEP), mode, dim(SEP), fg("muted", ctx.cwd), dim(SEP), branch].join("");
            const right = [ctxStyled, dim(SEP), cost, dim(SEP), thinking, dim(SEP), modelFull].join("");
            main = compose(left, right, width);
          } else if (layout === "standard") {
            const left = [name, dim(SEP), mode, dim(SEP), path, dim(SEP), branch].join("");
            const right = [ctxStyled, dim(SEP), cost, dim(SEP), thinking, dim(SEP), modelShort].join("");
            main = compose(left, right, width);
          } else if (layout === "compact") {
            const top = [name, dim(SEP), mode, dim(SEP), path].join("");
            const bottom = [ctxStyled, dim(SEP), cost, dim(SEP), thinking, dim(SEP), modelShort].join("");
            return [truncateToWidth(top, width), truncateToWidth(bottom, width)];
          } else {
            const top = [name, dim(SEP), fg("muted", shortenPath(ctx.cwd, homedir(), 1))].join("");
            const bottom = [ctxStyled, dim(SEP), thinking, dim(SEP), modelShort].join("");
            return [truncateToWidth(top, width), truncateToWidth(bottom, width)];
          }
          return usageLine ? [main, truncateToWidth(usageLine, width)] : [main];
        },
      };
    });
  }

  pi.on("session_start", async (_event, ctx) => {
    try {
      state.settings = loadSettings(ctx.cwd);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      state.settings = { ...DEFAULTS, enabled: false };
      return;
    }
    state.thinking = pi.getThinkingLevel();
    state.running = false;
    await refreshBranch(ctx.cwd);
    const target = resolveQuotaTarget(ctx.cwd, ctx.model?.provider);
    if (target) {
      authority = getProviderQuotaAuthority({
        ...target,
        fetchUsage,
        store: new JsonQuotaLedgerStore(defaultQuotaLedgerPath()),
      });
      unsubscribeQuota = authority.subscribe(() => footerTui?.requestRender());
    }
    render(ctx);
    void refreshUsage(ctx);
    timer = setInterval(() => { if (lastCtx) void refreshUsage(lastCtx); }, REFRESH_MS);
  });
  pi.on("agent_start", (_event, ctx) => { state.running = true; render(ctx); });
  pi.on("agent_settled", (_event, ctx) => { state.running = false; render(ctx); });
  pi.on("thinking_level_select", (event, ctx) => { state.thinking = event.level; render(ctx); });
  pi.on("model_select", (_event, ctx) => {
    state.thinking = pi.getThinkingLevel();
    render(ctx);
    void refreshUsage(ctx);
  });
  pi.on("after_provider_response", (event, ctx) => {
    if (event.status === 401 || event.status === 403 || event.status === 429) void refreshUsage(ctx);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    controller?.abort();
    unsubscribeQuota?.();
    unsubscribeQuota = undefined;
    if (timer) clearInterval(timer);
    timer = undefined;
    if (ctx.mode === "tui") ctx.ui.setFooter(undefined);
  });

  pi.registerCommand("harness-tui", {
    description: "Harness footer: status | on | off | usage-on | usage-off",
    getArgumentCompletions: (prefix) => {
      const items = ["status", "on", "off", "usage-on", "usage-off"].filter((n) => n.startsWith(prefix.toLowerCase())).map((n) => ({ value: n, label: n }));
      return items.length > 0 ? items : null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const cmd = args.trim().toLowerCase();
      const persist = () => {
        if (!existsSync(join(ctx.cwd, ".pi"))) return;
        try {
          writeFileSync(configPath(ctx.cwd), `${JSON.stringify(state.settings, null, 2)}\n`, "utf8");
        } catch (error) {
          ctx.ui.notify(`harness-tui: could not persist (${(error as Error).message})`, "warning");
        }
      };
      if (cmd === "on" || cmd === "off") {
        state.settings.enabled = cmd === "on";
        persist();
        if (lastCtx) { render(lastCtx); if (cmd === "on") void refreshUsage(lastCtx); }
        ctx.ui.notify(`harness-tui ${cmd}`, "info");
        return;
      }
      if (cmd === "usage-on" || cmd === "usage-off") {
        state.settings.showUsage = cmd === "usage-on";
        persist();
        if (lastCtx) { render(lastCtx); if (cmd === "usage-on") void refreshUsage(lastCtx); }
        ctx.ui.notify(`harness-tui usage ${cmd === "usage-on" ? "on" : "off"}`, "info");
        return;
      }
      ctx.ui.notify(`harness-tui: ${state.settings.enabled ? "enabled" : "disabled"} · usage ${state.settings.showUsage ? "on" : "off"} · label "${state.settings.label ?? basename(ctx.cwd)}"`, "info");
    },
  });
}
