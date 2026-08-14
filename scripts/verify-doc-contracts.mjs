#!/usr/bin/env node
/**
 * Verify doc contracts: every extension documents its settings surface (or
 * "no configuration") and known limitations in the README; every skill carries
 * both surfaces in its SKILL.md.
 *
 * Exits non-zero with a per-file report when any contract is missing.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const errors = [];

// --- Extensions: check README entries ---

const extensionsDir = join(root, "extensions");
const readmePath = join(root, "README.md");
const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";

const extensionFiles = readdirSync(extensionsDir).filter((f) => f.endsWith(".ts"));
for (const extFile of extensionFiles) {
  const name = basename(extFile, ".ts");
  // Find the README section for this extension (line starting with `- \`name\``)
  const entryRe = new RegExp(`^[-*]\\s+\`${name}\``, "m");
  if (!entryRe.test(readme)) {
    errors.push(`${extFile}: no README entry found for \`${name}\``);
    continue;
  }

  // Extract the block: from the entry line until the next top-level bullet or heading
  const lines = readme.split("\n");
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (entryRe.test(lines[i])) { startIdx = i; break; }
  }
  if (startIdx === -1) continue;

  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    // Next top-level bullet (not indented sub-bullet) or heading
    if (/^[-*]\s+`/.test(lines[i]) || /^##/.test(lines[i])) { endIdx = i; break; }
  }
  const block = lines.slice(startIdx, endIdx).join("\n").toLowerCase();

  const hasSettings = /settings|configuration|config|no configuration|\.json/.test(block);
  const hasLimitations = /known limitation|limitation|no.*known|caveat|trade.?off|boundary/i.test(block);

  if (!hasSettings) errors.push(`${extFile}: README entry for \`${name}\` missing settings/configuration surface`);
  if (!hasLimitations) errors.push(`${extFile}: README entry for \`${name}\` missing known limitations`);
}

// --- Skills: check SKILL.md files ---

const skillsDir = join(root, "skills");
if (existsSync(skillsDir)) {
  const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const skillName of skillDirs) {
    const skillMd = join(skillsDir, skillName, "SKILL.md");
    if (!existsSync(skillMd)) {
      errors.push(`skills/${skillName}/SKILL.md: file not found`);
      continue;
    }

    const content = readFileSync(skillMd, "utf8");
    const lower = content.toLowerCase();

    const hasSettings = /settings|configuration|config|no configuration|trigger|input|output|scope/i.test(lower);
    const hasLimitations = /known limitation|limitation|non-goal|caveat|trade.?off|boundary|out of scope/i.test(lower);

    if (!hasSettings) errors.push(`skills/${skillName}/SKILL.md: missing settings/configuration surface`);
    if (!hasLimitations) errors.push(`skills/${skillName}/SKILL.md: missing known limitations`);
  }
}

// --- Report ---

if (errors.length > 0) {
  console.error("Doc contract violations:\n");
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
} else {
  console.log("All doc contracts satisfied.");
  process.exit(0);
}
