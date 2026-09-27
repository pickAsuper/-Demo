import "dotenv/config";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { startLocalDatabase } from "./local-db.mjs";

const children = [];
let database;
let closing = false;
// 启动前检查端口，避免误连到另一份项目的 API 或数据库。
async function assertFree(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", () =>
      reject(new Error(`端口 ${port} 已被占用，请先停止旧进程`)),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
function run(file, args, extraEnv = {}) {
  const child = spawn(process.execPath, [file, ...args], {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  children.push(child);
  child.once("exit", (code) => {
    if (!closing) void shutdown(code || 0);
  });
  return child;
}
async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    if (closing) throw new Error("启动已取消");
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* 服务尚未启动，稍后重试。 */
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`等待服务超时：${url}`);
}
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children.toReversed()) child.kill("SIGTERM");
  await Promise.all(
    children.map((child) =>
      child.exitCode !== null
        ? undefined
        : new Promise((resolve) => {
            child.once("exit", resolve);
            setTimeout(() => {
              child.kill("SIGKILL");
              resolve();
            }, 5000).unref();
          }),
    ),
  );
  if (database) await database.stop();
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => void shutdown());
try {
  const external = process.argv.includes("--external-db");
  await Promise.all([
    assertFree(3001),
    assertFree(5173),
    ...(external ? [] : [assertFree(55432)]),
  ]);
  if (!external) database = await startLocalDatabase();
  run("server/index.mjs", [], {
    PORT: "3001",
    HOST: "127.0.0.1",
    ...(!external
      ? {
          DATABASE_URL:
            "postgresql://shop:shop_local_only@127.0.0.1:55432/mono_shop",
        }
      : {}),
  });
  run("node_modules/vite/bin/vite.js", ["--host", "127.0.0.1"]);
  await Promise.all([
    waitFor("http://127.0.0.1:3001/api/health"),
    waitFor("http://127.0.0.1:5173"),
  ]);
  run("node_modules/electron/cli.js", ["."], {
    ELECTRON_RENDERER_URL: "http://127.0.0.1:5173",
  });
  console.log(
    "开发环境已就绪。关闭 Electron 或按 Ctrl+C，会一并停止 API 和本地数据库。",
  );
} catch (error) {
  console.error(error.message);
  await shutdown(1);
}
