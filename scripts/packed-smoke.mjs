import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync(join(tmpdir(), "pi-dev-harness-packed-"));
const installRoot = join(temp, "install");

try {
  const filename = execFileSync("npm", ["pack", "--silent", "--pack-destination", temp], {
    cwd: root,
    encoding: "utf8",
  }).trim().split(/\r?\n/).at(-1);
  if (!filename) throw new Error("npm pack did not return a tarball name");
  execFileSync("npm", ["install", "--prefix", installRoot, "--ignore-scripts", "--no-package-lock", "--omit=peer", join(temp, filename)], {
    stdio: "pipe",
  });
  const installed = join(installRoot, "node_modules/pi-dev-harness");
  execFileSync(process.execPath, [join(root, "scripts/sdk-smoke.mjs")], {
    env: { ...process.env, PI_DEV_HARNESS_PACKAGE_ROOT: installed },
    stdio: "inherit",
  });
} finally {
  rmSync(temp, { recursive: true, force: true });
}
