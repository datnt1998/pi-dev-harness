const SOURCE_HEADER = /<!--\s*execution-manifest[^>]*\bsource=(?:"([^"]+)"|'([^']+)'|(\S+))/i;

export function parseImplementArgs(args: string): { path?: string; commit: boolean } {
  const commit = /(?:^|\s)--commit(?:\s|$)/.test(args);
  let path = args.replace(/(?:^|\s)--commit(?=\s|$)/g, " ").trim();
  if ((path.startsWith('"') && path.endsWith('"')) || (path.startsWith("'") && path.endsWith("'"))) {
    path = path.slice(1, -1).trim();
  }
  return { path: path || undefined, commit };
}

export function manifestSource(raw: string): string | undefined {
  const match = raw.match(SOURCE_HEADER);
  return match?.slice(1).find((value): value is string => typeof value === "string" && value.length > 0);
}
