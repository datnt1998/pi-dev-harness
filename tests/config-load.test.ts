import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadJsonSettings, rejectUnknownFields } from "../lib/config-load.ts";

function tempDir() {
  return mkdtempSync(join(tmpdir(), "config-load-test-"));
}

interface TestSettings {
  enabled: boolean;
  threshold: number;
}

const DEFAULTS: TestSettings = { enabled: true, threshold: 10 };

function validate(raw: Record<string, unknown>): TestSettings {
  rejectUnknownFields(["enabled", "threshold"])(raw, "test-settings");
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULTS.enabled,
    threshold: typeof raw.threshold === "number" && Number.isFinite(raw.threshold) ? raw.threshold : DEFAULTS.threshold,
  };
}

test("absent file returns defaults silently", () => {
  const dir = tempDir();
  try {
    const result = loadJsonSettings({
      path: join(dir, "nonexistent.json"),
      label: "test",
      validate,
      defaults: DEFAULTS,
    });
    assert.deepEqual(result, DEFAULTS);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("malformed JSON throws with path and parse detail", () => {
  const dir = tempDir();
  try {
    writeFileSync(join(dir, "bad.json"), "{ broken json");
    assert.throws(
      () => loadJsonSettings({ path: join(dir, "bad.json"), label: "test", validate, defaults: DEFAULTS }),
      (err: Error) => err.message.includes("Malformed JSON") && err.message.includes("bad.json"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("unknown top-level field throws with named field", () => {
  const dir = tempDir();
  try {
    writeFileSync(join(dir, "typo.json"), JSON.stringify({ enabled: true, threhsold: 5 }));
    assert.throws(
      () => loadJsonSettings({ path: join(dir, "typo.json"), label: "test", validate, defaults: DEFAULTS }),
      (err: Error) => err.message.includes('"threhsold"') && err.message.includes("unknown field"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("valid file returns parsed settings", () => {
  const dir = tempDir();
  try {
    writeFileSync(join(dir, "good.json"), JSON.stringify({ enabled: false, threshold: 42 }));
    const result = loadJsonSettings({ path: join(dir, "good.json"), label: "test", validate, defaults: DEFAULTS });
    assert.deepEqual(result, { enabled: false, threshold: 42 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("non-object JSON throws", () => {
  const dir = tempDir();
  try {
    writeFileSync(join(dir, "array.json"), JSON.stringify([1, 2]));
    assert.throws(
      () => loadJsonSettings({ path: join(dir, "array.json"), label: "test", validate, defaults: DEFAULTS }),
      (err: Error) => err.message.includes("must be a JSON object"),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("partial valid file uses defaults for missing fields", () => {
  const dir = tempDir();
  try {
    writeFileSync(join(dir, "partial.json"), JSON.stringify({ enabled: false }));
    const result = loadJsonSettings({ path: join(dir, "partial.json"), label: "test", validate, defaults: DEFAULTS });
    assert.deepEqual(result, { enabled: false, threshold: 10 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
