#!/usr/bin/env node
/**
 * Verify ADR format: valid frontmatter status, title heading, sequential numbering.
 * Exits non-zero with a per-file report on violations.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const adrDir = join(root, "docs", "adr");
const errors = [];
const VALID_STATUSES = new Set(["proposed", "accepted", "rejected"]);

let files;
try {
  files = readdirSync(adrDir).filter((f) => f.endsWith(".md") && f !== "README.md").sort();
} catch {
  console.error(`ADR directory not found: ${adrDir}`);
  process.exit(1);
}

if (files.length === 0) {
  console.log("No ADR files found.");
  process.exit(0);
}

const seenNumbers = new Map();

for (const file of files) {
  const content = readFileSync(join(adrDir, file), "utf8");

  // Extract number from filename
  const numMatch = file.match(/^(\d+)-/);
  if (!numMatch) {
    errors.push(`${file}: filename must start with a sequential number (NNNN-slug.md)`);
    continue;
  }
  const num = numMatch[1];
  if (seenNumbers.has(num)) {
    errors.push(`${file}: duplicate ADR number ${num} (already used by ${seenNumbers.get(num)})`);
    continue;
  }
  seenNumbers.set(num, file);

  // Check frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    errors.push(`${file}: missing YAML frontmatter`);
    continue;
  }

  const statusMatch = fmMatch[1].match(/^status:\s*(.+)$/m);
  if (!statusMatch) {
    errors.push(`${file}: frontmatter missing 'status' field`);
    continue;
  }

  const status = statusMatch[1].trim();
  if (!VALID_STATUSES.has(status)) {
    errors.push(`${file}: invalid status '${status}' (must be one of: proposed, accepted, rejected)`);
    continue;
  }

  // Check for title heading
  const afterFrontmatter = content.slice(fmMatch[0].length);
  if (!/^#\s+.+/m.test(afterFrontmatter)) {
    errors.push(`${file}: missing title heading after frontmatter`);
  }
}

if (errors.length > 0) {
  console.error("ADR format violations:\n");
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
} else {
  console.log(`All ${files.length} ADRs pass format gate.`);
  process.exit(0);
}
