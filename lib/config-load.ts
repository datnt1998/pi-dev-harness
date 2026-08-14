/**
 * Centralized fail-loud JSON settings loader.
 *
 * Absent file returns defaults silently (the only silent case). Malformed JSON or
 * unknown top-level fields throw with a path-and-field message so typos never
 * masquerade as missing settings. Extensions that fail to load stay disabled; they
 * never run on guessed values.
 */

import { existsSync, readFileSync } from "node:fs";

export interface LoadSettingsOptions<T> {
  /** Absolute path to the JSON settings file. */
  path: string;
  /** Human-readable label for error messages (e.g. "autocompact", "session-gc"). */
  label: string;
  /** Validator: receives the parsed object and returns a typed result, or throws on invalid shape. */
  validate: (raw: Record<string, unknown>) => T;
  /** Default value returned when the file does not exist. */
  defaults: T;
}

/**
 * Load a JSON settings file with fail-loud semantics.
 *
 * - Absent file: returns `defaults` silently.
 * - Malformed JSON: throws naming the path and parse position.
 * - Validation failure: throws naming the path, the offending field, and the expectation.
 */
export function loadJsonSettings<T>(options: LoadSettingsOptions<T>): T {
  const { path, label, validate, defaults } = options;

  if (!existsSync(path)) return defaults;

  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    throw new Error(`[${label}] Cannot read ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof SyntaxError ? err.message : String(err);
    throw new Error(`[${label}] Malformed JSON in ${path}: ${detail}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`[${label}] ${path} must be a JSON object, got ${Array.isArray(parsed) ? "array" : typeof parsed}`);
  }

  try {
    return validate(parsed as Record<string, unknown>);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`[${label}] Invalid settings in ${path}: ${detail}`);
  }
}

/**
 * Build a validator that checks for unknown top-level fields.
 * Returns a function that throws on unknown keys, suitable for composing with
 * field-specific validation logic.
 */
export function rejectUnknownFields(knownFields: readonly string[]) {
  const allowed = new Set(knownFields);
  return (raw: Record<string, unknown>, label: string): void => {
    const unknown = Object.keys(raw).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
      throw new Error(`${label}: unknown field(s) ${unknown.map((k) => `"${k}"`).join(", ")}`);
    }
  };
}
