/**
 * Unit tests for `lib/review-graph.ts` (pure graph core), one assertion set
 * per `docs/specs/review-graph.md` R1 acceptance bullet
 * (`.scratch/review-graph/tickets.md` T1).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  DEPTH2_DEPENDENT_CAP,
  buildReviewGraph,
  formatReviewMap,
  parseExports,
  parseImports,
  resolveSpecifier,
  type ChangedFileEntry,
  type PackageIndex,
  type RepoFileEntry,
  type ReviewGraphInput,
} from "../lib/review-graph.ts";

// --- parseImports ---

test("parseImports extracts static import, export-from, require, and dynamic import specifiers", () => {
  const source = [
    `import Foo, { bar } from "./foo";`,
    `import * as ns from '../ns';`,
    `import "./side-effect";`,
    `export { a, b as c } from "./reexport";`,
    `export * from "./star";`,
    `const mod = require("./required");`,
    `const dyn = await import("./dynamic");`,
  ].join("\n");
  const specifiers = parseImports(source);
  assert.deepEqual(specifiers, ["./foo", "../ns", "./side-effect", "./reexport", "./star", "./required", "./dynamic"]);
});

test("parseImports strips line and block comments so commented-out imports produce no edge", () => {
  const source = [
    `// import { a } from "./commented-line";`,
    `/* import { b } from "./commented-block"; */`,
    `import { real } from "./real";`,
  ].join("\n");
  assert.deepEqual(parseImports(source), ["./real"]);
});

test("parseImports: a string literal mentioning import without real import syntax produces no edge", () => {
  const source = `const note = "please import your keys before deploying";\nimport { real } from "./real";`;
  assert.deepEqual(parseImports(source), ["./real"]);
});

test("parseImports does not corrupt a template literal containing //", () => {
  const source = [
    `const url = \`http://example.com/import-from-nowhere\`;`,
    `import { real } from "./real";`,
  ].join("\n");
  assert.deepEqual(parseImports(source), ["./real"]);
});

// --- parseExports ---

test("parseExports returns named declaration exports across const/let/var/function/class/type/interface/enum", () => {
  const source = [
    `export const a = 1;`,
    `export let b = 2;`,
    `export var c = 3;`,
    `export function d() {}`,
    `export class E {}`,
    `export type F = string;`,
    `export interface G {}`,
    `export enum H { X }`,
  ].join("\n");
  const surface = parseExports(source);
  assert.deepEqual(surface.named.sort(), ["E", "F", "G", "H", "a", "b", "c", "d"]);
  assert.equal(surface.hasDefault, false);
});

test("parseExports returns re-exported names and a default-export flag", () => {
  const source = [
    `export { a, b as c } from "./reexport";`,
    `export * as ns from "./star";`,
    `export default function main() {}`,
  ].join("\n");
  const surface = parseExports(source);
  assert.deepEqual(surface.reExported.sort(), ["a", "c", "ns"]);
  assert.equal(surface.hasDefault, true);
  assert.ok(!surface.named.includes("main"), "the default declaration name is not a named export");
});

// --- resolveSpecifier ---

test("resolveSpecifier resolves ./x and ../x with extension probing and /index.* probing", () => {
  const fileIndex = ["src/util.ts", "src/lib/index.ts", "src/entry.ts"];
  assert.deepEqual(resolveSpecifier("src/entry.ts", "./util", fileIndex, {}), { kind: "resolved", path: "src/util.ts" });
  assert.deepEqual(resolveSpecifier("src/entry.ts", "./lib", fileIndex, {}), { kind: "resolved", path: "src/lib/index.ts" });
});

test("resolveSpecifier: an unresolvable relative specifier is returned as unresolved, never guessed", () => {
  const fileIndex = ["src/entry.ts"];
  assert.deepEqual(resolveSpecifier("src/entry.ts", "./missing", fileIndex, {}), { kind: "unresolved" });
});

test("resolveSpecifier: a relative specifier with a non-source explicit extension classifies as external, never unresolved", () => {
  const fileIndex = ["src/entry.ts"];
  for (const specifier of ["./styles.css", "./icon.svg", "./data.json"]) {
    assert.deepEqual(resolveSpecifier("src/entry.ts", specifier, fileIndex, {}), { kind: "external" });
  }
});

test("resolveSpecifier: workspace package resolution via root probing, subpath probing, unmatched external, matched-but-unprobeable unresolved", () => {
  const fileIndex = ["packages/pkg-a/src/index.ts", "packages/pkg-a/sub.ts", "packages/pkg-b/lib/main.js"];
  const packageIndex: PackageIndex = {
    "@scope/pkg-a": { root: "packages/pkg-a" },
    "@scope/pkg-b": { root: "packages/pkg-b", main: "lib/main.js" },
    "@scope/pkg-c": { root: "packages/pkg-c" },
  };
  assert.deepEqual(resolveSpecifier("packages/pkg-b/lib/main.js", "@scope/pkg-a", fileIndex, packageIndex), {
    kind: "resolved",
    path: "packages/pkg-a/src/index.ts",
  });
  assert.deepEqual(resolveSpecifier("packages/pkg-b/lib/main.js", "@scope/pkg-a/sub", fileIndex, packageIndex), {
    kind: "resolved",
    path: "packages/pkg-a/sub.ts",
  });
  assert.deepEqual(resolveSpecifier("packages/pkg-a/src/sub.ts", "@scope/pkg-b", fileIndex, packageIndex), {
    kind: "resolved",
    path: "packages/pkg-b/lib/main.js",
  });
  assert.deepEqual(resolveSpecifier("packages/pkg-a/src/sub.ts", "@scope/pkg-c", fileIndex, packageIndex), { kind: "unresolved" });
  assert.deepEqual(resolveSpecifier("packages/pkg-a/src/sub.ts", "left-pad", fileIndex, packageIndex), { kind: "external" });
});

test("resolveSpecifier: bare specifier with no packageIndex resolves as external with no edge", () => {
  assert.deepEqual(resolveSpecifier("src/entry.ts", "lodash", ["src/entry.ts"], {}), { kind: "external" });
});

// --- buildReviewGraph ---

function graphInput(overrides: Partial<ReviewGraphInput>): ReviewGraphInput {
  return { changed: [], files: [], fileIndex: [], ...overrides };
}

test("buildReviewGraph: export delta, direct dependents, guards, and unresolved list (deduplicated, sorted, grouped)", () => {
  const changed: ChangedFileEntry[] = [
    { path: "src/util.ts", before: `export const a = 1;\nexport const b = 2;`, after: `export const a = 1;\nexport const c = 3;` },
  ];
  const files: RepoFileEntry[] = [
    { path: "src/util.ts", content: `export const a = 1;\nexport const c = 3;` },
    { path: "src/consumer.ts", content: `import { a } from "./util";\nimport "./missing-a";` },
    { path: "src/consumer.test.ts", content: `import { a } from "./util";` },
    { path: "src/other.ts", content: `import "./missing-a"; import "./missing-b";` },
  ];
  const fileIndex = files.map((f) => f.path);
  const graph = buildReviewGraph(graphInput({ changed, files, fileIndex }));

  const section = graph.sections.find((s) => s.path === "src/util.ts")!;
  assert.deepEqual(section.exportDelta.added, ["c"]);
  assert.deepEqual(section.exportDelta.removed, ["b"]);
  assert.deepEqual(section.directDependents, ["src/consumer.test.ts", "src/consumer.ts"]);
  assert.deepEqual(section.guards, [{ path: "src/consumer.test.ts", depth: 1 }]);

  assert.deepEqual(
    graph.unresolved.map((u) => u.specifier),
    ["./missing-a", "./missing-b"],
  );
  const missingA = graph.unresolved.find((u) => u.specifier === "./missing-a")!;
  assert.deepEqual(missingA.from, ["src/consumer.ts", "src/other.ts"]);
});

test("buildReviewGraph: depth-2 dependents are marked capped past the fixed cap", () => {
  const changed: ChangedFileEntry[] = [{ path: "src/base.ts", before: `export const a = 1;`, after: `export const a = 1;` }];
  const files: RepoFileEntry[] = [{ path: "src/base.ts", content: `export const a = 1;` }];
  files.push({ path: "src/mid.ts", content: `import "./base";` });
  const count = DEPTH2_DEPENDENT_CAP + 5;
  for (let i = 0; i < count; i += 1) {
    files.push({ path: `src/leaf-${String(i).padStart(3, "0")}.ts`, content: `import "./mid";` });
  }
  const fileIndex = files.map((f) => f.path);
  const graph = buildReviewGraph(graphInput({ changed, files, fileIndex }));
  const section = graph.sections[0];
  assert.equal(section.depth2Capped, true);
  assert.equal(section.depth2Dependents.length, DEPTH2_DEPENDENT_CAP);
});

test("buildReviewGraph: a circular import pair where both files changed terminates without looping", () => {
  const changed: ChangedFileEntry[] = [
    { path: "src/a.ts", before: `export const a = 1;`, after: `export const a = 1;` },
    { path: "src/b.ts", before: `export const b = 1;`, after: `export const b = 1;` },
  ];
  const files: RepoFileEntry[] = [
    { path: "src/a.ts", content: `import { b } from "./b";\nexport const a = 1;` },
    { path: "src/b.ts", content: `import { a } from "./a";\nexport const b = 1;` },
  ];
  const fileIndex = files.map((f) => f.path);
  const graph = buildReviewGraph(graphInput({ changed, files, fileIndex }));
  const sectionA = graph.sections.find((s) => s.path === "src/a.ts")!;
  const sectionB = graph.sections.find((s) => s.path === "src/b.ts")!;
  assert.deepEqual(sectionA.directDependents, ["src/b.ts"]);
  assert.deepEqual(sectionB.directDependents, ["src/a.ts"]);
});

test("buildReviewGraph: re-export chain — importer of A is a depth-1 dependent of A only, not of B", () => {
  const changed: ChangedFileEntry[] = [
    { path: "src/a.ts", before: `export { x } from "./b";`, after: `export { x } from "./b";` },
    { path: "src/b.ts", before: `export const x = 1;`, after: `export const x = 1;` },
  ];
  const files: RepoFileEntry[] = [
    { path: "src/a.ts", content: `export { x } from "./b";` },
    { path: "src/b.ts", content: `export const x = 1;` },
    { path: "src/consumer.ts", content: `import { x } from "./a";` },
  ];
  const fileIndex = files.map((f) => f.path);
  const graph = buildReviewGraph(graphInput({ changed, files, fileIndex }));
  const sectionA = graph.sections.find((s) => s.path === "src/a.ts")!;
  const sectionB = graph.sections.find((s) => s.path === "src/b.ts")!;
  assert.deepEqual(sectionA.directDependents, ["src/consumer.ts"]);
  assert.deepEqual(sectionB.directDependents, ["src/a.ts"], "only A (via its re-export edge) is a depth-1 dependent of B; consumer imports A, not B directly");
});

test("buildReviewGraph: deleted file has no after content and every prior export is removed", () => {
  const changed: ChangedFileEntry[] = [{ path: "src/gone.ts", before: `export const a = 1;`, after: undefined }];
  const graph = buildReviewGraph(graphInput({ changed, files: [], fileIndex: [] }));
  const section = graph.sections[0];
  assert.equal(section.status, "deleted");
  assert.deepEqual(section.exportDelta.removed, ["a"]);
  assert.deepEqual(section.exportDelta.added, []);
});

test("buildReviewGraph: new file has no before content and every export is added", () => {
  const changed: ChangedFileEntry[] = [{ path: "src/new.ts", before: undefined, after: `export const a = 1;` }];
  const graph = buildReviewGraph(graphInput({ changed, files: [], fileIndex: [] }));
  const section = graph.sections[0];
  assert.equal(section.status, "added");
  assert.deepEqual(section.exportDelta.added, ["a"]);
  assert.deepEqual(section.exportDelta.removed, []);
});

test("buildReviewGraph: a relative specifier with a non-source extension classifies as external, never unresolved", () => {
  const changed: ChangedFileEntry[] = [{ path: "src/style.css", before: undefined, after: "" }];
  const files: RepoFileEntry[] = [{ path: "src/consumer.ts", content: `import "./style.css";` }];
  const fileIndex = ["src/style.css", ...files.map((f) => f.path)];
  const graph = buildReviewGraph(graphInput({ changed, files, fileIndex }));
  assert.deepEqual(graph.unresolved, []);
});

test("buildReviewGraph: cross-package dependent via workspace name appears as a depth-1 dependent", () => {
  const changed: ChangedFileEntry[] = [
    { path: "packages/a/src/index.ts", before: `export const a = 1;`, after: `export const a = 1;` },
  ];
  const files: RepoFileEntry[] = [
    { path: "packages/a/src/index.ts", content: `export const a = 1;` },
    { path: "packages/b/src/index.ts", content: `import { a } from "@scope/pkg-a";` },
  ];
  const fileIndex = files.map((f) => f.path);
  const packageIndex: PackageIndex = { "@scope/pkg-a": { root: "packages/a" } };
  const graph = buildReviewGraph(graphInput({ changed, files, fileIndex, packageIndex }));
  assert.deepEqual(graph.sections[0].directDependents, ["packages/b/src/index.ts"]);
});

// --- formatReviewMap ---

test("formatReviewMap emits a deterministic markdown block with summary, tables, and trailing token size", () => {
  const changed: ChangedFileEntry[] = [
    { path: "src/util.ts", before: `export const a = 1;`, after: `export const a = 1;\nexport const b = 2;` },
  ];
  const files: RepoFileEntry[] = [
    { path: "src/util.ts", content: `export const a = 1;\nexport const b = 2;` },
    { path: "src/consumer.test.ts", content: `import { a } from "./util";` },
  ];
  const fileIndex = files.map((f) => f.path);
  const graph = buildReviewGraph(graphInput({ changed, files, fileIndex }));
  const map = formatReviewMap(graph);

  assert.match(map, /^# Review map/);
  assert.match(map, /Summary: 1 changed file\(s\), 1 dependent\(s\), 1 guard\(s\)\./);
  assert.match(map, /## src\/util\.ts \(modified\)/);
  assert.match(map, /Approx map size: \d+ tokens\./);
});

test("formatReviewMap: identical input produces byte-identical output across two runs", () => {
  const changed: ChangedFileEntry[] = [
    { path: "src/util.ts", before: `export const a = 1;`, after: `export const a = 1;\nexport const b = 2;` },
  ];
  const files: RepoFileEntry[] = [
    { path: "src/util.ts", content: `export const a = 1;\nexport const b = 2;` },
    { path: "src/consumer.ts", content: `import { a } from "./util";` },
  ];
  const fileIndex = files.map((f) => f.path);
  const graph1 = buildReviewGraph(graphInput({ changed, files, fileIndex }));
  const graph2 = buildReviewGraph(graphInput({ changed, files, fileIndex }));
  assert.equal(formatReviewMap(graph1), formatReviewMap(graph2));
});

test("formatReviewMap includes an unresolved-specifier section only when non-empty", () => {
  const emptyGraph = buildReviewGraph(graphInput({}));
  assert.doesNotMatch(formatReviewMap(emptyGraph), /## Unresolved specifiers/);

  const changed: ChangedFileEntry[] = [{ path: "src/a.ts", before: `export const a = 1;`, after: `export const a = 1;` }];
  const files: RepoFileEntry[] = [{ path: "src/consumer.ts", content: `import "./missing";` }];
  const graph = buildReviewGraph(graphInput({ changed, files, fileIndex: files.map((f) => f.path) }));
  assert.match(formatReviewMap(graph), /## Unresolved specifiers/);
});

// --- fix round: string masking, longest-match, guard depths, sorting, purity ---

test("parseImports: import-shaped text inside single-line string literals produces no edge", () => {
  const source = [
    `const note = "import { x } from './ghost'";`,
    `const other = 'export { y } from "./ghost2"';`,
    `const req = "require('./ghost3')";`,
    `const dyn = "import('./ghost4')";`,
    `import { real } from "./real";`,
  ].join("\n");
  assert.deepEqual(parseImports(source), ["./real"]);
});

test("parseImports: statement-shaped imports inside template literals produce no edge", () => {
  const source = ["const fixture = `", `import { g } from "./ghost";`, `export * from "./ghost5";`, "`;", `import "./real2";`].join("\n");
  assert.deepEqual(parseImports(source), ["./real2"]);
});

test("parseExports: export-shaped text inside string and template literals produces no phantom exports", () => {
  const source = [
    "const fixture = `",
    "export const phantom = 1;",
    "export default phantom;",
    "`;",
    `const s = "export function ghostFn() {}";`,
    "export const real = 2;",
  ].join("\n");
  const surface = parseExports(source);
  assert.deepEqual(surface.named, ["real"]);
  assert.equal(surface.hasDefault, false);
});

test("resolveSpecifier: overlapping workspace package names bind to the longest matching name", () => {
  // Roots deliberately do not nest: a first-match binding through the shorter
  // name would resolve to an existing file under the wrong root.
  const fileIndex = ["packages/pkg/sub/util.ts", "packages/other/util.ts", "packages/other/src/index.ts"];
  const packageIndex: PackageIndex = {
    "@scope/pkg": { root: "packages/pkg" },
    "@scope/pkg/sub": { root: "packages/other" },
  };
  const nested = resolveSpecifier("apps/a.ts", "@scope/pkg/sub/util", fileIndex, packageIndex);
  assert.deepEqual(nested, { kind: "resolved", path: "packages/other/util.ts" });
  const rootHit = resolveSpecifier("apps/a.ts", "@scope/pkg/sub", fileIndex, packageIndex);
  assert.deepEqual(rootHit, { kind: "resolved", path: "packages/other/src/index.ts" });
});

test("buildReviewGraph: depth-2 guards are classified across .spec. and __tests__/ naming", () => {
  const changed: ChangedFileEntry[] = [{ path: "src/core.ts", before: "", after: `export const core = 1;` }];
  const files: RepoFileEntry[] = [
    { path: "src/core.ts", content: `export const core = 1;` },
    { path: "src/mid.ts", content: `import { core } from "./core";` },
    { path: "src/mid.spec.ts", content: `import { core } from "./core";` },
    { path: "__tests__/deep.ts", content: `import "../src/mid";` },
  ];
  const graph = buildReviewGraph(graphInput({ changed, files, fileIndex: files.map((f) => f.path) }));
  const guards = graph.sections[0].guards.map((g) => `${g.path}@${g.depth}`).sort();
  assert.deepEqual(guards, ["__tests__/deep.ts@2", "src/mid.spec.ts@1"]);
});

test("buildReviewGraph: multi-file sections are path-sorted and byte-identical across runs", () => {
  const changed: ChangedFileEntry[] = [
    { path: "src/zebra.ts", before: "", after: `export const z = 1;` },
    { path: "src/alpha.ts", before: "", after: `export const a = 1;` },
    { path: "src/mid.ts", before: "", after: `export const m = 1;` },
  ];
  const files: RepoFileEntry[] = changed.map((c) => ({ path: c.path, content: c.after ?? "" }));
  const input = graphInput({ changed, files, fileIndex: files.map((f) => f.path) });
  const first = formatReviewMap(buildReviewGraph(input));
  const second = formatReviewMap(buildReviewGraph(input));
  assert.equal(first, second);
  assert.deepEqual(
    buildReviewGraph(input).sections.map((s) => s.path),
    ["src/alpha.ts", "src/mid.ts", "src/zebra.ts"],
  );
});

test("purity: the pure core imports no fs, child_process, or process.env", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../lib/review-graph.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /['"]node:fs['"]|['"]fs['"]|['"]node:child_process['"]|['"]child_process['"]|process\.env/);
});

test("resolveSpecifier: emitted-extension specifiers (./x.js style) remap to the source file, never unresolved when the source exists", () => {
  const fileIndex = ["src/app.ts", "src/view.tsx", "src/esm.mts", "src/cjs.cts"];
  assert.deepEqual(resolveSpecifier("src/main.ts", "./app.js", fileIndex), { kind: "resolved", path: "src/app.ts" });
  assert.deepEqual(resolveSpecifier("src/main.ts", "./view.js", fileIndex), { kind: "resolved", path: "src/view.tsx" });
  assert.deepEqual(resolveSpecifier("src/main.ts", "./esm.mjs", fileIndex), { kind: "resolved", path: "src/esm.mts" });
  assert.deepEqual(resolveSpecifier("src/main.ts", "./cjs.cjs", fileIndex), { kind: "resolved", path: "src/cjs.cts" });
  // A real emitted .js on disk still wins over the remap.
  const withJs = ["src/app.js", "src/app.ts"];
  assert.deepEqual(resolveSpecifier("src/main.ts", "./app.js", withJs), { kind: "resolved", path: "src/app.js" });
  // No source counterpart: still unresolved, never guessed.
  assert.equal(resolveSpecifier("src/main.ts", "./ghost.js", fileIndex).kind, "unresolved");
});
