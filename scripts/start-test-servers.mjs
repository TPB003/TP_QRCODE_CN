import { spawn } from "node:child_process";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const children = [];
let shuttingDown = false;

function start(args, envOverrides = {}) {
  const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npm";
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", `npm ${args.join(" ")}`] : args;
  const child = spawn(command, commandArgs, {
    cwd: root,
    env: { ...process.env, ...envOverrides },
    stdio: "inherit",
    windowsHide: true,
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const exitCode = typeof code === "number" ? code : signal ? 1 : 0;
    void shutdown(exitCode);
  });
  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(error);
    shuttingDown = true;
    void shutdown(1);
  });
  return child;
}

async function waitFor(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // The API is still starting its local SQLite runtime.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function shutdown(exitCode = 0) {
  if (!shuttingDown) shuttingDown = true;
  for (const child of children) {
    if (child.killed) continue;
    if (process.platform === "win32" && child.pid) {
      // npm.cmd starts the API/Vite processes as grandchildren; killing only cmd.exe
      // leaves orphaned listeners that poison the next Playwright project.
      spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    } else {
      child.kill("SIGTERM");
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  for (const child of children) {
    if (!child.killed) child.kill("SIGKILL");
  }
  process.exit(exitCode);
}

process.once("SIGINT", () => void shutdown(130));
process.once("SIGTERM", () => void shutdown(143));

// Keep the two runtimes independent. Start the Node API first and wait for
// its health endpoint before Vite is exposed, otherwise the first browser
// request can race the API cold start and receive a proxy 502.
const api = start(["run", "dev:api"], {
  ENVIRONMENT: "development",
  AUTH_DELIVERY_MODE: "dev",
  AUTH_TEST_CODE: "123456",
  AUTH_ALLOWED_EMAILS: "*",
  APP_ORIGIN: "http://127.0.0.1:5173",
  TPQR_DATABASE_PATH: path.join(root, "tmp", "browser", "tpqr.sqlite"),
  TPQR_ASSET_PATH: path.join(root, "tmp", "browser", "assets"),
  PORT: "8787",
  HOST: "127.0.0.1",
});
void waitFor("http://127.0.0.1:8787/api/health")
  .then(() => {
    if (!shuttingDown && !api.killed) start(["run", "dev:client", "--", "--port", "5173"]);
  })
  .catch((error) => {
    console.error(error);
    shuttingDown = true;
    void shutdown(1);
  });
