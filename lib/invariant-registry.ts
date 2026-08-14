/**
 * Invariant registry with module attribution.
 *
 * Each harness module registers a named invariant set; failures throw an
 * {@link InvariantError} naming the owning module so corrupted state can be
 * diagnosed without reading a stack trace. Construction is injectable:
 * production wiring lives in `default-invariant-registry.ts`; tests create
 * fresh instances and never import that file.
 *
 * Zero project dependencies: this module only defines the registry and its
 * error types.
 */

/**
 * Report a violated invariant rule. Bound to one module by the registry;
 * calling it always throws, so code after an unconditional `fail(...)` is
 * unreachable.
 * @param rule - short imperative rule name, e.g. "unique-ticket-ids".
 * @param message - violated-contract detail for diagnosis.
 * @returns never because reporting a violation throws.
 */
export type InvariantFailure = (rule: string, message: string) => never;

/**
 * One module's invariant set. Receives a module-bound {@link InvariantFailure}
 * and an optional caller-provided context (the state being checked).
 * Installers are synchronous and perform no I/O.
 */
export type InvariantInstaller = (fail: InvariantFailure, context?: unknown) => void;

/** Thrown when a registered invariant is violated. */
export class InvariantViolation extends Error {
  /** Short imperative rule name, stable across renames only by deliberate change. */
  public readonly rule: string;
  constructor(rule: string, message: string) {
    super(`[invariant:${rule}] ${message}`);
    this.name = "InvariantViolation";
    this.rule = rule;
  }
}

/**
 * Module-attributed invariant failure. Extends {@link InvariantViolation} so
 * existing catch sites keep working; adds the owning module name and an
 * attributed message.
 */
export class InvariantError extends InvariantViolation {
  /** Full module name that owns the violated invariant. */
  public readonly moduleName: string;
  constructor(moduleName: string, rule: string, message: string) {
    super(rule, message);
    this.name = "InvariantError";
    this.moduleName = moduleName;
    this.message = `invariant violated by "${moduleName}": ${rule} — ${message}`;
  }
}

export type InvariantRegistryOptions = {
  /**
   * When provided, only modules named here install their checks; other
   * registrations are silently skipped. Omitted means all modules enabled.
   */
  enabledModules?: Set<string>;
};

/**
 * Constructor-injectable registry of named invariant sets. No singleton:
 * production creates one instance (see `default-invariant-registry.ts`);
 * tests create fresh instances per case.
 */
export class InvariantRegistry {
  private readonly installers = new Map<string, InvariantInstaller>();
  private readonly enabledModules?: Set<string>;

  constructor(options?: InvariantRegistryOptions) {
    this.enabledModules = options?.enabledModules;
  }

  /** Whether a module name passes the configured enablement filter. */
  enabled(moduleName: string): boolean {
    return this.enabledModules === undefined || this.enabledModules.has(moduleName);
  }

  /**
   * Register one module's invariant set. Silently skips modules excluded by
   * `enabledModules`. Duplicate registration of an enabled module throws.
   */
  register(moduleName: string, installer: InvariantInstaller): void {
    if (!this.enabled(moduleName)) return;
    if (this.installers.has(moduleName)) {
      throw new Error(`invariant registry: module "${moduleName}" is already registered`);
    }
    this.installers.set(moduleName, installer);
  }

  /** Whether an invariant set is installed under this module name. */
  has(moduleName: string): boolean {
    return this.installers.has(moduleName);
  }

  /**
   * Run one module's checks against a caller-provided context. Throws
   * {@link InvariantError} naming the module and rule on the first violation.
   * Unknown module names throw rather than silently passing.
   */
  check(moduleName: string, context?: unknown): void {
    const installer = this.installers.get(moduleName);
    if (!installer) {
      throw new InvariantError(moduleName, "unknown-module", `no invariant set registered under "${moduleName}"`);
    }
    const fail: InvariantFailure = (rule, message) => {
      throw new InvariantError(moduleName, rule, message);
    };
    installer(fail, context);
  }

  /**
   * Direct check primitive for module code that already holds its context:
   * throws an attributed {@link InvariantError} when `condition` is false.
   */
  assert(moduleName: string, condition: boolean, rule: string, message: string): void {
    if (!condition) throw new InvariantError(moduleName, rule, message);
  }
}
