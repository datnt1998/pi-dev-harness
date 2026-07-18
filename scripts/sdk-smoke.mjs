import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = process.env.PI_DEV_HARNESS_PACKAGE_ROOT
  ? resolve(process.env.PI_DEV_HARNESS_PACKAGE_ROOT)
  : sourceRoot;

function piPackageRoot() {
  const candidates = [];
  try {
    candidates.push(dirname(require.resolve("@earendil-works/pi-coding-agent/package.json")));
  } catch {}
  if (process.env.PI_CODING_AGENT_ROOT) candidates.push(process.env.PI_CODING_AGENT_ROOT);
  candidates.push(join(dirname(dirname(process.execPath)), "lib/node_modules/@earendil-works/pi-coding-agent"));
  try {
    candidates.push(join(execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(), "@earendil-works/pi-coding-agent"));
  } catch {}
  const root = candidates.find((candidate) => existsSync(join(candidate, "dist/index.js")));
  if (!root) throw new Error("Cannot resolve Pi SDK. Set PI_CODING_AGENT_ROOT to the @earendil-works/pi-coding-agent package root.");
  return root;
}

const sdk = await import(pathToFileURL(join(piPackageRoot(), "dist/index.js")).href);
const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const required = {
  commands: ["implement-all", "implementation-status", "implement-all-stop"],
  prompts: ["harness-engineering-setup", "implement-batch", "prepare-tickets", "release-check"],
  skills: ["engineering-workflow", "pi-harness", "release-check", "ticket-readiness"],
  tools: ["batch_next", "batch_report"],
};

async function runSmoke(label, agentDir) {
  const cwd = mkdtempSync(join(tmpdir(), `pi-dev-harness-${label}-`));
  const loader = new sdk.DefaultResourceLoader({ cwd, agentDir });
  await loader.reload();
  const { session, extensionsResult } = await sdk.createAgentSession({
    cwd,
    resourceLoader: loader,
    sessionManager: sdk.SessionManager.inMemory(cwd),
    noTools: "builtin",
  });
  try {
    const prompts = loader.getPrompts();
    const skills = loader.getSkills();
    const commands = session.extensionRunner.getRegisteredCommands().map((item) => item.name);
    const tools = session.extensionRunner.getAllRegisteredTools().map((item) => item.definition.name);
    return {
      label,
      extensionErrors: extensionsResult.errors,
      commandDiagnostics: session.extensionRunner.getCommandDiagnostics(),
      promptDiagnostics: prompts.diagnostics,
      skillDiagnostics: skills.diagnostics,
      missingCommands: required.commands.filter((name) => !commands.includes(name)),
      missingPrompts: required.prompts.filter((name) => !prompts.prompts.some((item) => item.name === name)),
      missingSkills: required.skills.filter((name) => !skills.skills.some((item) => item.name === name)),
      missingTools: required.tools.filter((name) => !tools.includes(name)),
      duplicateTools: [...new Set(tools.filter((name, index) => tools.indexOf(name) !== index))],
    };
  } finally {
    session.dispose();
    rmSync(cwd, { recursive: true, force: true });
  }
}

const isolatedRoot = mkdtempSync(join(tmpdir(), "pi-dev-harness-agent-"));
const isolatedAgentDir = join(isolatedRoot, "agent");
mkdirSync(isolatedAgentDir, { recursive: true });
writeFileSync(join(isolatedAgentDir, "settings.json"), JSON.stringify({ packages: [packageRoot] }, null, 2));

try {
  const results = [
    await runSmoke("isolated", isolatedAgentDir),
    await runSmoke("integrated", sdk.getAgentDir()),
  ];
  console.log(JSON.stringify({ package: `${packageJson.name}@${packageJson.version}`, results }, null, 2));
  const failures = results.flatMap((result) => Object.entries(result)
    .filter(([key, value]) => key !== "label" && Array.isArray(value) && value.length > 0)
    .map(([key]) => `${result.label}:${key}`));
  if (failures.length > 0) process.exitCode = 1;
} finally {
  rmSync(isolatedRoot, { recursive: true, force: true });
}
