/**
 * Shared provider-usage authority. Fetching, snapshot publication, ledger
 * persistence, and launch reservations all pass through this single instance.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  QuotaLaunchRuntime,
  buildPremiumQuotaSnapshot,
  type LaunchRequest,
  type PremiumQuotaSnapshot,
  type QuotaLaunchLease,
  type QuotaLedger,
  type QuotaLedgerStore,
  type UsageQuotaInput,
} from "./quota-gate-core.ts";
import { toUsageQuotaInput, type UsageState } from "./provider-usage-core.ts";

export interface LoadableQuotaLedgerStore extends QuotaLedgerStore {
  load(providerIdentity: string): Promise<QuotaLedger | null> | QuotaLedger | null;
}

type AuthorityOptions = {
  provider: string;
  providerIdentity: string;
  fetchUsage: (provider: string, signal: AbortSignal) => Promise<UsageState>;
  store?: LoadableQuotaLedgerStore;
  now?: () => number;
};

type LedgerFile = { version: 1; ledgers: Record<string, QuotaLedger> };

/** Small portable JSON adapter; credentials never enter its interface. */
export class JsonQuotaLedgerStore implements LoadableQuotaLedgerStore {
  readonly path: string;
  private tail: Promise<void> = Promise.resolve();
  constructor(path: string) { this.path = path; }

  private async readAll(): Promise<LedgerFile> {
    try {
      const parsed = JSON.parse(await readFile(this.path, "utf8")) as LedgerFile;
      return parsed?.version === 1 && parsed.ledgers && typeof parsed.ledgers === "object"
        ? parsed
        : { version: 1, ledgers: {} };
    } catch {
      return { version: 1, ledgers: {} };
    }
  }

  async load(providerIdentity: string): Promise<QuotaLedger | null> {
    const file = await this.readAll();
    return file.ledgers[providerIdentity] ? structuredClone(file.ledgers[providerIdentity]) : null;
  }

  async save(providerIdentity: string, ledger: QuotaLedger): Promise<void> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const file = await this.readAll();
      file.ledgers[providerIdentity] = structuredClone(ledger);
      await mkdir(dirname(this.path), { recursive: true });
      const temp = `${this.path}.${process.pid}.tmp`;
      await writeFile(temp, `${JSON.stringify(file, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await rename(temp, this.path);
    } finally {
      release();
    }
  }
}

function unknownInput(now: number, status: UsageQuotaInput["status"] = "unknown"): UsageQuotaInput {
  return {
    fetchedAt: new Date(now).toISOString(),
    status,
    weekly: null,
    shortWindow: null,
    premiumSpecificWeekly: null,
    allowSingleWeeklyWindow: false,
  };
}

export class ProviderQuotaAuthority {
  readonly provider: string;
  readonly providerIdentity: string;
  private readonly options: AuthorityOptions;
  private runtime?: QuotaLaunchRuntime;
  private initializing?: Promise<void>;
  private inFlight?: Promise<PremiumQuotaSnapshot>;
  private fetchInFlight?: Promise<UsageQuotaInput>;
  private readonly listeners = new Set<(snapshot: PremiumQuotaSnapshot) => void>();
  private current: PremiumQuotaSnapshot;

  constructor(options: AuthorityOptions) {
    if (!options.provider.trim()) throw new Error("provider is required");
    if (!options.providerIdentity.trim()) throw new Error("providerIdentity is required");
    this.options = options;
    this.provider = options.provider;
    this.providerIdentity = options.providerIdentity;
    const now = options.now?.() ?? Date.now();
    this.current = buildPremiumQuotaSnapshot(unknownInput(now), null, now);
  }

  get snapshot(): PremiumQuotaSnapshot { return this.runtime?.snapshot ?? this.current; }
  get ledger(): QuotaLedger | null { return this.runtime?.ledger ?? null; }

  subscribe(listener: (snapshot: PremiumQuotaSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => { this.listeners.delete(listener); };
  }

  private publish(): PremiumQuotaSnapshot {
    this.current = this.runtime?.snapshot ?? this.current;
    for (const listener of this.listeners) listener(this.current);
    return this.current;
  }

  private async safeFetch(signal?: AbortSignal): Promise<UsageQuotaInput> {
    if (this.fetchInFlight) return this.fetchInFlight;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    this.fetchInFlight = (async () => {
      try {
        return toUsageQuotaInput(await this.options.fetchUsage(this.provider, controller.signal));
      } catch (error) {
        const status = (error as { quotaStatus?: unknown }).quotaStatus;
        const normalized = status === "auth-error" ? "auth-error" : "fetch-error";
        return unknownInput(this.options.now?.() ?? Date.now(), normalized);
      }
    })();
    try {
      return await this.fetchInFlight;
    } finally {
      this.fetchInFlight = undefined;
      signal?.removeEventListener("abort", abort);
    }
  }

  private async initialize(): Promise<void> {
    if (this.runtime) return;
    if (!this.initializing) {
      this.initializing = (async () => {
        const ledger = await this.options.store?.load(this.providerIdentity) ?? null;
        this.runtime = new QuotaLaunchRuntime({
          providerIdentity: this.providerIdentity,
          initialSnapshot: this.current,
          initialLedger: ledger,
          refresh: (signal) => this.safeFetch(signal),
          store: this.options.store,
          now: this.options.now,
        });
      })();
    }
    await this.initializing;
  }

  /** Deduplicated refresh used by session/model/error triggers and all UI consumers. */
  async refresh(signal?: AbortSignal): Promise<PremiumQuotaSnapshot> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      await this.initialize();
      await this.runtime!.refresh(signal);
      return this.publish();
    })();
    try { return await this.inFlight; } finally { this.inFlight = undefined; }
  }

  /** Atomically refresh, decide, and hold one percentage point before launch. */
  async start(request: LaunchRequest, signal?: AbortSignal): Promise<QuotaLaunchLease> {
    await this.initialize();
    const lease = await this.runtime!.start(request, signal);
    this.publish();
    return {
      ...lease,
      finish: async (result, finishSignal) => {
        await lease.finish(result, finishSignal);
        this.publish();
      },
    };
  }
}

const authorities = new Map<string, ProviderQuotaAuthority>();

export function getProviderQuotaAuthority(options: AuthorityOptions): ProviderQuotaAuthority {
  const key = `${options.provider}\0${options.providerIdentity}`;
  const existing = authorities.get(key);
  if (existing) return existing;
  const authority = new ProviderQuotaAuthority(options);
  authorities.set(key, authority);
  return authority;
}

/** Test-only registry reset; production callers retain one process-wide authority. */
export function resetProviderQuotaAuthoritiesForTests(): void {
  authorities.clear();
}
