import { createHash } from "node:crypto";

export type ReadinessStatus = "READY" | "AUTO_FIXED" | "NEEDS_DECISION" | "BLOCKED";

export type Ticket = {
  id: string;
  order: number;
  title: string;
  goal?: string;
  scope?: string;
  workingDirectory?: string;
  nonGoals?: string;
  dependencies: string[];
  acceptanceCriteria: string[];
  validation: string[];
  risks?: string;
  doneWhen: string[];
  raw: string;
};

export type ClassifiedTicket = Ticket & {
  status: ReadinessStatus;
  issues: string[];
  autoFixes: string[];
};

export type BatchAnalysis = {
  tickets: ClassifiedTicket[];
  order: string[];
  cycles: string[][];
  fingerprint: string;
  summary: Record<ReadinessStatus, number>;
  warnings: string[];
};

export type ReadinessOptions = {
  repoScripts?: string[];
};

const HEADING = /^ {0,3}##\s+(T[\w.-]+)\s*[—–\-:]\s+(.+?)\s*$/;
const FIELD =
  /^(goal|scope|working directory|non-goals|dependencies|acceptance criteria|validation|risks|done when)\s*:\s*(.*)$/i;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const CHECK_WORDS = /\b(test|tests|build|lint|typecheck|type-check|type check|coverage|e2e)\b/i;
const VAGUE_ONLY = /^(works?|done|good|nice|clean|better|improved?|correctly?|properly)\.?$/i;

function normalizeSource(markdown: string): string {
  const withoutHeader = markdown.replace(/<!--\s*execution-manifest[\s\S]*?-->\s*/gi, "");
  return withoutHeader
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .trim();
}

export function fingerprint(markdown: string): string {
  return createHash("sha256").update(normalizeSource(markdown), "utf8").digest("hex");
}

function extractDependencies(text: string): string[] {
  if (!text || /\bnone\b/i.test(text)) return [];
  const matches = text.match(/T[\w.-]+/g);
  if (!matches) return [];
  return Array.from(new Set(matches));
}

function collectValues(lines: string[]): string[] {
  const values: string[] = [];
  for (const line of lines) {
    const bullet = line.match(BULLET);
    if (bullet) {
      const value = bullet[1].trim();
      if (value) values.push(value);
      continue;
    }
    const trimmed = line.trim();
    if (trimmed) values.push(trimmed);
  }
  return values;
}

export function findUnparsedHeadings(markdown: string): string[] {
  const lines = normalizeSource(markdown).split("\n");
  const unparsed: string[] = [];
  for (const line of lines) {
    if (/^ {0,3}##\s+/.test(line) && !HEADING.test(line)) unparsed.push(line.trim());
  }
  return unparsed;
}

export function parseTickets(markdown: string): Ticket[] {
  const lines = normalizeSource(markdown).split("\n");
  const tickets: Ticket[] = [];

  let current: { id: string; title: string; body: string[] } | undefined;
  const flush = () => {
    if (!current) return;
    tickets.push(buildTicket(current.id, current.title, current.body, tickets.length + 1));
    current = undefined;
  };

  for (const line of lines) {
    const heading = line.match(HEADING);
    if (heading) {
      flush();
      current = { id: heading[1], title: heading[2].trim(), body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  flush();
  return tickets;
}

function buildTicket(id: string, title: string, body: string[], order: number): Ticket {
  const fields: Record<string, string[]> = {};
  let activeField: string | undefined;

  for (const line of body) {
    const field = line.match(FIELD);
    if (field) {
      const key = field[1].toLowerCase();
      activeField = key;
      fields[key] = fields[key] ?? [];
      const inline = field[2].trim();
      if (inline) fields[key].push(inline);
      continue;
    }
    if (activeField) {
      fields[activeField] = fields[activeField] ?? [];
      fields[activeField].push(line);
      continue;
    }
  }

  const scalar = (key: string): string | undefined => {
    const raw = fields[key];
    if (!raw) return undefined;
    const values = collectValues(raw);
    return values.length ? values.join(" ") : undefined;
  };
  const list = (key: string): string[] => (fields[key] ? collectValues(fields[key]) : []);

  return {
    id,
    order,
    title,
    goal: scalar("goal"),
    scope: scalar("scope"),
    workingDirectory: scalar("working directory"),
    nonGoals: scalar("non-goals"),
    dependencies: extractDependencies((fields["dependencies"] ?? []).join(" ")),
    acceptanceCriteria: list("acceptance criteria"),
    validation: list("validation"),
    risks: scalar("risks"),
    doneWhen: list("done when"),
    raw: [`## ${id} — ${title}`, ...body].join("\n").trim(),
  };
}

function escalate(current: ReadinessStatus, next: ReadinessStatus): ReadinessStatus {
  const rank: Record<ReadinessStatus, number> = {
    READY: 0,
    AUTO_FIXED: 1,
    NEEDS_DECISION: 2,
    BLOCKED: 3,
  };
  return rank[next] > rank[current] ? next : current;
}

export function classifyTicket(ticket: Ticket, options: ReadinessOptions = {}): ClassifiedTicket {
  const issues: string[] = [];
  const autoFixes: string[] = [];
  let status: ReadinessStatus = "READY";
  const fixed: Ticket = { ...ticket, validation: [...ticket.validation], doneWhen: [...ticket.doneWhen] };

  if (!ticket.goal) {
    issues.push("Missing Goal (intent required).");
    status = escalate(status, "NEEDS_DECISION");
  }
  if (!ticket.scope) {
    issues.push("Missing Scope (intent required).");
    status = escalate(status, "NEEDS_DECISION");
  }
  if (ticket.acceptanceCriteria.length === 0) {
    issues.push("Missing Acceptance criteria (intent required).");
    status = escalate(status, "NEEDS_DECISION");
  } else {
    const vague = ticket.acceptanceCriteria.filter((c) => VAGUE_ONLY.test(c.trim()));
    if (vague.length === ticket.acceptanceCriteria.length) {
      issues.push("Acceptance criteria are not measurable; specify observable outcomes.");
      status = escalate(status, "NEEDS_DECISION");
    } else if (vague.length > 0) {
      issues.push(`Some acceptance criteria are vague: ${vague.join("; ")}`);
    }
  }

  if (ticket.validation.length === 0) {
    const referencesCheck = CHECK_WORDS.test(`${ticket.raw}`);
    const script = pickScript(options.repoScripts, ticket.raw);
    if (referencesCheck && script) {
      fixed.validation = [script];
      autoFixes.push(`Filled Validation from repo script: ${script}`);
      status = escalate(status, "AUTO_FIXED");
    } else {
      issues.push("Missing Validation and no unambiguous repo script to fill it.");
      status = escalate(status, "NEEDS_DECISION");
    }
  }

  if (ticket.doneWhen.length === 0) {
    if (fixed.acceptanceCriteria.length > 0) {
      fixed.doneWhen = ["All acceptance criteria pass."];
      autoFixes.push("Derived Done when from acceptance criteria.");
      status = escalate(status, "AUTO_FIXED");
    } else {
      issues.push("Missing Done when.");
      status = escalate(status, "NEEDS_DECISION");
    }
  }

  return { ...fixed, status, issues, autoFixes };
}

function pickScript(scripts: string[] | undefined, raw: string): string | undefined {
  if (!scripts || scripts.length === 0) return undefined;
  const lowered = raw.toLowerCase();
  const preferred = ["test", "typecheck", "lint", "build"];
  for (const key of preferred) {
    if (lowered.includes(key)) {
      const match = scripts.find((s) => s.toLowerCase().includes(key));
      if (match) return match;
    }
  }
  return undefined;
}

export function topoOrder(tickets: Ticket[]): { order: string[]; cycles: string[][] } {
  const ids = tickets.map((t) => t.id);
  const idSet = new Set(ids);
  const indegree = new Map<string, number>();
  const edges = new Map<string, string[]>();

  for (const id of ids) {
    indegree.set(id, 0);
    edges.set(id, []);
  }
  for (const ticket of tickets) {
    for (const dep of ticket.dependencies) {
      if (!idSet.has(dep) || dep === ticket.id) continue;
      edges.get(dep)!.push(ticket.id);
      indegree.set(ticket.id, (indegree.get(ticket.id) ?? 0) + 1);
    }
  }

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0).sort(compareIds);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of (edges.get(id) ?? []).sort(compareIds)) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if ((indegree.get(next) ?? 0) === 0) {
        queue.push(next);
        queue.sort(compareIds);
      }
    }
  }

  const cycles = order.length === ids.length ? [] : findCycles(tickets, new Set(order));
  return { order, cycles };
}

function findCycles(tickets: Ticket[], resolved: Set<string>): string[][] {
  const remaining = tickets.filter((t) => !resolved.has(t.id)).map((t) => t.id);
  return remaining.length ? [remaining.sort(compareIds)] : [];
}

function compareIds(a: string, b: string): number {
  const na = Number(a.replace(/^T/i, ""));
  const nb = Number(b.replace(/^T/i, ""));
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}

export function analyzeBatch(markdown: string, options: ReadinessOptions = {}): BatchAnalysis {
  const tickets = parseTickets(markdown);
  const idSet = new Set(tickets.map((t) => t.id));
  const { order, cycles } = topoOrder(tickets);
  const cyclic = new Set(cycles.flat());

  const classified = tickets.map((ticket) => {
    const base = classifyTicket(ticket, options);
    const issues = [...base.issues];
    let status = base.status;

    for (const dep of ticket.dependencies) {
      if (!idSet.has(dep)) {
        issues.push(`Unknown dependency: ${dep}`);
        status = escalate(status, "BLOCKED");
      } else if (dep === ticket.id) {
        issues.push("Ticket depends on itself.");
        status = escalate(status, "BLOCKED");
      }
    }
    if (cyclic.has(ticket.id)) {
      issues.push(`Cyclic dependency involving: ${cycles.flat().join(", ")}`);
      status = escalate(status, "BLOCKED");
    }

    return { ...base, issues, status };
  });

  // A ticket cannot become runnable by dropping a gated prerequisite. Propagate
  // dependency gating transitively while preserving independent runnable work.
  let dependencyChanged = true;
  while (dependencyChanged) {
    dependencyChanged = false;
    const byId = new Map(classified.map((ticket) => [ticket.id, ticket]));
    for (const ticket of classified) {
      if (!isRunnable(ticket.status)) continue;
      const gatedDependency = ticket.dependencies
        .map((id) => byId.get(id))
        .find((dependency) => dependency && !isRunnable(dependency.status));
      if (!gatedDependency) continue;
      ticket.status = "BLOCKED";
      ticket.issues.push(`Dependency is not runnable: ${gatedDependency.id} (${gatedDependency.status}).`);
      dependencyChanged = true;
    }
  }

  const summary: Record<ReadinessStatus, number> = {
    READY: 0,
    AUTO_FIXED: 0,
    NEEDS_DECISION: 0,
    BLOCKED: 0,
  };
  for (const ticket of classified) summary[ticket.status] += 1;

  const unparsed = findUnparsedHeadings(markdown);
  const warnings = unparsed.map(
    (heading) => `Unparsed heading skipped (expected "## T<id> — <title>"): ${heading}`,
  );
  if (tickets.length === 0) warnings.push("No parseable tickets found.");

  return {
    tickets: classified,
    order: order.length ? order : tickets.map((t) => t.id),
    cycles,
    fingerprint: fingerprint(markdown),
    summary,
    warnings,
  };
}

export function isRunnable(status: ReadinessStatus): boolean {
  return status === "READY" || status === "AUTO_FIXED";
}
