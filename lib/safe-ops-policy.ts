import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";

function canonicalPath(path: string): string {
  let cursor = resolve(path);
  const suffix: string[] = [];
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) return resolve(path);
    suffix.unshift(basename(cursor));
    cursor = parent;
  }
  try {
    return resolve(realpathSync(cursor), ...suffix);
  } catch {
    return resolve(path);
  }
}

export function isProtectedProjectPath(path: string, cwd: string): boolean {
  const projectRoot = canonicalPath(cwd);
  const lexicalTarget = resolve(cwd, path);
  const lexicalLocal = relative(resolve(cwd), lexicalTarget);
  if (lexicalLocal === "" || lexicalLocal === ".." || lexicalLocal.startsWith(`..${sep}`)) return false;

  const target = canonicalPath(lexicalTarget);
  const localPath = relative(projectRoot, target);
  if (localPath === "" || localPath === ".." || localPath.startsWith(`..${sep}`)) return false;

  return localPath.split(/[\\/]/).some((segment) =>
    segment === ".git" || segment === "node_modules" || segment === ".env" || segment.startsWith(".env."),
  );
}

type Slice = { text: string; next: number };

function commandSubstitution(source: string, start: number): Slice {
  let depth = 1;
  let quote: "single" | "double" | undefined;
  let text = "";
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\" && quote !== "single") {
      text += char + (source[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (char === "'" && quote !== "double") quote = quote === "single" ? undefined : "single";
    else if (char === '"' && quote !== "single") quote = quote === "double" ? undefined : "double";
    else if (!quote && char === "(") depth += 1;
    else if (!quote && char === ")") {
      depth -= 1;
      if (depth === 0) return { text, next: index + 1 };
    }
    text += char;
  }
  return { text, next: source.length };
}

function backtickSubstitution(source: string, start: number): Slice {
  let text = "";
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\") {
      text += char + (source[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (char === "`") return { text, next: index + 1 };
    text += char;
  }
  return { text, next: source.length };
}

/** Remove inert quoted literals while retaining executable substitutions. */
function executableShellText(source: string): string {
  let output = "";
  for (let index = 0; index < source.length;) {
    const char = source[index];
    if (char === "\\") {
      output += " ";
      index += 2;
      continue;
    }
    if (char === "'") {
      index += 1;
      while (index < source.length && source[index] !== "'") index += 1;
      index += 1;
      output += "__quoted__";
      continue;
    }
    if (char === '"') {
      index += 1;
      while (index < source.length && source[index] !== '"') {
        if (source[index] === "\\") {
          index += 2;
          continue;
        }
        if (source[index] === "$" && source[index + 1] === "(") {
          const nested = commandSubstitution(source, index + 2);
          output += `;${executableShellText(nested.text)};`;
          index = nested.next;
          continue;
        }
        if (source[index] === "`") {
          const nested = backtickSubstitution(source, index + 1);
          output += `;${executableShellText(nested.text)};`;
          index = nested.next;
          continue;
        }
        index += 1;
      }
      index += 1;
      output += "__quoted__";
      continue;
    }
    if (char === "$" && source[index + 1] === "(") {
      const nested = commandSubstitution(source, index + 2);
      output += `;${executableShellText(nested.text)};`;
      index = nested.next;
      continue;
    }
    if (char === "`") {
      const nested = backtickSubstitution(source, index + 1);
      output += `;${executableShellText(nested.text)};`;
      index = nested.next;
      continue;
    }
    output += char;
    index += 1;
  }

  // Quoted payloads passed to a nested shell are executable, not inert text.
  for (const match of source.matchAll(/\b(?:ba|z|)sh\s+(?:-\S+\s+)*-c\s+(['"])([\s\S]*?)\1/g)) {
    output += `;${executableShellText(match[2])};`;
  }
  return output;
}

export function isDestructiveCommand(command: string): boolean {
  const source = executableShellText(command);
  const boundary = "(?:^|&&|\\|\\||[;\\n|()`])\\s*";
  const wrappers = "(?:(?:sudo(?:\\s+-\\S+)*|env(?:\\s+(?:-\\S+|[A-Za-z_][A-Za-z0-9_]*=\\S+))*|command|nohup)\\s+)*";
  const gitOptions = "(?:\\s+(?:-C\\s+\\S+|-c\\s+\\S+|--[A-Za-z0-9-]+(?:=\\S+)?))*";
  const beforeNext = "(?:(?!&&|\\|\\||[;\\n|()`])[\\s\\S])*";

  return [
    new RegExp(`${boundary}${wrappers}(?:xargs(?:\\s+-\\S+)*\\s+)?rm\\b(?=${beforeNext}(?:\\s--recursive\\b|\\s-[a-z]*r[a-z]*\\b))`, "i"),
    new RegExp(`${boundary}${wrappers}git${gitOptions}\\s+reset\\b(?=${beforeNext}\\s--hard\\b)`, "i"),
    new RegExp(`${boundary}${wrappers}git${gitOptions}\\s+clean\\b(?=${beforeNext}(?:\\s--force\\b|\\s-[a-z]*f[a-z]*\\b))`, "i"),
    new RegExp(`${boundary}${wrappers}git${gitOptions}\\s+push\\b(?=${beforeNext}(?:\\s--force(?:-with-lease)?\\b|\\s-f\\b))`, "i"),
  ].some((pattern) => pattern.test(source));
}
