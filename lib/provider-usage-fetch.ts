/**
 * I/O side of provider-usage: reads the active provider's OAuth access token
 * from the local Pi auth store and calls the provider usage endpoint. Kept out
 * of `provider-usage-core.ts` so that file stays pure and unit-testable.
 *
 * TRUST: the token is read at call time and used only for the outbound request;
 * it is never stored, logged, or returned.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseClaudeUsage, parseCodexUsage, type UsageState } from "./provider-usage-core.ts";

export const USAGE_PROVIDERS = new Set(["anthropic", "openai-codex"]);

/** HTTP error carrying the status and a parsed Retry-After (ms) for backoff. */
export class UsageError extends Error {
  status?: number;
  retryAfterMs?: number;
  constructor(message: string, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = "UsageError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Parse a Retry-After header (delta-seconds or HTTP-date) into ms, if present. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const secs = Number(value.trim());
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(value);
  return Number.isNaN(when) ? undefined : Math.max(0, when - now);
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
    if (!response.ok) {
      throw new UsageError(`HTTP ${response.status}`, response.status, parseRetryAfter(response.headers.get("retry-after")));
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/** Fetch + parse quota for a supported provider ("anthropic" | "openai-codex"). */
export async function fetchUsage(provider: string, signal: AbortSignal): Promise<UsageState> {
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
