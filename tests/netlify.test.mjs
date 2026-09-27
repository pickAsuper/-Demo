import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { createPool } from "../server/db.mjs";
import { startLocalDatabase } from "../scripts/local-db.mjs";
import { createNetlifyHandler } from "../server/netlify-adapter.mjs";

let directory, database, pool, handle;
const clientId = randomUUID();
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "mono-netlify-test-"));
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  database = await startLocalDatabase({
    directory: join(directory, "pg"),
    port,
    persistent: false,
  });
  pool = createPool(
    `postgresql://shop:shop_local_only@127.0.0.1:${port}/mono_shop`,
  );
  // 直接应用 Netlify 会读取的 SQL，验证真实部署迁移能独立建立完整数据库。
  const migrations = new URL(
    "../netlify/database/migrations/",
    import.meta.url,
  );
  for (const file of (await readdir(migrations))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await pool.query(await readFile(new URL(file, migrations), "utf8"));
  }
  handle = createNetlifyHandler(pool);
});
after(async () => {
  if (pool) await pool.end();
  if (database) await database.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function invoke(path, payload, key = randomUUID(), client = clientId) {
  const result = await handle(
    {
      path,
      httpMethod: payload ? "POST" : "GET",
      isBase64Encoded: false,
      body: payload ? JSON.stringify(payload) : "",
      headers: {
        "content-type": "application/json",
        "x-client-id": client,
        "idempotency-key": key,
        "x-nf-client-connection-ip": "203.0.113.10",
        "x-forwarded-for": "untrusted-client-value",
      },
      queryStringParameters: {},
    },
    {},
  );
  return { ...result, data: JSON.parse(result.body) };
}
test("Netlify 迁移与同源 API 路由返回 8 件商品", async () => {
  const response = await invoke("/api/products");
  assert.equal(response.statusCode, 200);
  assert.equal(response.data.length, 8);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(
    (await invoke("/.netlify/functions/shop-api/health")).data.database,
    "PostgreSQL",
  );
});
test("云函数适配器保留请求体、设备凭据和幂等键，订单可以持久读取", async () => {
  const key = randomUUID();
  const body = {
    customer: {
      name: "云端测试",
      phone: "13800000000",
      address: "演示市云端测试路 100 号",
    },
    items: [{ productId: "mug", quantity: 1 }],
  };
  const created = await invoke(
    "/.netlify/functions/shop-api/orders",
    body,
    key,
  );
  assert.equal(created.statusCode, 201);
  assert.equal(created.data.totalCents, 10100);
  const retried = await invoke("/api/orders", body, key);
  assert.equal(retried.statusCode, 200);
  assert.equal(retried.data.id, created.data.id);
  assert.equal((await invoke("/api/orders")).data[0].id, created.data.id);
  assert.deepEqual(
    (await invoke("/api/orders", undefined, randomUUID(), randomUUID())).data,
    [],
  );
});
test("云函数不会把未知 API 路由当作网页返回", async () => {
  const response = await invoke("/.netlify/functions/shop-api/missing");
  assert.equal(response.statusCode, 404);
  assert.equal(response.data.error, "接口不存在");
});
