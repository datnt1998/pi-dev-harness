/**
 * Review map extension (spec `docs/specs/review-graph.md` R2). Pure graph
 * logic lives in `../lib/review-graph.ts`; this file wires it to git and the
 * host filesystem, following the same conventions as `./session-gc.ts`:
 * `safeCtx`/`safeCtxAsync` guarded host access (reused from
 * `../lib/autocompact-core.ts`) and a single registered command.
 *
 * `/review-map [base..head]`:
 * - with a `base..head` argument: the changed set and export deltas are a
 *   function of the range alone — `git diff --name-only base..head` filtered
 *   to source extensions, before/after content via `git show base:path` /
 *   `git show head:path` (never the worktree). A path missing on one side of
 *   the range (added/deleted) simply yields undefined content on that side;
 *   no separate rename/status handling is needed.
 * - with no argument: the changed set is the dirty tree (unstaged + staged
 *   diff names, plus untracked source files); before content is the HEAD
 *   version when it exists, after content is read from the worktree.
 * - importer scanning always reads the working tree, regardless of mode —
 *   a documented decision that keeps scanning subprocess-free (one
 *   `git ls-files` call, then plain `fs.readFile`) and matches what a
 *   reviewer will read; the commit-at-boundary review rule makes tree and
 *   head coincide at review time.
 * - the workspace package index is gathered from tracked `package.json`
 *   files (name/main/module), read from the working tree; a malformed
 *   manifest is skipped and listed, never fatal; no workspace tool runs.
 * - files over `SIZE_GUARD_BYTES` are skipped from importer scanning and
 *   listed under a skipped section; unreadable files degrade the same way.
 * - outside a git work tree, with an empty change set, or with an invalid
 *   range, the command prints one clear message and never throws.
 */
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { safeCtxAsync } from "../lib/autocompact-core.ts";
import {
  buildReviewGraph,
  formatReviewMap,
  SOURCE_EXTENSIONS,
  type ChangedFileEntry,
  type PackageIndex,
  type RepoFileEntry,
} from "../lib/review-graph.ts";

/** Files larger than this are skipped from importer scanning and listed (R2). */
export const SIZE_GUARD_BYTES = 512 * 1024;

// --- git subprocess helpers ---

type GitResult = { ok: true; stdout: string } | { ok: false; error: string };

function runGit(cwd: string, args: string[]): GitResult {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) return { ok: false, error: result.error.message };
  if (result.status !== 0) return { ok: false, error: (result.stderr || result.stdout || `git ${args.join(" ")} failed`).trim() };
  return { ok: true, stdout: result.stdout };
}

function isGitWorkTree(cwd: string): boolean {
  const result = runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return result.ok && result.stdout.trim() === "true";
}

function gitShow(cwd: string, ref: string, path: string): string | undefined {
  const result = runGit(cwd, ["show", `${ref}:${path}`]);
  return result.ok ? result.stdout : undefined;
}

function isSourcePath(path: string): boolean {
  return (SOURCE_EXTENSIONS as readonly string[]).includes(extname(path));
}

function nonEmptyLines(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

// --- argument parsing ---

export type ReviewMapArgs = { mode: "dirty" } | { mode: "range"; base: string; head: string } | { mode: "error"; message: string };

/** Parse the `/review-map [base..head]` argument (R2). */
export function parseReviewMapArgs(args: string): ReviewMapArgs {
  const trimmed = args.trim();
  if (trimmed.length === 0) return { mode: "dirty" };
  const sepIndex = trimmed.indexOf("..");
  if (sepIndex === -1) return { mode: "error", message: `Usage: /review-map [base..head] (got "${trimmed}")` };
  const base = trimmed.slice(0, sepIndex).trim();
  const head = trimmed.slice(sepIndex + 2).trim();
  if (base.length === 0 || head.length === 0) return { mode: "error", message: `Usage: /review-map [base..head] (got "${trimmed}")` };
  return { mode: "range", base, head };
}

// --- changed-file gathering ---

/** Range mode: changed set and content are functions of the range alone (R2). */
export function gatherRangeChanges(cwd: string, base: string, head: string): { changed: ChangedFileEntry[]; error?: string } {
  const diff = runGit(cwd, ["diff", "--name-only", `${base}..${head}`]);
  if (!diff.ok) return { changed: [], error: diff.error };
  const paths = nonEmptyLines(diff.stdout).filter(isSourcePath);
  const changed = paths.map((path) => ({ path, before: gitShow(cwd, base, path), after: gitShow(cwd, head, path) }));
  return { changed };
}

/** Dirty mode: unstaged + staged diff names, plus untracked source files (R2). */
export async function gatherDirtyChanges(cwd: string): Promise<ChangedFileEntry[]> {
  const unstaged = runGit(cwd, ["diff", "--name-only"]);
  const staged = runGit(cwd, ["diff", "--name-only", "--cached"]);
  const untracked = runGit(cwd, ["ls-files", "--others", "--exclude-standard"]);

  const paths = new Set<string>();
  for (const result of [unstaged, staged, untracked]) {
    if (result.ok) for (const path of nonEmptyLines(result.stdout)) paths.add(path);
  }

  const changed: ChangedFileEntry[] = [];
  for (const path of [...paths].filter(isSourcePath).sort()) {
    const before = gitShow(cwd, "HEAD", path);
    let after: string | undefined;
    try {
      after = await readFile(join(cwd, path), "utf8");
    } catch {
      after = undefined;
    }
    changed.push({ path, before, after });
  }
  return changed;
}

// --- candidate importer / package index gathering (working tree, subprocess-free content reads) ---

export type SkippedFile = { path: string; reason: string };

export async function gatherCandidateFiles(cwd: string): Promise<{ files: RepoFileEntry[]; fileIndex: string[]; skipped: SkippedFile[] }> {
  const lsFiles = runGit(cwd, ["ls-files"]);
  if (!lsFiles.ok) return { files: [], fileIndex: [], skipped: [] };
  const allPaths = nonEmptyLines(lsFiles.stdout);
  const fileIndex = allPaths;
  const sourcePaths = allPaths.filter(isSourcePath);

  const files: RepoFileEntry[] = [];
  const skipped: SkippedFile[] = [];
  for (const path of sourcePaths) {
    const absolute = join(cwd, path);
    try {
      const st = await stat(absolute);
      if (st.size > SIZE_GUARD_BYTES) {
        skipped.push({ path, reason: `oversized (${st.size} bytes > ${SIZE_GUARD_BYTES} byte guard)` });
        continue;
      }
      const content = await readFile(absolute, "utf8");
      files.push({ path, content });
    } catch (error) {
      skipped.push({ path, reason: `unreadable (${(error as Error).message})` });
    }
  }
  return { files, fileIndex, skipped };
}

export type PackageIndexResult = { packageIndex: PackageIndex; malformed: string[] };

/** Gather the workspace package index from tracked `package.json` files (working tree content), never invoking a workspace tool (R2). */
export async function gatherPackageIndex(cwd: string): Promise<PackageIndexResult> {
  const lsFiles = runGit(cwd, ["ls-files", "--", "*package.json"]);
  const packageIndex: PackageIndex = {};
  const malformed: string[] = [];
  if (!lsFiles.ok) return { packageIndex, malformed };

  for (const path of nonEmptyLines(lsFiles.stdout)) {
    const root = path.endsWith("/package.json") ? path.slice(0, -"/package.json".length) : path === "package.json" ? "." : undefined;
    if (root === undefined) continue;
    try {
      const raw = JSON.parse(await readFile(join(cwd, path), "utf8")) as Record<string, unknown>;
      if (typeof raw.name !== "string" || raw.name.length === 0) {
        malformed.push(path);
        continue;
      }
      packageIndex[raw.name] = {
        root,
        main: typeof raw.main === "string" ? raw.main : undefined,
        module: typeof raw.module === "string" ? raw.module : undefined,
      };
    } catch {
      malformed.push(path);
    }
  }
  return { packageIndex, malformed };
}

// --- orchestration ---

function appendNotesSections(map: string, skipped: SkippedFile[], malformedManifests: string[]): string {
  const lines = [map];
  if (skipped.length > 0) {
    lines.push("", "## Skipped files", "");
    for (const entry of skipped.sort((a, b) => (a.path < b.path ? -1 : 1))) lines.push(`- ${entry.path}: ${entry.reason}`);
  }
  if (malformedManifests.length > 0) {
    lines.push("", "## Malformed package manifests", "");
    for (const path of malformedManifests.sort()) lines.push(`- ${path}`);
  }
  return lines.join("\n");
}

/**
 * Build the copy-ready review map text for `cwd` and the given argument
 * string. Never throws: git/fs failures, non-git directories, empty change
 * sets, and invalid ranges all degrade to a single clear message (R2).
 */
export async function buildReviewMapText(cwd: string, args: string): Promise<string> {
  if (!isGitWorkTree(cwd)) return "review-map: not a git work tree.";

  const parsed = parseReviewMapArgs(args);
  if (parsed.mode === "error") return `review-map: ${parsed.message}`;

  let changed: ChangedFileEntry[];
  if (parsed.mode === "range") {
    const result = gatherRangeChanges(cwd, parsed.base, parsed.head);
    if (result.error) return `review-map: invalid range "${parsed.base}..${parsed.head}" (${result.error})`;
    changed = result.changed;
  } else {
    changed = await gatherDirtyChanges(cwd);
  }

  if (changed.length === 0) return "review-map: no changed source files.";

  const [{ files, fileIndex, skipped }, { packageIndex, malformed }] = await Promise.all([
    gatherCandidateFiles(cwd),
    gatherPackageIndex(cwd),
  ]);

  const graph = buildReviewGraph({ changed, files, fileIndex, packageIndex });
  const map = formatReviewMap(graph);
  return appendNotesSections(map, skipped, malformed);
}

// --- extension wiring ---

export const REVIEW_MAP_HELP_TEXT = [
  "/review-map — review-graph navigation map for the dirty tree (unstaged + staged + untracked source files)",
  "/review-map <base..head> — review-graph navigation map for a git range",
].join("\n");

export default function reviewGraph(pi: ExtensionAPI) {
  pi.registerCommand("review-map", {
    description: "Print a review-graph navigation map (changed files, dependents, guards) for a git range or the dirty tree",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await safeCtxAsync(async () => {
        const text = await buildReviewMapText(ctx.cwd, args);
        ctx.ui.notify(text, "info");
      });
    },
  });
}
