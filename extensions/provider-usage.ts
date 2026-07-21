/**
 * provider-usage — standalone belowEditor widget showing AI provider quota
 * (Claude 5h/Week or Codex windows) with colored bars, for projects that do NOT
 * use the `harness-tui` footer (which shows the same quota as its second line).
 *
 * Default OFF to avoid duplicating the footer's quota line; enable per project
 * via `.pi/provider-usage.json` (`{ "enabled": true }`) or `/provider-quota on`.
 *
 * TRUST / NETWORK: reads the active provider's OAuth token from the local Pi
 * auth store and calls the provider usage endpoint. No secret stored/logged;
 * Claude/Codex only.
 */
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatUsageThemed, type UsageState } from "../lib/provider-usage-core.ts";
import { USAGE_PROVIDERS, UsageError, fetchUsage } from "../lib/provider-usage-fetch.ts";

const KEY = "provider-usage";
// Usage endpoints are rate-limited and change slowly: poll gently and collapse
// bursty session/model triggers so we never hammer them into a 429.
const REFRESH_MS = 5 * 60_000;
const MIN_FETCH_GAP_MS = 60_000;

function loadEnabled(cwd: string): boolean {
  try {
    const raw = JSON.parse(readFileSync(join(cwd, ".pi", "provider-usage.json"), "utf8")) as { enabled?: unknown };
    return raw.enabled === true;
  } catch {
    return false;
  }
}

export default function providerUsage(pi: ExtensionAPI) {
  const state = { enabled: false, usage: undefined as UsageState | undefined, loading: false };
  let lastCtx: ExtensionContext | undefined;
  let controller: AbortController | undefined;
  let generation = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let cooldownUntil = 0;
  let lastFetchAt = 0;
  let lastProvider: string | undefined;

  const provider = (ctx: ExtensionContext) => {
    const p = ctx.model?.provider;
    return p && USAGE_PROVIDERS.has(p) ? p : undefined;
  };

  function render(ctx: ExtensionContext): void {
    lastCtx = ctx;
    if (ctx.mode !== "tui") return;
    if (!state.enabled || !provider(ctx)) {
      ctx.ui.setWidget(KEY, undefined);
      return;
    }
    const fg = (r: string, t: string) => ctx.ui.theme.fg(r as never, t);
    const line = state.loading && !state.usage ? fg("dim", "Usage loading…") : formatUsageThemed(fg, state.usage);
    ctx.ui.setWidget(KEY, [line], { placement: "belowEditor" });
  }

  async function refresh(ctx: ExtensionContext, force = false): Promise<void> {
    const p = provider(ctx);
    if (!state.enabled || !p) return;
    if (Date.now() < cooldownUntil) return; // backing off after a rate-limit
    if (!force && Date.now() - lastFetchAt < MIN_FETCH_GAP_MS) return; // collapse bursty triggers
    lastFetchAt = Date.now();
    controller?.abort();
    controller = new AbortController();
    const mine = ++generation;
    state.loading = true;
    render(ctx);
    try {
      const usage = await fetchUsage(p, controller.signal);
      if (mine === generation) { state.usage = usage; cooldownUntil = 0; }
    } catch (error) {
      if (mine !== generation) return;
      const e = error as UsageError;
      if (e.status === 429) cooldownUntil = Date.now() + (e.retryAfterMs ?? 5 * 60_000);
      if (!state.usage || state.usage.windows.length === 0) {
        const msg = e.status === 429 ? "rate-limited" : e.status ? `n/a (${e.status})` : "n/a";
        state.usage = { provider: p, windows: [], updatedAt: Date.now(), error: msg };
      }
    } finally {
      if (mine === generation) {
        state.loading = false;
        render(ctx);
      }
    }
  }

  function startTimer() {
    if (timer) return;
    timer = setInterval(() => { if (lastCtx) void refresh(lastCtx); }, REFRESH_MS);
  }

  pi.on("session_start", (_event, ctx) => {
    state.enabled = loadEnabled(ctx.cwd);
    lastProvider = provider(ctx);
    render(ctx);
    if (state.enabled) { void refresh(ctx, true); startTimer(); }
  });
  pi.on("model_select", (_event, ctx) => {
    const p = provider(ctx);
    const changed = p !== lastProvider;
    lastProvider = p;
    if (changed) state.usage = undefined;
    render(ctx);
    if (state.enabled && changed) void refresh(ctx, true);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    generation += 1;
    controller?.abort();
    if (timer) clearInterval(timer);
    timer = undefined;
    if (ctx.mode === "tui") { ctx.ui.setWidget(KEY, undefined); }
  });

  pi.registerCommand("provider-quota", {
    description: "Provider quota widget: status | on | off | refresh",
    getArgumentCompletions: (prefix) => {
      const items = ["status", "on", "off", "refresh"].filter((n) => n.startsWith(prefix.toLowerCase())).map((n) => ({ value: n, label: n }));
      return items.length > 0 ? items : null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const cmd = args.trim().toLowerCase();
      if (cmd === "on" || cmd === "off") {
        state.enabled = cmd === "on";
        if (lastCtx) { render(lastCtx); if (state.enabled) { void refresh(lastCtx, true); startTimer(); } }
        ctx.ui.notify(`provider-quota ${cmd}`, "info");
        return;
      }
      if (cmd === "refresh") {
        if (lastCtx) void refresh(lastCtx, true);
        ctx.ui.notify("provider-quota: refreshing…", "info");
        return;
      }
      ctx.ui.notify(`provider-quota: ${state.enabled ? "enabled" : "disabled (harness-tui footer shows quota)"}`, "info");
    },
  });
}
