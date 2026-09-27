import EmbeddedPostgres from "embedded-postgres";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export async function startLocalDatabase({
  directory = ".data/postgres",
  port = 55432,
  persistent = true,
} = {}) {
  await mkdir(resolve(directory), { recursive: true });
  // 这是完整的 PostgreSQL 进程，不是内存模拟库；数据保存在项目 .data 目录。
  const database = new EmbeddedPostgres({
    databaseDir: resolve(directory),
    user: "shop",
    password: "shop_local_only",
    port,
    persistent,
    authMethod: "scram-sha-256",
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: (message) => {
      if (/FATAL|ERROR/.test(String(message))) console.error(String(message));
    },
  });
  // initdb 只能用于空目录。再次启动时复用现有库，不能重复初始化。
  const version = await readFile(
    resolve(directory, "PG_VERSION"),
    "utf8",
  ).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (version === null) await database.initialise();
  else if (version.trim() !== "17")
    throw new Error(
      "本地数据目录不是 PostgreSQL 17，请先备份并迁移数据库，不要直接覆盖旧数据",
    );
  await database.start();
  try {
    const client = database.getPgClient();
    await client.connect();
    try {
      const result = await client.query(
        "SELECT 1 FROM pg_database WHERE datname='mono_shop'",
      );
      if (!result.rowCount) await client.query("CREATE DATABASE mono_shop");
    } finally {
      await client.end();
    }
  } catch (error) {
    await database.stop();
    throw error;
  }
  console.log(`PostgreSQL 已启动：127.0.0.1:${port}（数据目录：${directory}）`);
  return database;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const database = await startLocalDatabase();
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, async () => {
      if (stopping) return;
      stopping = true;
      await database.stop();
      process.exit(0);
    });
}
