/**
 * Review graph core (pure, dependency-free): a deterministic navigation map
 * generator over a change set (spec `docs/specs/review-graph.md`, R1).
 *
 * Given changed files (with before/after content), all candidate repo files
 * with their content, and a file index, this module extracts import/export
 * edges with plain-text scanning (comment stripping, no AST, no execution),
 * resolves relative and workspace-package specifiers against the provided
 * indexes, and builds a per-changed-file map: export-surface delta, direct
 * (depth-1) and depth-2-capped dependents, guard files (test dependents),
 * and a deduplicated unresolved-specifier list. `formatReviewMap` renders a
 * deterministic, path-sorted markdown block.
 *
 * No fs, no child_process, no environment reads: every fact this module
 * needs is passed in by the caller (`extensions/review-graph.ts`).
 */
import { posix } from "node:path";

const { dirname: posixDirname, join: posixJoin, normalize: posixNormalize, extname: posixExtname } = posix;

/** Source extensions probed for extensionless/relative specifiers and package-root/index resolution. */
export const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"] as const;

/** Depth-2 dependents beyond this count per changed file are truncated and marked capped. */
export const DEPTH2_DEPENDENT_CAP = 50;

const GUARD_PATH_RE = /(\.test\.|\.spec\.|__tests__\/)/;

// --- Comment/string-aware source scanning ---

/**
 * Strip `//` and `/* *\/` comments while leaving string and template literal
 * contents untouched, so `//` inside a template literal (e.g. a URL) is
 * never mistaken for a comment start. Approximate (no full lexer): good
 * enough for deterministic specifier extraction, not a TS parser.
 */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];
    if (c === "/" && c2 === "/") {
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : "";
        i += 1;
      }
      i += 2;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      out += c;
      i += 1;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") {
          out += source[i] + (source[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += source[i];
        i += 1;
      }
      if (i < n) {
        out += source[i];
        i += 1;
      }
      continue;
    }
    if (c === "`") {
      out += c;
      i += 1;
      while (i < n) {
        if (source[i] === "\\") {
          out += source[i] + (source[i + 1] ?? "");
          i += 2;
          continue;
        }
        if (source[i] === "`") {
          out += source[i];
          i += 1;
          break;
        }
        out += source[i];
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * Index ranges (inclusive start, exclusive end) of string and template
 * literals in comment-stripped source. Keyword matches whose index falls
 * inside one of these ranges are literal text, not statements, and must
 * not produce edges or export names.
 */
function stringRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      const start = i;
      i += 1;
      while (i < n) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === quote) {
          i += 1;
          break;
        }
        if (quote !== "`" && text[i] === "\n") break;
        i += 1;
      }
      ranges.push([start, i]);
      continue;
    }
    i += 1;
  }
  return ranges;
}

function insideRanges(ranges: ReadonlyArray<[number, number]>, index: number): boolean {
  for (const [start, end] of ranges) {
    if (index >= start && index < end) return true;
    if (start > index) break;
  }
  return false;
}

// --- R1: parseImports ---

const IMPORT_FROM_RE = /\bimport\b(?!\s*\()[^'"`]*?\bfrom\s*(['"])([^'"]+)\1/g;
const IMPORT_BARE_RE = /\bimport\s*(['"])([^'"]+)\1/g;
const EXPORT_FROM_RE = /\bexport\b[^'"`]*?\bfrom\s*(['"])([^'"]+)\1/g;
const REQUIRE_RE = /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;

/**
 * Extract import/require/export-from/dynamic-import specifiers from source
 * text without executing it. Comments are stripped first, then keyword
 * matches that start inside a string or template literal are rejected: a
 * literal containing import-shaped text produces no edge (R1).
 */
export function parseImports(source: string): string[] {
  const stripped = stripComments(source);
  const ranges = stringRanges(stripped);
  const seen: string[] = [];
  const add = (specifier: string) => {
    if (!seen.includes(specifier)) seen.push(specifier);
  };
  for (const re of [IMPORT_FROM_RE, IMPORT_BARE_RE, EXPORT_FROM_RE, REQUIRE_RE, DYNAMIC_IMPORT_RE]) {
    re.lastIndex = 0;
    for (const match of stripped.matchAll(re)) {
      if (insideRanges(ranges, match.index ?? 0)) continue;
      add(match[2]);
    }
  }
  return seen;
}

// --- R1: parseExports ---

export type ExportSurface = {
  /** Locally declared and bare-re-exported (`export { a }`) public names. */
  named: string[];
  /** Names re-exported through an `export ... from '...'` clause. */
  reExported: string[];
  hasDefault: boolean;
};

const NAMED_DECL_RE =
  /\bexport\s+(?!default\b)(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|(?:abstract\s+)?class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g;
const DEFAULT_RE = /\bexport\s+default\b/;
const BRACE_EXPORT_RE = /\bexport\s+(?:type\s+)?\{([^}]*)\}\s*(?:from\s*(['"])([^'"]+)\2)?/g;
const STAR_REEXPORT_RE = /\bexport\s*\*\s*(?:as\s+([A-Za-z_$][\w$]*)\s*)?from\s*(['"])([^'"]+)\2/g;

function parseSpecifierList(list: string): string[] {
  return list
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      const withoutType = entry.replace(/^type\s+/, "");
      const asMatch = withoutType.match(/^(.+?)\s+as\s+(.+)$/);
      return (asMatch ? asMatch[2] : withoutType).trim();
    })
    .filter((name) => name.length > 0);
}

/**
 * Extract the named export surface: local declaration names, bare
 * re-exported names, from-clause re-exported names, and a default-export
 * flag (R1).
 */
export function parseExports(source: string): ExportSurface {
  const stripped = stripComments(source);
  const ranges = stringRanges(stripped);
  const named: string[] = [];
  const reExported: string[] = [];
  const addNamed = (name: string) => {
    if (!named.includes(name)) named.push(name);
  };
  const addReExported = (name: string) => {
    if (!reExported.includes(name)) reExported.push(name);
  };

  NAMED_DECL_RE.lastIndex = 0;
  for (const match of stripped.matchAll(NAMED_DECL_RE)) {
    if (insideRanges(ranges, match.index ?? 0)) continue;
    addNamed(match[1]);
  }

  BRACE_EXPORT_RE.lastIndex = 0;
  for (const match of stripped.matchAll(BRACE_EXPORT_RE)) {
    if (insideRanges(ranges, match.index ?? 0)) continue;
    const names = parseSpecifierList(match[1]);
    if (match[2] !== undefined) names.forEach(addReExported);
    else names.forEach(addNamed);
  }

  STAR_REEXPORT_RE.lastIndex = 0;
  for (const match of stripped.matchAll(STAR_REEXPORT_RE)) {
    if (insideRanges(ranges, match.index ?? 0)) continue;
    if (match[1]) addReExported(match[1]);
  }

  let hasDefault = false;
  const defaultRe = new RegExp(DEFAULT_RE.source, "g");
  for (const match of stripped.matchAll(defaultRe)) {
    if (insideRanges(ranges, match.index ?? 0)) continue;
    hasDefault = true;
    break;
  }

  return { named, reExported, hasDefault };
}

// --- R1: resolveSpecifier ---

export type PackageIndexEntry = {
  root: string;
  main?: string;
  module?: string;
};

/** Workspace package name -> package root (and optional manifest main/module hints). */
export type PackageIndex = Record<string, PackageIndexEntry>;

export type ResolvedSpecifier =
  | { kind: "resolved"; path: string }
  | { kind: "external" }
  | { kind: "unresolved" };

function isSourceExt(ext: string): boolean {
  return (SOURCE_EXTENSIONS as readonly string[]).includes(ext);
}

function probeFile(basePath: string, fileSet: ReadonlySet<string>): string | undefined {
  if (fileSet.has(basePath)) return basePath;
  for (const ext of SOURCE_EXTENSIONS) {
    const candidate = `${basePath}${ext}`;
    if (fileSet.has(candidate)) return candidate;
  }
  for (const ext of SOURCE_EXTENSIONS) {
    const candidate = posixJoin(basePath, `index${ext}`);
    if (fileSet.has(candidate)) return candidate;
  }
  return undefined;
}

function probeHint(root: string, hint: string | undefined, fileSet: ReadonlySet<string>): string | undefined {
  if (!hint) return undefined;
  const candidate = posixNormalize(posixJoin(root, hint));
  if (fileSet.has(candidate)) return candidate;
  return probeFile(candidate, fileSet);
}

function probePackageRoot(entry: PackageIndexEntry, fileSet: ReadonlySet<string>): string | undefined {
  return (
    probeHint(entry.root, entry.main, fileSet) ??
    probeHint(entry.root, entry.module, fileSet) ??
    probeFile(posixJoin(entry.root, "src", "index"), fileSet) ??
    probeFile(posixJoin(entry.root, "index"), fileSet)
  );
}

function matchPackage(specifier: string, packageIndex: PackageIndex): { entry: PackageIndexEntry; subpath?: string } | undefined {
  const direct = packageIndex[specifier];
  if (direct) return { entry: direct };
  const names = Object.keys(packageIndex).sort((a, b) => b.length - a.length);
  for (const name of names) {
    const prefix = `${name}/`;
    if (specifier.startsWith(prefix)) return { entry: packageIndex[name], subpath: specifier.slice(prefix.length) };
  }
  return undefined;
}

/**
 * Resolve a specifier from `fromPath` to a repo path. Relative specifiers
 * probe `fileIndex` (extension + `/index.*` probing); bare specifiers probe
 * `packageIndex` (workspace package root or subpath probing). A relative
 * specifier with a non-source explicit extension classifies as external
 * (asset), never unresolved. Unresolved is recorded, never guessed (R1).
 */
export function resolveSpecifier(
  fromPath: string,
  specifier: string,
  fileIndex: readonly string[],
  packageIndex: PackageIndex = {},
): ResolvedSpecifier {
  const fileSet = new Set(fileIndex);

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const basePath = posixNormalize(posixJoin(posixDirname(fromPath), specifier));
    const explicitExt = posixExtname(specifier);
    if (explicitExt) {
      if (!isSourceExt(explicitExt)) return { kind: "external" };
      return fileSet.has(basePath) ? { kind: "resolved", path: basePath } : { kind: "unresolved" };
    }
    const resolved = probeFile(basePath, fileSet);
    return resolved ? { kind: "resolved", path: resolved } : { kind: "unresolved" };
  }

  if (specifier.startsWith("/")) return { kind: "unresolved" };

  if (Object.keys(packageIndex).length === 0) return { kind: "external" };

  const matched = matchPackage(specifier, packageIndex);
  if (!matched) return { kind: "external" };

  const resolved = matched.subpath
    ? probeFile(posixNormalize(posixJoin(matched.entry.root, matched.subpath)), fileSet)
    : probePackageRoot(matched.entry, fileSet);
  return resolved ? { kind: "resolved", path: resolved } : { kind: "unresolved" };
}

// --- R1: buildReviewGraph ---

export type ChangedFileEntry = {
  path: string;
  /** Content before the change; absent for a newly added file. */
  before?: string;
  /** Content after the change; absent for a deleted file. */
  after?: string;
};

/** A candidate repo file available for importer scanning and resolution. */
export type RepoFileEntry = {
  path: string;
  content: string;
};

export type ReviewGraphInput = {
  changed: ChangedFileEntry[];
  /** All candidate repo files (with content) scanned for import/export edges. */
  files: RepoFileEntry[];
  /** Every known repo path, used for specifier resolution existence checks. */
  fileIndex: readonly string[];
  packageIndex?: PackageIndex;
};

export type ExportDelta = {
  added: string[];
  removed: string[];
};

export type GuardEntry = {
  path: string;
  depth: 1 | 2;
};

export type ReviewMapSection = {
  path: string;
  status: "added" | "modified" | "deleted";
  exportDelta: ExportDelta;
  directDependents: string[];
  depth2Dependents: string[];
  depth2Capped: boolean;
  guards: GuardEntry[];
};

export type UnresolvedEntry = {
  specifier: string;
  from: string[];
};

export type ReviewGraph = {
  sections: ReviewMapSection[];
  unresolved: UnresolvedEntry[];
};

function exportSurfaceNames(source: string | undefined): Set<string> {
  if (source === undefined) return new Set();
  const surface = parseExports(source);
  return new Set([...surface.named, ...surface.reExported]);
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

/**
 * Build the review graph: per changed file, export delta, depth-1/depth-2
 * dependents (capped), guard files, and a deduplicated unresolved-specifier
 * list. Depth is computed by two fixed reverse-adjacency lookups (never a
 * recursive walk), so circular import pairs terminate without looping (R1).
 */
export function buildReviewGraph(input: ReviewGraphInput): ReviewGraph {
  const fileSet = input.fileIndex;
  const packageIndex = input.packageIndex ?? {};

  // importer -> resolved target paths (deduplicated)
  const forwardEdges = new Map<string, Set<string>>();
  // target -> importer paths
  const reverseEdges = new Map<string, Set<string>>();
  const unresolvedMap = new Map<string, Set<string>>();

  for (const file of input.files) {
    const specifiers = parseImports(file.content);
    const targets = new Set<string>();
    for (const specifier of specifiers) {
      const resolved = resolveSpecifier(file.path, specifier, fileSet, packageIndex);
      if (resolved.kind === "resolved") {
        targets.add(resolved.path);
      } else if (resolved.kind === "unresolved") {
        const froms = unresolvedMap.get(specifier) ?? new Set<string>();
        froms.add(file.path);
        unresolvedMap.set(specifier, froms);
      }
    }
    forwardEdges.set(file.path, targets);
    for (const target of targets) {
      const importers = reverseEdges.get(target) ?? new Set<string>();
      importers.add(file.path);
      reverseEdges.set(target, importers);
    }
  }

  const sections: ReviewMapSection[] = input.changed.map((entry) => {
    const status: ReviewMapSection["status"] = entry.before === undefined ? "added" : entry.after === undefined ? "deleted" : "modified";

    const beforeSurface = exportSurfaceNames(entry.before);
    const afterSurface = exportSurfaceNames(entry.after);
    const added = sortedUnique([...afterSurface].filter((name) => !beforeSurface.has(name)));
    const removed = sortedUnique([...beforeSurface].filter((name) => !afterSurface.has(name)));

    const depth1Set = new Set(reverseEdges.get(entry.path) ?? []);
    const depth2Candidates = new Set<string>();
    for (const dependent of depth1Set) {
      for (const grandDependent of reverseEdges.get(dependent) ?? []) {
        if (grandDependent === entry.path) continue;
        if (depth1Set.has(grandDependent)) continue;
        depth2Candidates.add(grandDependent);
      }
    }
    const depth2Sorted = sortedUnique(depth2Candidates);
    const depth2Capped = depth2Sorted.length > DEPTH2_DEPENDENT_CAP;
    const depth2Dependents = depth2Capped ? depth2Sorted.slice(0, DEPTH2_DEPENDENT_CAP) : depth2Sorted;

    const guards: GuardEntry[] = [
      ...sortedUnique(depth1Set)
        .filter((path) => GUARD_PATH_RE.test(path))
        .map((path): GuardEntry => ({ path, depth: 1 })),
      ...depth2Dependents
        .filter((path) => GUARD_PATH_RE.test(path))
        .map((path): GuardEntry => ({ path, depth: 2 })),
    ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

    return {
      path: entry.path,
      status,
      exportDelta: { added, removed },
      directDependents: sortedUnique(depth1Set),
      depth2Dependents,
      depth2Capped,
      guards,
    };
  });

  sections.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const unresolved: UnresolvedEntry[] = [...unresolvedMap.entries()]
    .map(([specifier, from]) => ({ specifier, from: sortedUnique(from) }))
    .sort((a, b) => (a.specifier < b.specifier ? -1 : a.specifier > b.specifier ? 1 : 0));

  return { sections, unresolved };
}

// --- R1: formatReviewMap ---

function tableRow(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

function dependentsTable(title: string, paths: string[], depth2Capped: boolean): string[] {
  if (paths.length === 0) return [`${title}: none`];
  const lines = [`${title}:`, tableRow(["path"]), tableRow(["---"]), ...paths.map((path) => tableRow([path]))];
  if (depth2Capped) lines.push(`(capped at ${DEPTH2_DEPENDENT_CAP})`);
  return lines;
}

/**
 * Render a deterministic, path-sorted markdown review map: a blast-radius
 * summary line, one section per changed file, an unresolved-specifier
 * section when non-empty, and a trailing approximate token size of the map
 * itself (R1).
 */
export function formatReviewMap(graph: ReviewGraph): string {
  const dependentPaths = new Set<string>();
  const guardPaths = new Set<string>();
  for (const section of graph.sections) {
    for (const path of section.directDependents) dependentPaths.add(path);
    for (const path of section.depth2Dependents) dependentPaths.add(path);
    for (const guard of section.guards) guardPaths.add(guard.path);
  }

  const lines: string[] = [];
  lines.push("# Review map");
  lines.push("");
  lines.push(
    `Summary: ${graph.sections.length} changed file(s), ${dependentPaths.size} dependent(s), ${guardPaths.size} guard(s).`,
  );

  for (const section of graph.sections) {
    lines.push("");
    lines.push(`## ${section.path} (${section.status})`);
    lines.push("");
    lines.push(tableRow(["export delta", "names"]));
    lines.push(tableRow(["---", "---"]));
    lines.push(tableRow(["added", section.exportDelta.added.length > 0 ? section.exportDelta.added.join(", ") : "none"]));
    lines.push(tableRow(["removed", section.exportDelta.removed.length > 0 ? section.exportDelta.removed.join(", ") : "none"]));
    lines.push("");
    lines.push(...dependentsTable("Direct dependents", section.directDependents, false));
    lines.push("");
    lines.push(...dependentsTable("Depth-2 dependents", section.depth2Dependents, section.depth2Capped));
    lines.push("");
    if (section.guards.length === 0) {
      lines.push("Guards: none");
    } else {
      lines.push("Guards:");
      lines.push(tableRow(["path", "depth"]));
      lines.push(tableRow(["---", "---"]));
      for (const guard of section.guards) lines.push(tableRow([guard.path, String(guard.depth)]));
    }
  }

  if (graph.unresolved.length > 0) {
    lines.push("");
    lines.push("## Unresolved specifiers");
    lines.push("");
    lines.push(tableRow(["specifier", "from"]));
    lines.push(tableRow(["---", "---"]));
    for (const entry of graph.unresolved) lines.push(tableRow([entry.specifier, entry.from.join(", ")]));
  }

  const bodyLength = lines.join("\n").length;
  const approxTokens = Math.ceil(bodyLength / 4);
  lines.push("");
  lines.push(`Approx map size: ${approxTokens} tokens.`);

  return lines.join("\n");
}
