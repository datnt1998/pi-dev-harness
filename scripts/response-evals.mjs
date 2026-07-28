#!/usr/bin/env node
/**
 * Response-quality evaluation harness: validate, plan, blind, score.
 *
 * Dependency-free Node 22 CLI + core. This tool never calls a provider and
 * ships no runner: response rows — plus the machine evidence recorded for
 * oracle cases — are produced outside this script through the actual
 * packaged activation path documented in evals/response-quality/README.md.
 * This tool validates the case catalog, writes a content-hashed run
 * manifest, blinds condition labels for judging with cryptographic
 * randomness, and applies the release gate.
 *
 * Release path pinning: plan/blind/score operate only on the packaged full
 * case catalog and rubric. A custom or subset catalog cannot produce a
 * releasable manifest, blind output, or score pass.
 *
 * Exit codes:
 *   0  ok / release gate pass
 *   1  invalid catalog (validate) or release gate fail (score). plan and
 *      blind have no gate and never exit 1.
 *   2  structural error (every command, always machine-readable JSON on
 *      stdout): bad arguments (per-command option schemas: unknown flags,
 *      wrong-command flags such as plan --manifest or validate --trials, and
 *      missing required values), unreadable/malformed input, schema
 *      violations, catalog/rubric drift from the packaged full catalog,
 *      manifest integrity or bijection violations, response/sample digest
 *      mismatch, missing or mismatched judge provenance, provenance/
 *      environment drift, equal package digests, or missing evidence on an
 *      oracle case.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

export const DIMENSIONS = ["correctness", "autonomy", "actionability", "safety", "concision"];
export const WEIGHTS = { correctness: 0.35, autonomy: 0.25, actionability: 0.2, safety: 0.1, concision: 0.1 };
export const CONDITIONS = ["baseline", "candidate"];
export const SPLIT_VALUES = ["core", "audit"];
export const CATEGORIES = [
  "correctness",
  "autonomy",
  "actionability",
  "safety",
  "concision",
  "continuation",
  "completeness",
  "explanation",
  "destructive",
  "ambiguity",
  "structured-output",
  "artifact-boundaries",
  "progress",
  "casual",
];
export const PROVENANCE_FIELDS = [
  "provider",
  "model",
  "reasoning",
  "runner",
  "runner_version",
  "environment_hash",
  "package_ref",
  "package_sha",
  "package_digest",
  "activation_digest",
  "assistant_tokens",
];
/** Fields that must be identical across conditions so the pair measures only the package change. */
const CROSS_CONDITION_FIELDS = ["provider", "model", "reasoning", "runner", "runner_version", "environment_hash"];
/**
 * Treatment provenance: consistent within a condition; package_digest and
 * activation_digest must each differ across conditions (the installed package
 * content differs, and the always-loaded overlay is actually activated
 * differently — package install alone does not activate it).
 */
const PACKAGE_FIELDS = ["package_ref", "package_sha", "package_digest", "activation_digest"];
/** Response-shape vocabulary that must never appear in a case prompt (answer-leaking cases). */
export const FORBIDDEN_PROMPT_PHRASES = [
  "lead with the answer",
  "filler preamble",
  "bounded numbered user actions",
  "suppress tangents",
  "verified wins",
  "matter-of-fact",
  "rank and group",
  "hard-cap",
  "recurring state",
  "wall-clock estimate",
  "manufacture a user next action",
];

export const MANIFEST_VERSION = 1;
const CASE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{16,64}$/i;
const RESPONSE_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const EPSILON = 1e-9;
const TOKEN_GROWTH_LIMIT = 0.1;
const DEFAULT_CASES = fileURLToPath(new URL("../evals/response-quality/cases.jsonl", import.meta.url));
const DEFAULT_RUBRIC = fileURLToPath(new URL("../evals/response-quality/rubric.md", import.meta.url));
const DEFAULT_MANIFEST = fileURLToPath(new URL("../evals/response-quality/results/manifest.json", import.meta.url));

const USAGE = `usage: response-evals.mjs <command>

commands:
  validate [--cases <file>]
      Validate the case catalog; prints a JSON summary.
      Exit: 0 ok, 1 invalid catalog, 2 structural (unreadable/malformed input).
  plan [--trials <n>] [--out-manifest <file>]
      Plan from the packaged full catalog and rubric (pinned; --cases and
      --rubric are not accepted — a subset/custom catalog cannot produce a
      release manifest). Prints the paired run matrix (case x trial x
      condition) as JSONL and writes a content-hashed manifest (rows +
      catalog/rubric digests). Default manifest:
      evals/response-quality/results/manifest.json.
      Exit: 0 ok, 2 structural error (always JSON).
  blind --responses <file> --out <samples> --key <key> --manifest <file>
      Require the manifest, re-verify its catalog/rubric digests against the
      packaged full catalog and rubric, and rebuild the complete expected
      matrix (split and oracle payloads included) from the packaged catalog,
      exact-comparing it against the manifest rows; require exact
      manifest<->response coverage; strip condition labels; assign
      cryptographically random sample ids; write cryptographically shuffled
      samples (each row carries response_sha256, binding the judged text)
      plus a separate sample-id -> provenance key (with response_sha256 per
      row). Randomness may be injected only by unit tests. Never call
      judging with the key nearby.
      Exit: 0 ok, 2 structural error (always JSON).
  score --judgments <file> --key <file> --responses <file> --samples <file> --judge-provenance <file> --manifest <file>
      Verify manifest integrity, its pin to the packaged full catalog and
      rubric, and the rebuilt full-catalog matrix; enforce exact bijection among manifest, responses, key,
      judged samples, and judgments (audit rows included); recompute and
      validate response digests and rebind the judged samples
      (sample<->key<->response); require judge provenance and record it in
      the summary; enforce environment/provenance parity and differing
      package digests; apply the machine-evidence gate (candidate oracle
      rows gate the release; baseline oracle results are comparison data)
      and the lexicographic release gate; print a JSON summary.
      Exit: 0 pass, 1 gate fail, 2 structural error (always JSON).
`;

// ---------------------------------------------------------------------------
// JSONL + small helpers

export function parseJsonl(text, label = "input") {
  const rows = [];
  for (const [index, line] of text.split("\n").entries()) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new Error(`${label}: line ${index + 1}: invalid JSON (${error.message})`);
    }
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new Error(`${label}: line ${index + 1}: expected a JSON object`);
    }
    rows.push(row);
  }
  return rows;
}

const isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
const isPositiveInt = (value) => Number.isInteger(value) && value >= 1;
const round4 = (value) => Math.round(value * 10000) / 10000;
const triple = (row) => `${row.case_id}|${row.trial}|${row.condition}`;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export const responseSha256 = (response) => sha256(response);

/** Stable JSON canonicalization (sorted object keys) for content hashing. */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

// ---------------------------------------------------------------------------
// validate

const ORACLE_KEYS = ["setup", "expect_changed", "forbid_changed", "forbidden_calls", "gate"];

function validateOracle(oracle, label, errors) {
  if (typeof oracle !== "object" || oracle === null || Array.isArray(oracle)) {
    errors.push(`${label}: oracle must be an object`);
    return;
  }
  for (const key of Object.keys(oracle)) {
    if (!ORACLE_KEYS.includes(key)) errors.push(`${label}: unknown oracle field "${key}"`);
  }
  for (const key of ["setup", "expect_changed", "forbid_changed", "forbidden_calls"]) {
    if (oracle[key] !== undefined && (!Array.isArray(oracle[key]) || !oracle[key].every(isNonEmptyString))) {
      errors.push(`${label}: oracle.${key} must be an array of non-empty strings`);
    }
  }
  if (oracle.gate !== undefined && !isNonEmptyString(oracle.gate)) {
    errors.push(`${label}: oracle.gate must be a non-empty string`);
  }
  if (!ORACLE_KEYS.some((key) => oracle[key] !== undefined)) {
    errors.push(`${label}: oracle must declare at least one check`);
  }
}

export function validateCases(cases, { requireCoverage = true } = {}) {
  const errors = [];
  if (!Array.isArray(cases)) return { errors: ["cases must be a JSON array"], summary: null };
  const allowedKeys = new Set(["id", "category", "split", "risk", "prompt", "criteria", "oracle"]);
  const seen = new Set();
  const categoryCounts = new Map();
  let audit = 0;
  let oracles = 0;

  cases.forEach((row, index) => {
    const label = isNonEmptyString(row.id) ? row.id : `case ${index + 1}`;
    for (const key of Object.keys(row)) {
      if (!allowedKeys.has(key)) errors.push(`${label}: unknown field "${key}"`);
    }
    if (!isNonEmptyString(row.id) || !CASE_ID_PATTERN.test(row.id)) {
      errors.push(`${label}: id must match ${CASE_ID_PATTERN}`);
    } else if (seen.has(row.id)) {
      errors.push(`duplicate case id: ${row.id}`);
    } else {
      seen.add(row.id);
    }
    if (!CATEGORIES.includes(row.category)) {
      errors.push(`${label}: category must be one of ${CATEGORIES.join(", ")}`);
    } else {
      categoryCounts.set(row.category, (categoryCounts.get(row.category) ?? 0) + 1);
    }
    if (!SPLIT_VALUES.includes(row.split)) errors.push(`${label}: split must be "core" or "audit"`);
    else if (row.split === "audit") audit += 1;
    if (!["low", "medium", "high"].includes(row.risk)) errors.push(`${label}: risk must be low, medium, or high`);
    if (!isNonEmptyString(row.prompt)) errors.push(`${label}: prompt must be a non-empty string`);
    else {
      const prompt = row.prompt.toLowerCase();
      for (const phrase of FORBIDDEN_PROMPT_PHRASES) {
        if (prompt.includes(phrase)) errors.push(`${label}: prompt quotes response-shape vocabulary: "${phrase}"`);
      }
    }
    if (!Array.isArray(row.criteria) || row.criteria.length === 0 || !row.criteria.every(isNonEmptyString)) {
      errors.push(`${label}: criteria must be a non-empty array of strings`);
    }
    if (row.oracle !== undefined) {
      validateOracle(row.oracle, label, errors);
      oracles += 1;
    }
  });

  if (requireCoverage) {
    for (const category of CATEGORIES) {
      if (!categoryCounts.has(category)) errors.push(`missing required category: ${category}`);
    }
    if (seen.size < 14) errors.push(`catalog needs at least 14 cases, found ${seen.size}`);
    if (audit < 1) errors.push("catalog needs at least one audit case");
    if (oracles < 1) errors.push("catalog needs at least one oracle case");
  }

  return {
    errors,
    summary: {
      cases: seen.size,
      core: seen.size - audit,
      audit,
      oracles,
      categories: [...categoryCounts.keys()].sort(),
    },
  };
}

// ---------------------------------------------------------------------------
// plan + manifest

export function planMatrix(cases, trials) {
  const rows = [];
  for (let trial = 1; trial <= trials; trial += 1) {
    for (const row of cases) {
      for (const condition of CONDITIONS) {
        rows.push({ case_id: row.id, trial, condition, split: row.split });
      }
    }
  }
  return rows;
}

/**
 * Build the content-hashed run manifest: the exact case/trial/condition rows
 * (audit rows included, per-case oracle embedded) plus catalog/rubric
 * digests. manifest_sha256 commits to all of it via canonical JSON.
 */
export function buildManifest(cases, trials, { casesDigest, rubricDigest }) {
  const oracleById = new Map(cases.filter((row) => row.oracle).map((row) => [row.id, row.oracle]));
  const rows = planMatrix(cases, trials).map((row) => ({ ...row, oracle: oracleById.get(row.case_id) ?? null }));
  const body = {
    version: MANIFEST_VERSION,
    trials,
    cases_file_sha256: casesDigest,
    rubric_file_sha256: rubricDigest,
    rows,
  };
  return { ...body, manifest_sha256: sha256(canonicalJson(body)) };
}

export function verifyManifest(manifest) {
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    return ["manifest must be a JSON object"];
  }
  const errors = [];
  const { manifest_sha256: digest, ...body } = manifest;
  if (!isNonEmptyString(digest) || digest !== sha256(canonicalJson(body))) {
    errors.push("manifest_sha256 does not match manifest content (manifest tampered or corrupted)");
  }
  if (manifest.version !== MANIFEST_VERSION) errors.push(`manifest version must be ${MANIFEST_VERSION}`);
  if (!isPositiveInt(manifest.trials)) errors.push("manifest trials must be an integer >= 1");
  for (const field of ["cases_file_sha256", "rubric_file_sha256"]) {
    if (!isNonEmptyString(manifest[field])) errors.push(`manifest ${field} must be a non-empty string`);
  }
  if (!Array.isArray(manifest.rows) || manifest.rows.length === 0) {
    errors.push("manifest rows must be a non-empty array");
    return errors;
  }
  const seen = new Set();
  manifest.rows.forEach((row, index) => {
    const label = `manifest row ${index + 1}`;
    if (!isNonEmptyString(row.case_id)) errors.push(`${label}: case_id must be a non-empty string`);
    if (!isPositiveInt(row.trial)) errors.push(`${label}: trial must be an integer >= 1`);
    if (!CONDITIONS.includes(row.condition)) errors.push(`${label}: condition must be one of ${CONDITIONS.join(", ")}`);
    if (!SPLIT_VALUES.includes(row.split)) errors.push(`${label}: split must be "core" or "audit"`);
    if (row.oracle !== null && row.oracle !== undefined) validateOracle(row.oracle, label, errors);
    const key = triple(row);
    if (seen.has(key)) errors.push(`duplicate manifest row ${key}`);
    seen.add(key);
  });
  return errors;
}

// ---------------------------------------------------------------------------
// blind

const RESPONSE_FIELDS = new Set(["case_id", "trial", "condition", "response", "evidence", ...PROVENANCE_FIELDS]);

function validateResponseRow(row, index) {
  const errors = [];
  const label = `response row ${index + 1}`;
  for (const key of Object.keys(row)) {
    if (!RESPONSE_FIELDS.has(key)) errors.push(`${label}: unknown field "${key}"`);
  }
  if (!isNonEmptyString(row.case_id)) errors.push(`${label}: case_id must be a non-empty string`);
  if (!isPositiveInt(row.trial)) errors.push(`${label}: trial must be an integer >= 1`);
  if (!CONDITIONS.includes(row.condition)) errors.push(`${label}: condition must be one of ${CONDITIONS.join(", ")}`);
  for (const field of ["provider", "model", "reasoning", "runner", "runner_version", "package_ref"]) {
    if (!isNonEmptyString(row[field])) errors.push(`${label}: ${field} must be a non-empty string`);
  }
  for (const field of ["environment_hash", "package_digest", "activation_digest"]) {
    if (!isNonEmptyString(row[field]) || !DIGEST_PATTERN.test(row[field])) {
      errors.push(`${label}: ${field} must be a 16-64 char hex digest`);
    }
  }
  if (!isNonEmptyString(row.package_sha) || !SHA_PATTERN.test(row.package_sha)) {
    errors.push(`${label}: package_sha must be an exact 40-hex commit SHA`);
  }
  if (!isPositiveInt(row.assistant_tokens)) errors.push(`${label}: assistant_tokens must be an integer >= 1`);
  if (typeof row.response !== "string") errors.push(`${label}: response must be a string`);
  return errors;
}

const EVIDENCE_KEYS = new Set(["commands", "changed_files", "forbidden_calls", "gate"]);

/** Structural validation of recorded machine evidence against a case oracle. */
export function validateEvidence(evidence, oracle, label) {
  const errors = [];
  if (!oracle) {
    if (evidence !== undefined && evidence !== null) {
      errors.push(`${label}: prose-only case must not carry evidence (no oracle declared)`);
    }
    return errors;
  }
  if (typeof evidence !== "object" || evidence === null || Array.isArray(evidence)) {
    errors.push(`${label}: oracle case requires a recorded evidence object`);
    return errors;
  }
  for (const key of Object.keys(evidence)) {
    if (!EVIDENCE_KEYS.has(key)) errors.push(`${label}: unknown evidence field "${key}"`);
  }
  for (const key of ["changed_files", "forbidden_calls"]) {
    if (!Array.isArray(evidence[key]) || !evidence[key].every(isNonEmptyString)) {
      errors.push(`${label}: evidence.${key} must be an array of non-empty strings`);
    }
  }
  if (evidence.commands !== undefined && (!Array.isArray(evidence.commands) || !evidence.commands.every(isNonEmptyString))) {
    errors.push(`${label}: evidence.commands must be an array of non-empty strings`);
  }
  const gate = evidence.gate;
  if (gate !== undefined) {
    if (typeof gate !== "object" || gate === null || Array.isArray(gate)) {
      errors.push(`${label}: evidence.gate must be an object`);
    } else {
      if (!isNonEmptyString(gate.command)) errors.push(`${label}: evidence.gate.command must be a non-empty string`);
      else if (oracle.gate && gate.command !== oracle.gate) {
        errors.push(`${label}: evidence.gate.command must equal the oracle gate command ("${oracle.gate}")`);
      }
      if (!Number.isInteger(gate.exit_code)) errors.push(`${label}: evidence.gate.exit_code must be an integer`);
    }
  } else if (oracle.gate) {
    errors.push(`${label}: oracle declares gate command "${oracle.gate}"; evidence.gate is required`);
  }
  return errors;
}

/**
 * Blind the recorded responses: exact manifest<->response bijection, random
 * opaque sample ids, response digest bound into every key row, and a
 * cryptographic shuffle of the sample order. `rng` (n random bytes) is
 * injectable for deterministic unit tests only; the default is
 * crypto.randomBytes.
 */
export function blindResponses(responses, { manifest = null, rng = randomBytes } = {}) {
  const errors = [];
  if (!manifest) errors.push("blind requires a run manifest");
  else errors.push(...verifyManifest(manifest));
  if (errors.length) return { errors, samples: [], key: [] };

  const manifestByTriple = new Map(manifest.rows.map((row) => [triple(row), row]));
  const covered = new Set();
  const samples = [];
  const key = [];
  const usedIds = new Set();

  responses.forEach((row, index) => {
    const label = `response row ${index + 1}`;
    const rowErrors = validateResponseRow(row, index);
    const rowTriple = triple(row);
    const manifestRow = manifestByTriple.get(rowTriple);
    if (!rowErrors.length) {
      if (covered.has(rowTriple)) rowErrors.push(`duplicate response row for ${rowTriple}`);
      else if (!manifestRow) rowErrors.push(`response row not in manifest: ${rowTriple}`);
      else covered.add(rowTriple);
      rowErrors.push(...validateEvidence(row.evidence, manifestRow?.oracle ?? null, label));
    }
    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }
    let sampleId;
    do {
      sampleId = `s_${rng(8).toString("hex")}`;
    } while (usedIds.has(sampleId));
    usedIds.add(sampleId);
    samples.push({
      sample_id: sampleId,
      case_id: row.case_id,
      trial: row.trial,
      response: row.response,
      // Binds the exact text handed to the judge; leaks nothing about
      // condition. score re-computes it and matches it against the key.
      response_sha256: responseSha256(row.response),
    });
    const keyRow = {
      sample_id: sampleId,
      case_id: row.case_id,
      trial: row.trial,
      condition: row.condition,
      response_sha256: responseSha256(row.response),
    };
    for (const field of PROVENANCE_FIELDS) keyRow[field] = row[field];
    key.push(keyRow);
  });

  const missing = [...manifestByTriple.keys()].filter((rowTriple) => !covered.has(rowTriple)).sort();
  if (missing.length) {
    errors.push(
      `responses do not cover the manifest: missing ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? ", ..." : ""}`,
    );
  }
  if (errors.length) return { errors, samples: [], key: [] };

  // Cryptographic Fisher-Yates shuffle: output order is independent of input
  // order and condition grouping. The key is sorted by opaque id so even its
  // ordering carries no input/condition signal. Rejection sampling keeps the
  // shuffle free of modulo bias (this file calls it a cryptographic shuffle,
  // so it should not carry a biased one).
  const randomBelow = (bound) => {
    const limit = 2 ** 32 - (2 ** 32 % bound);
    let value;
    do {
      value = rng(4).readUInt32BE(0);
    } while (value >= limit);
    return value % bound;
  };
  for (let i = samples.length - 1; i > 0; i -= 1) {
    const j = randomBelow(i + 1);
    [samples[i], samples[j]] = [samples[j], samples[i]];
  }
  key.sort((a, b) => (a.sample_id < b.sample_id ? -1 : 1));

  return { errors, samples, key };
}

// ---------------------------------------------------------------------------
// score

function errorSummary(errors) {
  return { ok: false, errors, release: { decision: "error", reasons: errors } };
}

function validateJudgmentRow(row, index) {
  const errors = [];
  const label = `judgment row ${index + 1}`;
  if (!isNonEmptyString(row.sample_id)) errors.push(`${label}: sample_id must be a non-empty string`);
  for (const dimension of DIMENSIONS) {
    const value = row[dimension];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 5) {
      errors.push(`${label}: ${dimension} must be a number between 1 and 5`);
    }
  }
  if (typeof row.blocker !== "boolean") errors.push(`${label}: blocker must be boolean`);
  if (typeof row.notes !== "string") errors.push(`${label}: notes must be a string`);
  else if (row.blocker === true && row.notes.length === 0) errors.push(`${label}: blocker findings require non-empty notes`);
  return errors;
}

const SAMPLE_FIELDS = new Set(["sample_id", "case_id", "trial", "response", "response_sha256"]);

function validateSampleRow(row, index) {
  const errors = [];
  const label = `sample row ${index + 1}`;
  for (const key of Object.keys(row)) {
    if (!SAMPLE_FIELDS.has(key)) errors.push(`${label}: unknown field "${key}"`);
  }
  if (!isNonEmptyString(row.sample_id)) errors.push(`${label}: sample_id must be a non-empty string`);
  if (!isNonEmptyString(row.case_id)) errors.push(`${label}: case_id must be a non-empty string`);
  if (!isPositiveInt(row.trial)) errors.push(`${label}: trial must be an integer >= 1`);
  if (typeof row.response !== "string") errors.push(`${label}: response must be a string`);
  if (!isNonEmptyString(row.response_sha256) || !RESPONSE_DIGEST_PATTERN.test(row.response_sha256)) {
    errors.push(`${label}: response_sha256 must be a 64-char hex digest`);
  }
  return errors;
}

export const JUDGE_PROVENANCE_FIELDS = [
  "provider",
  "model",
  "reasoning",
  "runner",
  "runner_version",
  "prompt_sha256",
  "rubric_file_sha256",
];

/** Judge identity record: required, and bound to the rubric the run planned under. */
function validateJudgeProvenance(judge, manifest) {
  if (typeof judge !== "object" || judge === null || Array.isArray(judge)) {
    return ["judge provenance must be a JSON object"];
  }
  const errors = [];
  for (const key of Object.keys(judge)) {
    if (!JUDGE_PROVENANCE_FIELDS.includes(key)) errors.push(`judge provenance: unknown field "${key}"`);
  }
  for (const field of ["provider", "model", "reasoning", "runner", "runner_version"]) {
    if (!isNonEmptyString(judge[field])) errors.push(`judge provenance: ${field} must be a non-empty string`);
  }
  for (const field of ["prompt_sha256", "rubric_file_sha256"]) {
    if (!isNonEmptyString(judge[field]) || !RESPONSE_DIGEST_PATTERN.test(judge[field])) {
      errors.push(`judge provenance: ${field} must be a 64-char hex digest`);
    }
  }
  if (
    isNonEmptyString(judge.rubric_file_sha256) &&
    RESPONSE_DIGEST_PATTERN.test(judge.rubric_file_sha256) &&
    manifest &&
    isNonEmptyString(manifest.rubric_file_sha256) &&
    judge.rubric_file_sha256 !== manifest.rubric_file_sha256
  ) {
    errors.push("judge provenance: rubric_file_sha256 does not match the manifest rubric digest (the judge scored under a different rubric)");
  }
  return errors;
}

function validateKeyRow(row, index) {
  const errors = [];
  const label = `key row ${index + 1}`;
  if (!isNonEmptyString(row.sample_id)) errors.push(`${label}: sample_id must be a non-empty string`);
  if (!isNonEmptyString(row.case_id)) errors.push(`${label}: case_id must be a non-empty string`);
  if (!isPositiveInt(row.trial)) errors.push(`${label}: trial must be an integer >= 1`);
  if (!CONDITIONS.includes(row.condition)) errors.push(`${label}: condition must be one of ${CONDITIONS.join(", ")}`);
  if (!isNonEmptyString(row.response_sha256) || !RESPONSE_DIGEST_PATTERN.test(row.response_sha256)) {
    errors.push(`${label}: response_sha256 must be a 64-char hex digest`);
  }
  for (const field of ["provider", "model", "reasoning", "runner", "runner_version", "package_ref"]) {
    if (!isNonEmptyString(row[field])) errors.push(`${label}: ${field} must be a non-empty string`);
  }
  for (const field of ["environment_hash", "package_digest", "activation_digest"]) {
    if (!isNonEmptyString(row[field]) || !DIGEST_PATTERN.test(row[field])) errors.push(`${label}: ${field} must be a 16-64 char hex digest`);
  }
  if (!isNonEmptyString(row.package_sha) || !SHA_PATTERN.test(row.package_sha)) {
    errors.push(`${label}: package_sha must be an exact 40-hex commit SHA`);
  }
  if (!isPositiveInt(row.assistant_tokens)) errors.push(`${label}: assistant_tokens must be an integer >= 1`);
  return errors;
}

/**
 * Machine-evidence gate: evaluate recorded evidence against case oracles,
 * per condition. Candidate failures gate the release; baseline results are
 * comparison data (the measured delta), never a release blocker.
 *
 * Trust model: evidence is runner-attested. The scorer cross-checks its
 * internal consistency — forbidden-call patterns are re-derived from the
 * recorded commands (so a runner that simply never flags anything still
 * fails when the commands contain a pattern), and the oracle gate command
 * must appear in the recorded commands — but it cannot re-execute the
 * session. Evidence integrity rests on trust in the recorded runner.
 */
function evaluateMachineEvidence(groups, oracleByCase) {
  const perCondition = {};
  let machineVerified = 0;
  let proseOnly = 0;
  for (const condition of CONDITIONS) {
    const failures = [];
    let rows = 0;
    for (const row of groups[condition] ?? []) {
      const where = `${row.key.case_id}/trial ${row.key.trial}/${condition}`;
      const oracle = oracleByCase.get(row.key.case_id);
      if (!oracle) {
        proseOnly += 1;
        continue;
      }
      machineVerified += 1;
      rows += 1;
      const evidence = row.evidence;
      const commands = evidence.commands ?? [];
      if (oracle.gate) {
        if (evidence.gate?.exit_code !== 0) {
          failures.push(`${where}: oracle gate exited ${evidence.gate?.exit_code ?? "missing"} (expected 0)`);
        }
        if (!commands.includes(oracle.gate)) {
          failures.push(`${where}: oracle gate command not in recorded commands: "${oracle.gate}"`);
        }
      }
      // Derive forbidden-call matches from the recorded commands against the
      // oracle patterns. The gate command itself is runner-executed after the
      // session (and may quote a pattern as a grep needle), so it is excluded.
      const sessionCommands = oracle.gate ? commands.filter((cmd) => cmd !== oracle.gate) : commands;
      const derived = (oracle.forbidden_calls ?? []).flatMap((pattern) =>
        sessionCommands.filter((cmd) => cmd.includes(pattern)),
      );
      const flagged = [...new Set([...derived, ...(evidence.forbidden_calls ?? [])])];
      if (flagged.length) {
        failures.push(`${where}: forbidden call(s) matched: ${flagged.join(", ")}`);
      }
      const changed = evidence.changed_files;
      for (const file of oracle.expect_changed ?? []) {
        if (!changed.includes(file)) failures.push(`${where}: expected changed file not changed: ${file}`);
      }
      for (const entry of oracle.forbid_changed ?? []) {
        // A trailing "/" marks a directory: any changed file under it fails.
        const hit = entry.endsWith("/")
          ? changed.some((file) => file.startsWith(entry) || file === entry.slice(0, -1))
          : changed.includes(entry);
        if (hit) failures.push(`${where}: forbidden file changed: ${entry}`);
      }
    }
    perCondition[condition] = { rows, failures };
  }
  return { machineVerified, proseOnly, perCondition };
}

function aggregate(rows) {
  const means = {};
  for (const dimension of DIMENSIONS) {
    means[dimension] = rows.reduce((sum, row) => sum + row.judgment[dimension], 0) / rows.length;
  }
  const weightedScore = DIMENSIONS.reduce((sum, dimension) => sum + means[dimension] * WEIGHTS[dimension], 0);
  const meanTokens = rows.reduce((sum, row) => sum + row.key.assistant_tokens, 0) / rows.length;
  return {
    rows: rows.length,
    correctness: round4(means.correctness),
    autonomy: round4(means.autonomy),
    actionability: round4(means.actionability),
    safety: round4(means.safety),
    concision: round4(means.concision),
    weighted_score: round4(weightedScore),
    blocking_findings: rows.filter((row) => row.judgment.blocker).length,
    mean_assistant_tokens: round4(meanTokens),
    _raw: { means, weightedScore, meanTokens },
  };
}

export function scoreEvaluation({ judgments, key, responses, samples, judge, manifest = null }) {
  const errors = [];
  if (!manifest) errors.push("score requires a run manifest");
  else errors.push(...verifyManifest(manifest));
  if (!Array.isArray(samples)) errors.push("score requires the judged samples file (--samples): the judged artifact must be bound to the key and responses");
  if (judge === undefined || judge === null) errors.push("score requires judge provenance (--judge-provenance)");
  else errors.push(...validateJudgeProvenance(judge, manifest));
  if (errors.length) return errorSummary(errors);
  const manifestByTriple = new Map(manifest.rows.map((row) => [triple(row), row]));

  // -- key rows: unique, well-formed ---------------------------------------
  const keyById = new Map();
  const keyByTriple = new Map();
  key.forEach((row, index) => {
    // Row-local errors: one malformed key row must not halt indexing of every
    // later row (which cascaded into bogus "manifest row has no key row").
    const rowErrors = validateKeyRow(row, index);
    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }
    if (keyById.has(row.sample_id)) errors.push(`duplicate key row for sample_id ${row.sample_id}`);
    else keyById.set(row.sample_id, row);
    const rowTriple = triple(row);
    if (keyByTriple.has(rowTriple)) errors.push(`duplicate key row for ${rowTriple}`);
    else keyByTriple.set(rowTriple, row);
  });

  // -- responses: well-formed, indexed --------------------------------------
  const responseByTriple = new Map();
  responses.forEach((row, index) => {
    errors.push(...validateResponseRow(row, index));
    const rowTriple = triple(row);
    if (responseByTriple.has(rowTriple)) errors.push(`duplicate response row for ${rowTriple}`);
    else responseByTriple.set(rowTriple, row);
  });

  // -- exact bijection: manifest <-> responses <-> key ----------------------
  for (const rowTriple of manifestByTriple.keys()) {
    if (!responseByTriple.has(rowTriple)) errors.push(`manifest row has no response row: ${rowTriple}`);
    if (!keyByTriple.has(rowTriple)) errors.push(`manifest row has no key row: ${rowTriple}`);
  }
  for (const rowTriple of responseByTriple.keys()) {
    if (!manifestByTriple.has(rowTriple)) errors.push(`response row not in manifest: ${rowTriple}`);
  }
  for (const rowTriple of keyByTriple.keys()) {
    if (!manifestByTriple.has(rowTriple)) errors.push(`key row not in manifest: ${rowTriple}`);
  }

  // -- key binding: response digest recomputed + provenance parity ----------
  for (const [rowTriple, keyRow] of keyByTriple) {
    const response = responseByTriple.get(rowTriple);
    if (!response) continue; // already reported above
    if (responseSha256(response.response) !== keyRow.response_sha256) {
      errors.push(
        `response digest mismatch for ${keyRow.sample_id} (${rowTriple}): response text changed after blinding/judging`,
      );
    }
    for (const field of PROVENANCE_FIELDS) {
      if (String(response[field]) !== String(keyRow[field])) {
        errors.push(`provenance mismatch: ${keyRow.sample_id} field ${field} differs between key and responses`);
      }
    }
  }

  // -- evidence: structural validation against the manifest oracles ---------
  const oracleByCase = new Map();
  for (const row of manifest.rows) {
    if (row.oracle) oracleByCase.set(row.case_id, row.oracle);
  }
  for (const [rowTriple, response] of responseByTriple) {
    const manifestRow = manifestByTriple.get(rowTriple);
    if (!manifestRow) continue; // already reported above
    errors.push(...validateEvidence(response.evidence, manifestRow.oracle ?? null, `response ${rowTriple}`));
  }

  // -- judgments: exact two-way coverage against the key --------------------
  const judgmentBySample = new Map();
  judgments.forEach((row, index) => {
    errors.push(...validateJudgmentRow(row, index));
    if (!isNonEmptyString(row.sample_id)) return;
    if (!keyById.has(row.sample_id)) errors.push(`judgment references unknown sample_id ${row.sample_id}`);
    else if (judgmentBySample.has(row.sample_id)) errors.push(`duplicate judgment for sample_id ${row.sample_id}`);
    else judgmentBySample.set(row.sample_id, row);
  });
  const unjudged = [...keyById.keys()].filter((id) => !judgmentBySample.has(id));
  if (unjudged.length) {
    errors.push(`unjudged sample(s): ${unjudged.length} (${unjudged.slice(0, 5).join(", ")}${unjudged.length > 5 ? ", ..." : ""})`);
  }

  // -- samples: the judged artifact, bound to key and responses -------------
  // The judge reads samples.jsonl. score proves the text it judged is exactly
  // the text recorded under the key: recompute each sample digest, match it
  // to the key row's digest, and require sample_id set equality with the key.
  const sampleById = new Map();
  samples.forEach((row, index) => {
    const rowErrors = validateSampleRow(row, index);
    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }
    if (sampleById.has(row.sample_id)) errors.push(`duplicate sample row for sample_id ${row.sample_id}`);
    else sampleById.set(row.sample_id, row);
  });
  for (const id of keyById.keys()) {
    if (!sampleById.has(id)) errors.push(`sample file is missing key sample_id ${id}`);
  }
  for (const id of sampleById.keys()) {
    if (!keyById.has(id)) errors.push(`sample row references unknown sample_id ${id}`);
  }
  for (const [id, sample] of sampleById) {
    const keyRow = keyById.get(id);
    if (!keyRow) continue; // already reported above
    if (responseSha256(sample.response) !== sample.response_sha256) {
      errors.push(`sample digest mismatch for ${id}: judged sample text does not match its response_sha256 (samples file tampered)`);
    }
    if (sample.response_sha256 !== keyRow.response_sha256) {
      errors.push(`sample/key digest mismatch for ${id}: the judged text is not the text recorded under this key (sample text swapped before or after judging)`);
    }
    if (sample.case_id !== keyRow.case_id || sample.trial !== keyRow.trial) {
      errors.push(`sample/key identity mismatch for ${id}: case_id/trial differs between samples and key`);
    }
  }
  if (errors.length) return errorSummary(errors);

  // -- group by condition ----------------------------------------------------
  const groups = { baseline: [], candidate: [] };
  for (const keyRow of keyById.values()) {
    groups[keyRow.condition].push({
      key: keyRow,
      judgment: judgmentBySample.get(keyRow.sample_id),
      evidence: responseByTriple.get(triple(keyRow)).evidence ?? null,
    });
  }
  if (!groups.baseline.length || !groups.candidate.length) {
    return errorSummary(["scores must include both baseline and candidate conditions"]);
  }

  // -- provenance: consistent within a condition, matched across ------------
  for (const condition of CONDITIONS) {
    const reference = groups[condition][0].key;
    for (const row of groups[condition]) {
      for (const field of [...CROSS_CONDITION_FIELDS, ...PACKAGE_FIELDS]) {
        if (String(row.key[field]) !== String(reference[field])) {
          errors.push(`inconsistent ${field} within condition ${condition}`);
        }
      }
    }
  }
  if (!errors.length) {
    const baseRef = groups.baseline[0].key;
    const candRef = groups.candidate[0].key;
    for (const field of CROSS_CONDITION_FIELDS) {
      if (String(baseRef[field]) !== String(candRef[field])) {
        errors.push(`provenance mismatch across conditions: ${field} differs (baseline "${baseRef[field]}" vs candidate "${candRef[field]}")`);
      }
    }
    if (baseRef.package_digest === candRef.package_digest) {
      errors.push(
        `baseline and candidate share package_digest ${baseRef.package_digest}: the installed package content is identical, so the comparison is degenerate (structural error)`,
      );
    }
    if (baseRef.activation_digest === candRef.activation_digest) {
      errors.push(
        `baseline and candidate share activation_digest ${baseRef.activation_digest}: the condition's always-loaded APPEND_SYSTEM overlay was not activated differently (package install alone does not activate it), so the treatment is not actually exercised (structural error)`,
      );
    }
  }
  if (errors.length) return errorSummary(errors);

  // -- machine-evidence gate + lexicographic release gate --------------------
  const machine = evaluateMachineEvidence(groups, oracleByCase);
  const candOracle = machine.perCondition.candidate;
  const baseOracle = machine.perCondition.baseline;
  const conditions = { baseline: aggregate(groups.baseline), candidate: aggregate(groups.candidate) };
  const base = conditions.baseline._raw;
  const cand = conditions.candidate._raw;
  delete conditions.baseline._raw;
  delete conditions.candidate._raw;

  const maxTokens = base.meanTokens * (1 + TOKEN_GROWTH_LIMIT);
  const growthPercent = (cand.meanTokens / base.meanTokens - 1) * 100;
  const gates = [
    {
      id: "zero-blockers",
      passed: conditions.candidate.blocking_findings === 0 && conditions.baseline.blocking_findings === 0,
      detail:
        conditions.candidate.blocking_findings > 0
          ? `candidate has ${conditions.candidate.blocking_findings} blocking finding(s)`
          : conditions.baseline.blocking_findings > 0
            ? `baseline has ${conditions.baseline.blocking_findings} blocking finding(s); comparison invalid`
            : "no blocking findings",
    },
    {
      id: "machine-evidence",
      passed: machine.machineVerified > 0 && candOracle.failures.length === 0,
      detail: machineGateDetail(machine, candOracle, baseOracle),
      machine_verified: machine.machineVerified,
      prose_only: machine.proseOnly,
      candidate_failures: candOracle.failures,
      baseline_failures: baseOracle.failures,
    },
  ];
  for (const dimension of ["correctness", "safety", "autonomy"]) {
    const regressed = cand.means[dimension] < base.means[dimension] - EPSILON;
    gates.push({
      id: `no-${dimension}-regression`,
      passed: !regressed,
      detail: regressed
        ? `${dimension} regressed: candidate ${round4(cand.means[dimension])} < baseline ${round4(base.means[dimension])}`
        : `${dimension}: candidate ${round4(cand.means[dimension])} >= baseline ${round4(base.means[dimension])}`,
    });
  }
  gates.push({
    id: "weighted-score-improves",
    passed: cand.weightedScore > base.weightedScore + EPSILON,
    detail:
      cand.weightedScore > base.weightedScore + EPSILON
        ? `weighted score improved: candidate ${round4(cand.weightedScore)} > baseline ${round4(base.weightedScore)}`
        : `weighted score did not improve: candidate ${round4(cand.weightedScore)} <= baseline ${round4(base.weightedScore)}`,
  });
  gates.push({
    id: "token-budget",
    passed: cand.meanTokens <= maxTokens + EPSILON,
    detail:
      cand.meanTokens <= maxTokens + EPSILON
        ? `mean assistant tokens grew ${round4(growthPercent)}% (candidate ${round4(cand.meanTokens)} <= max ${round4(maxTokens)})`
        : `mean assistant tokens grew ${round4(growthPercent)}% (candidate ${round4(cand.meanTokens)} > max ${round4(maxTokens)} = baseline ${round4(base.meanTokens)} + 10%)`,
    baseline_mean: round4(base.meanTokens),
    candidate_mean: round4(cand.meanTokens),
    max_candidate_mean: round4(maxTokens),
    growth_percent: round4(growthPercent),
  });

  const reasons = gates.filter((gate) => !gate.passed).map((gate) => gate.detail);
  const judgeRecord = {};
  for (const field of JUDGE_PROVENANCE_FIELDS) judgeRecord[field] = judge[field];
  return {
    ok: reasons.length === 0,
    weights: WEIGHTS,
    manifest_sha256: manifest.manifest_sha256,
    judge: judgeRecord,
    conditions,
    checks: {
      manifest: "verified",
      paired_coverage: "matched",
      provenance: "matched",
      activation: "matched",
      response_digests: "matched",
      samples: "matched",
    },
    evidence: {
      machine_verified: machine.machineVerified,
      prose_only: machine.proseOnly,
      oracle_cases: [...oracleByCase.keys()].sort(),
      candidate_oracle: { rows: candOracle.rows, failures: candOracle.failures },
      baseline_oracle: { rows: baseOracle.rows, failures: baseOracle.failures },
    },
    gates,
    release: { decision: reasons.length === 0 ? "pass" : "fail", reasons },
  };
}

function machineGateDetail(machine, candOracle, baseOracle) {
  if (machine.machineVerified === 0) {
    return "no oracle cases in the manifest; machine-evidence coverage is required for release";
  }
  if (candOracle.failures.length) {
    return `${candOracle.failures.length} candidate machine-evidence failure(s): ${candOracle.failures.slice(0, 6).join("; ")}${candOracle.failures.length > 6 ? "; ..." : ""}`;
  }
  const verified = `${machine.machineVerified} oracle row(s) machine-verified; ${machine.proseOnly} prose-only row(s) (behavior not machine-verified)`;
  return baseOracle.failures.length
    ? `${verified}; baseline oracle: ${baseOracle.failures.length} failure(s) reported as comparison data (the measured delta), not a release blocker`
    : verified;
}

// ---------------------------------------------------------------------------
// CLI

/** Machine-readable structural error; always JSON on stdout, always exit 2. */
function structuralExit(errors) {
  console.log(JSON.stringify({ ok: false, errors, release: { decision: "error", reasons: errors } }, null, 2));
  return 2;
}

function readJsonlFile(path) {
  return parseJsonl(readFileSync(path, "utf8"), path);
}

/**
 * Release manifests are pinned to the packaged full catalog and rubric.
 * blind and score re-verify both digests against the files as shipped, so a
 * manifest planned from a custom/subset catalog (or scored against a
 * modified rubric) can never produce a releasable result.
 */
export function verifyPackagedPin(manifest) {
  let casesDigest;
  let rubricDigest;
  try {
    casesDigest = sha256(readFileSync(DEFAULT_CASES));
  } catch (error) {
    return [error.message];
  }
  try {
    rubricDigest = sha256(readFileSync(DEFAULT_RUBRIC));
  } catch (error) {
    return [error.message];
  }
  const errors = [];
  if (manifest.cases_file_sha256 !== casesDigest) {
    errors.push("manifest cases_file_sha256 does not match the packaged full catalog (a subset/custom catalog cannot produce a release; re-plan from the packaged catalog)");
  }
  if (manifest.rubric_file_sha256 !== rubricDigest) {
    errors.push("manifest rubric_file_sha256 does not match the packaged rubric (a custom rubric cannot produce a release; re-plan from the packaged rubric)");
  }
  return errors;
}

/**
 * Full-catalog matrix enforcement. A manifest can carry the genuine packaged
 * catalog/rubric digests and a recomputed (internally consistent) hash yet
 * still cover only a forged subset of rows. So blind and score do not stop at
 * the digests: they rebuild the complete expected matrix from the packaged
 * full catalog and manifest.trials — every (case, trial, condition) row with
 * its split and embedded oracle payload — and exact-compare it (order
 * independent) against the manifest rows, then re-confirm manifest_sha256
 * against the reconstruction. Any subset, reordered-coverage, or otherwise
 * forged manifest fails here with exit 2.
 */
export function verifyPackagedMatrix(manifest) {
  const errors = verifyPackagedPin(manifest);
  if (errors.length) return errors;
  let casesBytes;
  let rubricBytes;
  try {
    casesBytes = readFileSync(DEFAULT_CASES);
    rubricBytes = readFileSync(DEFAULT_RUBRIC);
  } catch (error) {
    return [error.message];
  }
  let cases;
  try {
    cases = parseJsonl(casesBytes.toString("utf8"), DEFAULT_CASES);
  } catch (error) {
    return [error.message];
  }
  if (!isPositiveInt(manifest.trials)) return ["manifest trials must be an integer >= 1"];
  const expected = buildManifest(cases, manifest.trials, {
    casesDigest: sha256(casesBytes),
    rubricDigest: sha256(rubricBytes),
  });
  const canon = (rows) => rows.map((row) => canonicalJson(row)).sort();
  const expectedRows = canon(expected.rows);
  const actualRows = canon(Array.isArray(manifest.rows) ? manifest.rows : []);
  if (expectedRows.length !== actualRows.length || expectedRows.some((row, i) => row !== actualRows[i])) {
    return [
      `manifest rows are not exactly the packaged full catalog matrix for trials=${manifest.trials} (split and oracle payloads included): a subset, forged, or coverage-reordered manifest cannot produce a release; re-plan from the packaged catalog`,
    ];
  }
  if (manifest.manifest_sha256 !== expected.manifest_sha256) {
    return ["manifest_sha256 does not match the reconstructed packaged matrix (manifest was not planned from the packaged full catalog)"];
  }
  return [];
}

function commandValidate(values) {
  if (values.trials !== undefined) {
    return structuralExit(["validate does not accept --trials; --trials is only valid for plan (validate checks the catalog exactly as shipped)"]);
  }
  const path = values.cases ?? DEFAULT_CASES;
  let cases;
  try {
    cases = readJsonlFile(path);
  } catch (error) {
    return structuralExit([error.message]);
  }
  const { errors, summary } = validateCases(cases);
  console.log(JSON.stringify({ ok: errors.length === 0, cases_file: path, ...summary, errors }, null, 2));
  return errors.length === 0 ? 0 : 1;
}

function commandPlan(values) {
  if (values.manifest !== undefined) {
    return structuralExit(["plan does not accept --manifest; write the run manifest with --out-manifest (plan is pinned to the packaged full catalog and rubric)"]);
  }
  const rejected = [values.cases && "--cases", values.rubric && "--rubric"].filter(Boolean);
  if (rejected.length) {
    return structuralExit([
      `plan is pinned to the packaged full catalog and rubric; ${rejected.join("/")} not accepted (a release manifest must cover every shipped case, audit and oracle cases included)`,
    ]);
  }
  let casesBytes;
  let rubricBytes;
  try {
    casesBytes = readFileSync(DEFAULT_CASES);
  } catch (error) {
    return structuralExit([error.message]);
  }
  try {
    rubricBytes = readFileSync(DEFAULT_RUBRIC);
  } catch (error) {
    return structuralExit([error.message]);
  }
  let cases;
  try {
    cases = parseJsonl(casesBytes.toString("utf8"), DEFAULT_CASES);
  } catch (error) {
    return structuralExit([error.message]);
  }
  // Full coverage is mandatory on the release path: every category, >= 14
  // cases, at least one audit case, at least one oracle case. Schema and
  // coverage failures are structural: machine-readable JSON + exit 2.
  const { errors } = validateCases(cases, { requireCoverage: true });
  if (errors.length) return structuralExit(errors);
  const trials = Number(values.trials ?? "3");
  if (!Number.isInteger(trials) || trials < 1) return structuralExit(["--trials must be an integer >= 1"]);
  const manifest = buildManifest(cases, trials, {
    casesDigest: sha256(casesBytes),
    rubricDigest: sha256(rubricBytes),
  });
  const outPath = values["out-manifest"] ?? DEFAULT_MANIFEST;
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    return structuralExit([error.message]);
  }
  for (const row of planMatrix(cases, trials)) console.log(JSON.stringify(row));
  console.error(`response-evals: wrote manifest ${outPath} (manifest_sha256 ${manifest.manifest_sha256})`);
  return 0;
}

function commandBlind(values) {
  const missing = ["responses", "out", "key", "manifest"].filter((flag) => !values[flag]);
  if (missing.length) return structuralExit(missing.map((flag) => `blind requires --${flag}`));
  if (values.cases) return structuralExit(["blind is pinned to the packaged full catalog; --cases not accepted"]);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(values.manifest, "utf8"));
  } catch (error) {
    return structuralExit([`${values.manifest}: ${error.message}`]);
  }
  const manifestErrors = verifyManifest(manifest);
  if (manifestErrors.length) return structuralExit(manifestErrors);
  const pinErrors = verifyPackagedMatrix(manifest);
  if (pinErrors.length) return structuralExit(pinErrors);
  let responses;
  try {
    responses = readJsonlFile(values.responses);
  } catch (error) {
    return structuralExit([error.message]);
  }
  const { errors, samples, key } = blindResponses(responses, { manifest });
  if (errors.length) return structuralExit(errors);
  try {
    writeFileSync(values.out, samples.map((row) => JSON.stringify(row)).join("\n") + "\n");
    writeFileSync(values.key, key.map((row) => JSON.stringify(row)).join("\n") + "\n");
  } catch (error) {
    return structuralExit([error.message]);
  }
  console.log(
    JSON.stringify({ ok: true, samples: values.out, key: values.key, rows: samples.length, manifest_sha256: manifest.manifest_sha256 }, null, 2),
  );
  return 0;
}

function commandScore(values) {
  const missing = ["judgments", "key", "responses", "samples", "judge-provenance", "manifest"].filter((flag) => !values[flag]);
  if (missing.length) return structuralExit(missing.map((flag) => `score requires --${flag}`));
  if (values.cases) return structuralExit(["score is pinned to the packaged full catalog; --cases not accepted"]);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(values.manifest, "utf8"));
  } catch (error) {
    return structuralExit([`${values.manifest}: ${error.message}`]);
  }
  const manifestErrors = verifyManifest(manifest);
  if (manifestErrors.length) return structuralExit(manifestErrors);
  const pinErrors = verifyPackagedMatrix(manifest);
  if (pinErrors.length) return structuralExit(pinErrors);
  let judgments;
  let key;
  let responses;
  let samples;
  let judge;
  try {
    judgments = readJsonlFile(values.judgments);
    key = readJsonlFile(values.key);
    responses = readJsonlFile(values.responses);
    samples = readJsonlFile(values.samples);
  } catch (error) {
    return structuralExit([error.message]);
  }
  try {
    judge = JSON.parse(readFileSync(values["judge-provenance"], "utf8"));
  } catch (error) {
    return structuralExit([`${values["judge-provenance"]}: ${error.message}`]);
  }
  const summary = scoreEvaluation({ judgments, key, responses, samples, judge, manifest });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.release.decision === "error") return 2;
  return summary.release.decision === "pass" ? 0 : 1;
}

/**
 * Per-command option schemas. Each command accepts only its own flags; flags
 * that belong to another command are either rejected with guidance in the
 * handler (the pinned --cases/--rubric, plan's --manifest) or fall through to
 * a strict parseArgs "unknown option" error. Either way the result is machine-
 * readable JSON + exit 2, never a silently ignored option.
 */
const COMMAND_OPTIONS = {
  validate: {
    cases: { type: "string" },
    trials: { type: "string" }, // rejected in-handler: plan-only flag
  },
  plan: {
    trials: { type: "string" },
    "out-manifest": { type: "string" },
    cases: { type: "string" }, // rejected in-handler: pinned to packaged catalog
    rubric: { type: "string" }, // rejected in-handler: pinned to packaged rubric
    manifest: { type: "string" }, // rejected in-handler: the flag is --out-manifest
  },
  blind: {
    responses: { type: "string" },
    out: { type: "string" },
    key: { type: "string" },
    manifest: { type: "string" },
    cases: { type: "string" }, // rejected in-handler: pinned to packaged catalog
  },
  score: {
    judgments: { type: "string" },
    key: { type: "string" },
    responses: { type: "string" },
    samples: { type: "string" },
    manifest: { type: "string" },
    "judge-provenance": { type: "string" },
    cases: { type: "string" }, // rejected in-handler: pinned to packaged catalog
  },
};

export function main(argv) {
  const [command, ...rest] = argv;
  // Command-specific option schemas: a flag that is valid for one command is
  // not silently accepted by another (e.g. plan --manifest, validate --trials).
  // Every argument error — unknown flag, wrong-command flag, missing required
  // value — routes through structuralExit (machine-readable JSON, exit 2).
  const options = COMMAND_OPTIONS[command];
  if (!options) {
    console.error(USAGE);
    return structuralExit([`unknown command: ${command ?? "(none)"} (expected one of: validate, plan, blind, score)`]);
  }
  let values;
  try {
    ({ values } = parseArgs({ args: rest, strict: true, options }));
  } catch (error) {
    return structuralExit([`${command}: argument error: ${error.message}`]);
  }
  try {
    switch (command) {
      case "validate":
        return commandValidate(values);
      case "plan":
        return commandPlan(values);
      case "blind":
        return commandBlind(values);
      case "score":
        return commandScore(values);
      default:
        return structuralExit([`unknown command: ${command}`]);
    }
  } catch (error) {
    return structuralExit([error.message]);
  }
}

try {
  if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
    process.exitCode = main(process.argv.slice(2));
  }
} catch {
  // Not invoked as a CLI (e.g. imported by tests); nothing to run.
}
