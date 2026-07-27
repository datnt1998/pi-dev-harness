/**
 * provider-usage — standalone view of the shared, machine-readable quota
 * snapshot. The process-wide authority in provider-usage-service owns fetching,
 * ledger persistence, and launch decisions; this widget is never authority.
 */
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatQuotaSnapshotThemed } from "../lib/provider-usage-core.ts";
import { defaultQuotaLedgerPath, fetchUsage, resolveQuotaTarget } from "../lib/provider-usage-fetch.ts";
import { JsonQuotaLedgerStore, getProviderQuotaAuthority, type ProviderQuotaAuthority } from "../lib/provider-usage-service.ts";

const KEY = "provider-usage";
const REFRESH_MS = 5 * 60_000;

function loadEnabled(cwd: string): boolean {
  try {
    const raw = JSON.parse(readFileSync(join(cwd, ".pi", "provider-usage.json"), "utf8")) as { enabled?: unknown };
    return raw.enabled === true;
  } catch {
    return false;
  }
}

export default function providerUsage(pi: ExtensionAPI) {
  const state = { enabled: false, loading: false };
  let lastCtx: ExtensionContext | undefined;
  let authority: ProviderQuotaAuthority | undefined;
  let unsubscribe: (() => void) | undefined;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;

  function render(ctx: ExtensionContext): void {
    lastCtx = ctx;
    if (ctx.mode !== "tui") return;
    if (!state.enabled || !authority) {
      ctx.ui.setWidget(KEY, undefined);
      return;
    }
    const fg = (role: string, text: string) => ctx.ui.theme.fg(role as never, text);
    const line = state.loading && authority.snapshot.status === "unknown"
      ? fg("dim", "Usage loading…")
      : formatQuotaSnapshotThemed(fg, authority.snapshot);
    ctx.ui.setWidget(KEY, [line], { placement: "belowEditor" });
  }

  async function refresh(ctx: ExtensionContext): Promise<void> {
    if (!authority) return;
    controller?.abort();
    controller = new AbortController();
    state.loading = true;
    render(ctx);
    await authority.refresh(controller.signal);
    state.loading = false;
    render(ctx);
  }

  function startTimer(): void {
    if (!timer) timer = setInterval(() => { if (lastCtx) void refresh(lastCtx); }, REFRESH_MS);
  }

  pi.on("session_start", (_event, ctx) => {
    state.enabled = loadEnabled(ctx.cwd);
    const target = resolveQuotaTarget(ctx.cwd, ctx.model?.provider);
    if (target) {
      authority = getProviderQuotaAuthority({
        ...target,
        fetchUsage,
        store: new JsonQuotaLedgerStore(defaultQuotaLedgerPath()),
      });
      unsubscribe = authority.subscribe(() => { if (lastCtx) render(lastCtx); });
      void refresh(ctx);
      startTimer();
    }
    render(ctx);
  });

  // The quota target remains session-stable and independent of the newly active
  // model; a model change only refreshes the same authority.
  pi.on("model_select", (_event, ctx) => { render(ctx); void refresh(ctx); });
  pi.on("after_provider_response", (event, ctx) => {
    if (event.status === 401 || event.status === 403 || event.status === 429) void refresh(ctx);
  });
  pi.on("session_shutdown", (_event, ctx) => {
    controller?.abort();
    unsubscribe?.();
    unsubscribe = undefined;
    if (timer) clearInterval(timer);
    timer = undefined;
    if (ctx.mode === "tui") ctx.ui.setWidget(KEY, undefined);
  });

  pi.registerCommand("provider-quota", {
    description: "Shared provider quota: status | on | off | refresh | snapshot",
    getArgumentCompletions: (prefix) => {
      const items = ["status", "on", "off", "refresh", "snapshot"]
        .filter((name) => name.startsWith(prefix.toLowerCase()))
        .map((name) => ({ value: name, label: name }));
      return items.length > 0 ? items : null;
    },
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const command = args.trim().toLowerCase();
      if (command === "on" || command === "off") {
        state.enabled = command === "on";
        if (lastCtx) render(lastCtx);
        if (state.enabled && lastCtx) void refresh(lastCtx);
        ctx.ui.notify(`provider-quota ${command}`, "info");
        return;
      }
      if (command === "refresh") {
        if (lastCtx) void refresh(lastCtx);
        ctx.ui.notify("provider-quota: refreshing…", "info");
        return;
      }
      if (command === "snapshot") {
        ctx.ui.notify(authority ? JSON.stringify(authority.snapshot) : "provider-quota: no configured target", authority ? "info" : "warning");
        return;
      }
      ctx.ui.notify(
        authority
          ? `provider-quota: ${state.enabled ? "enabled" : "widget disabled"} · ${authority.snapshot.band} · gate ${authority.snapshot.gateReason}`
          : "provider-quota: no quota target",
        authority ? "info" : "warning",
      );
    },
  });
}
