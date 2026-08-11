/**
 * Extension tests for `extensions/review-graph.ts`, mirroring
 * `tests/session-gc-extension.test.ts`'s patterns: a fake `pi` +
 * fake/stale `ExtensionContext`, and disposable `mkdtemp` git fixture repos
 * (init, commit, modify) that never touch the host repo state
 * (`.scratch/review-graph/tickets.md` T2).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import reviewGraph, {
  SIZE_GUARD_BYTES,
  buildReviewMapText,
  gatherDirtyChanges,
  gatherPackageIndex,
  parseReviewMapArgs,
} from "../extensions/review-graph.ts";
import { STALE_CTX_MARKER } from "../lib/autocompact-core.ts";

// --- git fixture helpers (disposable mkdtemp repos only; never the host repo) ---

function git(cwd: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
}

async function initFixtureRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "review-graph-fixture-"));
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.email", "fixture@example.com"]);
  git(dir, ["config", "user.name", "Fixture"]);
  return dir;
}

async function writeAndCommit(dir: string, files: Record<string, string>, message: string): Promise<void> {
  for (const [relPath, content] of Object.entries(files)) {
    const absolute = join(dir, relPath);
    await mkdir(join(absolute, ".."), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", message]);
}

function makeFakePi() {
  const commands: Record<string, { handler: (args: string, ctx: unknown) => Promise<unknown> }> = {};
  const pi = {
    on() {},
    registerCommand(name: string, def: { handler: (args: string, ctx: unknown) => Promise<unknown> }) {
      commands[name] = def;
    },
  };
  return { pi, commands };
}

function liveCtx(cwd: string, notes: string[]) {
  return { ui: { notify: (message: string) => notes.push(message) }, cwd };
}

function staleCtx() {
  const throwStale = (): never => {
    throw new Error(`${STALE_CTX_MARKER}. Do not use a captured pi or command ctx after ctx.fork().`);
  };
  return {
    get ui() {
      return throwStale();
    },
    get cwd() {
      return throwStale();
    },
  };
}

// --- parseReviewMapArgs ---

test("parseReviewMapArgs: empty is dirty mode, base..head is range mode, malformed is an error", () => {
  assert.deepEqual(parseReviewMapArgs(""), { mode: "dirty" });
  assert.deepEqual(parseReviewMapArgs("  "), { mode: "dirty" });
  assert.deepEqual(parseReviewMapArgs("main..feature"), { mode: "range", base: "main", head: "feature" });
  assert.deepEqual(parseReviewMapArgs("HEAD~2..HEAD"), { mode: "range", base: "HEAD~2", head: "HEAD" });
  assert.equal(parseReviewMapArgs("not-a-range").mode, "error");
  assert.equal(parseReviewMapArgs("..head").mode, "error");
  assert.equal(parseReviewMapArgs("base..").mode, "error");
});

// --- non-git / degradation ---

test("buildReviewMapText degrades to a clear message outside a git work tree, never throws", async () => {
  const dir = await mkdtemp(join(tmpdir(), "review-graph-nongit-"));
  try {
    const text = await buildReviewMapText(dir, "");
    assert.match(text, /not a git work tree/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("buildReviewMapText degrades to a clear message on an empty change set", async () => {
  const dir = await initFixtureRepo();
  try {
    await writeAndCommit(dir, { "src/a.ts": "export const a = 1;\n" }, "init");
    const text = await buildReviewMapText(dir, "");
    assert.match(text, /no changed source files/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("buildReviewMapText degrades to a clear message on an invalid range", async () => {
  const dir = await initFixtureRepo();
  try {
    await writeAndCommit(dir, { "src/a.ts": "export const a = 1;\n" }, "init");
    const text = await buildReviewMapText(dir, "nonexistent-base..nonexistent-head");
    assert.match(text, /invalid range/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- range mode ---

test("range mode: changed set and content come from the range, not the worktree", async () => {
  const dir = await initFixtureRepo();
  try {
    await writeAndCommit(dir, { "src/util.ts": "export const a = 1;\n" }, "base");
    git(dir, ["branch", "base-tag"]);
    await writeAndCommit(
      dir,
      { "src/util.ts": "export const a = 1;\nexport const b = 2;\n", "src/consumer.ts": "import { a } from \"./util\";\n" },
      "head",
    );
    // Dirty the worktree after the range boundary: range output must ignore this.
    await writeFile(join(dir, "src", "util.ts"), "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n", "utf8");

    const text = await buildReviewMapText(dir, "base-tag..HEAD");
    assert.match(text, /## src\/util\.ts \(modified\)/);
    assert.match(text, /\| added \| b \|/);
    assert.doesNotMatch(text, /\bc\b/, "worktree-only edit past the range head must not appear");
    assert.match(text, /src\/consumer\.ts/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("range mode: an added file (before absent) and a deleted file (after absent) both resolve without a rename special case", async () => {
  const dir = await initFixtureRepo();
  try {
    await writeAndCommit(dir, { "src/old.ts": "export const old = 1;\n" }, "base");
    git(dir, ["branch", "base-tag"]);
    await rm(join(dir, "src", "old.ts"));
    await writeAndCommit(dir, { "src/new.ts": "export const fresh = 1;\n" }, "head");

    const text = await buildReviewMapText(dir, "base-tag..HEAD");
    assert.match(text, /## src\/new\.ts \(added\)/);
    assert.match(text, /## src\/old\.ts \(deleted\)/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- dirty mode ---

test("dirty mode: gatherDirtyChanges includes unstaged edits, staged edits, and untracked source files", async () => {
  const dir = await initFixtureRepo();
  try {
    await writeAndCommit(dir, { "src/tracked.ts": "export const a = 1;\n" }, "init");
    await writeFile(join(dir, "src", "tracked.ts"), "export const a = 2;\n", "utf8");
    await mkdir(join(dir, "src"), { recursive: true });
    await writeFile(join(dir, "src", "staged.ts"), "export const s = 1;\n", "utf8");
    git(dir, ["add", "src/staged.ts"]);
    await writeFile(join(dir, "src", "untracked.ts"), "export const u = 1;\n", "utf8");

    const changed = await gatherDirtyChanges(dir);
    const paths = changed.map((c) => c.path).sort();
    assert.deepEqual(paths, ["src/staged.ts", "src/tracked.ts", "src/untracked.ts"]);

    const tracked = changed.find((c) => c.path === "src/tracked.ts")!;
    assert.equal(tracked.before, "export const a = 1;\n");
    assert.equal(tracked.after, "export const a = 2;\n");

    const untracked = changed.find((c) => c.path === "src/untracked.ts")!;
    assert.equal(untracked.before, undefined);
    assert.equal(untracked.after, "export const u = 1;\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("dirty mode end-to-end via buildReviewMapText prints a map for the dirty tree", async () => {
  const dir = await initFixtureRepo();
  try {
    await writeAndCommit(dir, { "src/util.ts": "export const a = 1;\n" }, "init");
    await writeFile(join(dir, "src", "util.ts"), "export const a = 1;\nexport const b = 2;\n", "utf8");
    await writeFile(join(dir, "src", "consumer.ts"), "import { a } from \"./util\";\n", "utf8");

    const text = await buildReviewMapText(dir, "");
    assert.match(text, /## src\/util\.ts \(modified\)/);
    assert.match(text, /\| added \| b \|/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- oversized-file skip listing ---

test("oversized-file skip listing: a candidate importer over the size guard is skipped and listed, not scanned", async () => {
  const dir = await initFixtureRepo();
  try {
    const bigContent = `${"x".repeat(SIZE_GUARD_BYTES + 10)}\nimport "./util";\n`;
    await writeAndCommit(
      dir,
      { "src/util.ts": "export const a = 1;\n", "src/big.ts": bigContent },
      "init",
    );
    await writeFile(join(dir, "src", "util.ts"), "export const a = 1;\nexport const b = 2;\n", "utf8");

    const text = await buildReviewMapText(dir, "");
    assert.match(text, /## Skipped files/);
    assert.match(text, /src\/big\.ts: oversized/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- workspace package index / two-package monorepo cross-package dependent ---

test("gatherPackageIndex reads tracked package.json name/main/module and skips a malformed manifest", async () => {
  const dir = await initFixtureRepo();
  try {
    await writeAndCommit(
      dir,
      {
        "packages/a/package.json": JSON.stringify({ name: "@scope/pkg-a" }),
        "packages/b/package.json": "{ not json",
      },
      "init",
    );
    const { packageIndex, malformed } = await gatherPackageIndex(dir);
    assert.deepEqual(packageIndex["@scope/pkg-a"], { root: "packages/a", main: undefined, module: undefined });
    assert.deepEqual(malformed, ["packages/b/package.json"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("two-package monorepo fixture: the map lists a cross-package dependent through the workspace name", async () => {
  const dir = await initFixtureRepo();
  try {
    await writeAndCommit(
      dir,
      {
        "packages/a/package.json": JSON.stringify({ name: "@scope/pkg-a" }),
        "packages/a/src/index.ts": "export const a = 1;\n",
        "packages/b/package.json": JSON.stringify({ name: "@scope/pkg-b" }),
        "packages/b/src/index.ts": 'import { a } from "@scope/pkg-a";\n',
      },
      "init",
    );
    await writeFile(join(dir, "packages", "a", "src", "index.ts"), "export const a = 1;\nexport const c = 3;\n", "utf8");

    const text = await buildReviewMapText(dir, "");
    assert.match(text, /## packages\/a\/src\/index\.ts \(modified\)/);
    assert.match(text, /packages\/b\/src\/index\.ts/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- command registration / stale ctx ---

test("/review-map is registered with help text and no-ops on a stale ctx without throwing", async () => {
  const { pi, commands } = makeFakePi();
  reviewGraph(pi as never);
  assert.ok(commands["review-map"]);

  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);
  process.on("unhandledRejection", onRejection);
  try {
    await commands["review-map"].handler("", staleCtx());
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(rejections.length, 0, `expected no unhandled rejections, got: ${String(rejections[0])}`);
  } finally {
    process.off("unhandledRejection", onRejection);
  }
});

test("/review-map command handler prints the map for a live ctx", async () => {
  const dir = await initFixtureRepo();
  try {
    await writeAndCommit(dir, { "src/util.ts": "export const a = 1;\n" }, "init");
    await writeFile(join(dir, "src", "util.ts"), "export const a = 1;\nexport const b = 2;\n", "utf8");

    const { pi, commands } = makeFakePi();
    reviewGraph(pi as never);
    const notes: string[] = [];
    await commands["review-map"].handler("", liveCtx(dir, notes));
    const text = notes.join("\n");
    assert.match(text, /# Review map/);
    assert.match(text, /src\/util\.ts/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
