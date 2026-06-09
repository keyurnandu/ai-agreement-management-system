import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const isWin = platform() === "win32";

function sh(cmd, args, cwd, env = {}) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, ...env },
  });
  if (res.status !== 0) {
    console.error(`\nCommand failed (exit ${res.status}): ${cmd} ${args.join(" ")}`);
    process.exit(res.status ?? 1);
  }
}

const pythonExe = isWin ? "python" : "python3";
const venvPython = (dir) =>
  isWin ? join(dir, ".venv", "Scripts", "python.exe") : join(dir, ".venv", "bin", "python");

function ensureRootEnv() {
  const env = join(ROOT, ".env");
  if (!existsSync(env)) {
    copyFileSync(join(ROOT, ".env.example"), env);
    console.log("Created .env from .env.example");
  }
}

// Next.js + Prisma load .env natively from apps/web. Keep a generated copy there
// derived from the canonical root .env.
function syncWebEnv() {
  const header = "# AUTO-GENERATED from ../../.env by scripts — edit ../../.env instead.\n";
  writeFileSync(join(ROOT, "apps", "web", ".env"), header + readFileSync(join(ROOT, ".env"), "utf8"));
  console.log("Synced apps/web/.env from root .env");
}

function setupPythonService(dir) {
  console.log(`\n--- Python service: ${dir} ---`);
  sh(pythonExe, ["-m", "venv", ".venv"], dir);
  const py = `"${venvPython(dir)}"`;
  sh(py, ["-m", "pip", "install", "--upgrade", "pip", "--quiet"], dir);
  sh(py, ["-m", "pip", "install", "-r", "requirements.txt"], dir);
}

console.log("== contract-platform setup ==");

ensureRootEnv();

// 1) JavaScript workspaces
sh("npm", ["install"], ROOT);

// 2) Web env + database (generate client, create/apply migration, seed users)
syncWebEnv();
sh("npm", ["run", "db:generate", "--workspace", "apps/web"], ROOT);
sh("npm", ["run", "db:migrate", "--workspace", "apps/web", "--", "--name", "init"], ROOT);
sh("npm", ["run", "db:seed", "--workspace", "apps/web"], ROOT);

// 3) Python services
setupPythonService(join(ROOT, "services", "pdf-engine"));
setupPythonService(join(ROOT, "services", "intelligence"));

console.log("\n✓ Setup complete. Start everything with:  npm run dev");
