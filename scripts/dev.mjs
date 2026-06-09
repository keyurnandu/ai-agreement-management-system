import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { platform } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const isWin = platform() === "win32";

const venvPython = (dir) =>
  isWin ? join(dir, ".venv", "Scripts", "python.exe") : join(dir, ".venv", "bin", "python");

const C = { web: "\x1b[34m", pdf: "\x1b[32m", ai: "\x1b[35m", dim: "\x1b[90m", reset: "\x1b[0m" };

function syncWebEnv() {
  const rootEnv = join(ROOT, ".env");
  if (!existsSync(rootEnv)) {
    console.error("Missing .env at repo root. Run `npm run setup` first.");
    process.exit(1);
  }
  const header = "# AUTO-GENERATED from ../../.env by scripts — edit ../../.env instead.\n";
  writeFileSync(join(ROOT, "apps", "web", ".env"), header + readFileSync(rootEnv, "utf8"));
}

const pdfDir = join(ROOT, "services", "pdf-engine");
const aiDir = join(ROOT, "services", "intelligence");

function ensureVenv(dir) {
  if (!existsSync(venvPython(dir))) {
    console.error(`Missing Python venv in ${dir}. Run \`npm run setup\` first.`);
    process.exit(1);
  }
}

function run(name, cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, shell: true, env: { ...process.env } });
  const prefix = `${C[name] ?? ""}[${name}]${C.reset} `;
  const pipe = (stream, out) =>
    stream.on("data", (d) => {
      for (const line of d.toString().split(/\r?\n/)) {
        if (line.trim()) out.write(prefix + line + "\n");
      }
    });
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => process.stdout.write(`${prefix}${C.dim}exited (${code})${C.reset}\n`));
  return child;
}

syncWebEnv();
ensureVenv(pdfDir);
ensureVenv(aiDir);

console.log(`${C.dim}Starting web (3000), pdf-engine (8001), intelligence (8002)… Ctrl+C to stop.${C.reset}`);

const children = [
  run("web", "npm", ["run", "dev", "--workspace", "apps/web"], ROOT),
  run("pdf", `"${venvPython(pdfDir)}"`, ["-m", "uvicorn", "app.main:app", "--port", "8001", "--reload"], pdfDir),
  run("ai", `"${venvPython(aiDir)}"`, ["-m", "uvicorn", "app.main:app", "--port", "8002", "--reload"], aiDir),
];

function shutdown() {
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* ignore */
    }
  }
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
