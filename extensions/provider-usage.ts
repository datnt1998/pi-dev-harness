/**
 * provider-usage — a standalone belowEditor widget showing AI provider quota
 * (Claude 5h/Week or Codex windows) in ANY project, independent of the footer.
 *
 * TRUST / NETWORK: this reads the active provider's OAuth access token from the
 * local Pi auth store (`$PI_CODING_AGENT_DIR/auth.json`) and calls the provider's
 * usage endpoint. No secret is stored or logged; the token stays in-process. It
 * only runs for the Claude/Codex providers and can be disabled per project via
 * `.pi/provider-usage.json` (`{ "enabled": false }`) or `/provider-quota off`.
 */
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { formatUsageLine, parseClaudeUsage, parseCodexUsage, type UsageState } from "../lib/provider-usage-core.ts";

const KEY = "provider-usage";
const REFRESH_MS = 60_000;
const USAGE_PROVIDERS = new Set(["anthropic", "openai-codex"]);

type Settings = { enabled: boolean };

function loadSettings(cwd: string): Settings {
  try {
    const raw = JSON.parse(readFileSync(join(cwd, ".pi", "provider-usage.json"), "utf8")) as Partial<Settings>;
    return { enabled: typeof raw.enabled === "boolean" ? raw.enabled : true };
  } catch {
    return { enabled: true };
  }
}

function readProviderAuth(provider: string): Record<string, unknown> {
  const dir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  const auth = JSON.parse(readFileSync(join(dir, "auth.json"), "utf8"));
  return (auth?.[provider] as Record<string, unknown>) ?? {};
}

async function fetchJson(url: string, headers: Record<string, string>, signal: AbortSignal, timeoutMs = 8_000): Promise<any> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) controller.abort();
  try {
    const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

async function fetchUsage(provider: string, signal: AbortSignal): Promise<UsageState> {
  const auth = readProviderAuth(provider);
  const token = (auth.access ?? auth.token ?? auth.access_token) as string | undefined;
  if (!token || typeof token !== "string") throw new Error(`Missing ${provider} OAuth access token`);

  if (provider === "anthropic") {
    const data = await fetchJson("https://api.anthropic.com/api/oauth/usage", {
      Authorization: `Bearer ${token}`,
      "User-Agent": "PiHarnessUsage",
      Accept: "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "oauth-2025-04-20",
    }, signal);
    return parseClaudeUsage(data);
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "User-Agent": "PiHarnessUsage", Accept: "application/json" };
  if (typeof auth.accountId === "string") headers["ChatGPT-Account-Id"] = auth.accountId;
  const data = await fetchJson("https://chatgpt.com/backend-api/wham/usage", headers, signal);
  return parseCodexUsage(data);
}

export default function providerUsage(pi: ExtensionAPI) {
  const state = { settings: { enabled: true } as Settings, usage: undefined as UsageState | undefined, loading: false };
  let lastCtx: ExtensionContext | undefined;
  let controller: AbortController | undefined;
  let generation = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  function currentProvider(ctx: ExtensionContext): string | undefined {
    const p = ctx.model?.provider;
    return p && USAGE_PROVIDERS.has(p) ? p : undefined;
  }

  function render(ctx: ExtensionContext): void {
    lastCtx = ctx;
    if (ctx.mode !== "tui") return;
    if (!state.settings.enabled || !currentProvider(ctx)) {
      ctx.ui.setWidget(KEY, undefined);
      return;
    }
    const line = state.loading && !state.usage ? "Usage loading…" : formatUsageLine(state.usage);
    ctx.ui.setStatus(KEY, line);
    ctx.ui.setWidget(KEY, [line], { placement: "belowEditor" });
  }

  async function refresh(ctx: ExtensionContext): Promise<void> {
    const provider = currentProvider(ctx);
    if (!state.settings.enabled || !provider) return;
    controller?.abort();
    controller = new AbortController();
    const mine = ++generation;
    state.loading = true;
    render(ctx);
    try {
      const usage = await fetchUsage(provider, controller.signal);
      if (mine !== generation) return;
      state.usage = usage;
    } catch (error) {
      if (mine !== generation) return;
      state.usage = { provider, windows: [], updatedAt: Date.now(), error: (error as Error).message };
    } finally {
      if (mine === generation) {
        state.loading = false;
        render(ctx);
      }
    }
  }

  pi.on("session_start", (_event, ctx) => {
    state.settings = loadSettings(ctx.cwd);
    render(ctx);
    void refresh(ctx);
    timer = setInterval(() => { if (lastCtx) void refresh(lastCtx); }, REFRESH_MS);
  });
  pi.on("model_select", (_event, ctx) => { state.usage = undefined; render(ctx); void refresh(ctx); });
  pi.on("session_shutdown", (_event, ctx) => {
    generation += 1;
    controller?.abort();
    if (timer) clearInterval(timer);
    timer = undefined;
    if (ctx.mode === "tui") { ctx.ui.setStatus(KEY, undefined); ctx.ui.setWidget(KEY, undefined); }
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
        state.settings.enabled = cmd === "on";
        if (lastCtx) { render(lastCtx); if (cmd === "on") void refresh(lastCtx); }
        ctx.ui.notify(`provider-quota ${cmd}`, "info");
        return;
      }
      if (cmd === "refresh") {
        if (lastCtx) void refresh(lastCtx);
        ctx.ui.notify("provider-quota: refreshing…", "info");
        return;
      }
      const line = state.usage ? formatUsageLine(state.usage) : "no data yet";
      ctx.ui.notify(`provider-quota: ${state.settings.enabled ? "enabled" : "disabled"} · ${line}`, "info");
    },
  });
}
