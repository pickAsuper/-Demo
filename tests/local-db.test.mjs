import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { startLocalDatabase } from "../scripts/local-db.mjs";

test("本地 PostgreSQL 停止再启动后，原有数据保持不变", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mono-persistence-test-"));
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  let database;
  try {
    database = await startLocalDatabase({
      directory: join(directory, "pg"),
      port,
    });
    let client = database.getPgClient("mono_shop");
    await client.connect();
    try {
      await client.query("CREATE TABLE persistence_probe (value text)");
      await client.query(
        "INSERT INTO persistence_probe VALUES ('订单与库存要保留')",
      );
    } finally {
      await client.end();
    }
    await database.stop();
    database = undefined;
    // 使用同一数据目录重启数据库进程，验证第二次启动不调用 initdb。
    database = await startLocalDatabase({
      directory: join(directory, "pg"),
      port,
    });
    client = database.getPgClient("mono_shop");
    await client.connect();
    try {
      assert.equal(
        (await client.query("SELECT value FROM persistence_probe")).rows[0]
          .value,
        "订单与库存要保留",
      );
    } finally {
      await client.end();
    }
  } finally {
    if (database) await database.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
