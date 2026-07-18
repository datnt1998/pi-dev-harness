import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isDestructiveCommand, isProtectedProjectPath } from "../lib/safe-ops-policy.ts";

/** Narrow guardrail for model tool calls. Not a sandbox or exfiltration defense. */
export default function safeOps(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      const path = (event.input as { path?: unknown }).path;
      if (typeof path === "string" && isProtectedProjectPath(path, ctx.cwd)) {
        if (ctx.hasUI) ctx.ui.notify(`Blocked write to protected path: ${path}`, "warning");
        return { block: true, reason: "Protected project path" };
      }
      return;
    }

    if (event.toolName !== "bash" && event.toolName !== "hypa_shell") return;
    const command = (event.input as { command?: unknown }).command;
    if (typeof command !== "string" || !isDestructiveCommand(command)) return;
    if (ctx.mode !== "tui") {
      return { block: true, reason: "Destructive command blocked outside interactive TUI mode" };
    }
    const approved = await ctx.ui.confirm("Confirm destructive command", command);
    if (!approved) return { block: true, reason: "Destructive command denied by user" };
  });
}
