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
import { loadJsonSettings, rejectUnknownFields } from "./config-load.ts";
import { parseClaudeUsage, parseCodexUsage, type UsageState } from "./provider-usage-core.ts";

export const USAGE_PROVIDERS = new Set(["anthropic", "openai-codex"]);

export type QuotaTarget = { provider: string; providerIdentity: string };

/**
 * Resolve one session-stable quota target. A trusted project may select a
 * provider independently of the active model in `.pi/quota-gate.json`:
 * `{ "provider": "...", "providerIdentity": "optional-stable-account-key" }`.
 */
export function resolveQuotaTarget(cwd: string, fallbackProvider?: string): QuotaTarget | null {
  const configured = loadJsonSettings({
    path: join(cwd, ".pi", "quota-gate.json"),
    label: "quota-gate",
    validate: (raw) => {
      rejectUnknownFields(["provider", "providerIdentity"])(raw, "quota-gate");
      return {
        provider: typeof raw.provider === "string" ? raw.provider : undefined,
        providerIdentity: typeof raw.providerIdentity === "string" && raw.providerIdentity.trim() ? raw.providerIdentity.trim() : undefined,
      };
    },
    defaults: {} as { provider?: string; providerIdentity?: string },
  });
  const configuredProvider = configured.provider;
  const configuredIdentity = configured.providerIdentity;
  const provider = configuredProvider ?? fallbackProvider;
  if (!provider || !USAGE_PROVIDERS.has(provider)) return null;
  if (configuredIdentity) return { provider, providerIdentity: configuredIdentity };
  const auth = readProviderAuth(provider);
  const account = auth.accountId ?? auth.account_id ?? auth.organizationId ?? auth.organization_id;
  return { provider, providerIdentity: typeof account === "string" && account ? `${provider}/${account}` : provider };
}

export function defaultQuotaLedgerPath(): string {
  const dir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
  return join(dir, "quota-ledgers.json");
}

/** HTTP error carrying the status and a parsed Retry-After (ms) for backoff. */
export class UsageError extends Error {
  status?: number;
  retryAfterMs?: number;
  quotaStatus: "auth-error" | "fetch-error";
  constructor(message: string, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = "UsageError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.quotaStatus = status === 401 || status === 403 ? "auth-error" : "fetch-error";
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
  if (!token || typeof token !== "string") throw new UsageError(`Missing ${provider} OAuth access token`, 401);

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
