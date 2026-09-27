import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { startLocalDatabase } from "../scripts/local-db.mjs";
import { createPool } from "../server/db.mjs";
import { migrate } from "../server/migrate.mjs";
import { createApp } from "../server/app.mjs";

let database, pool, server, directory, base;
const customer = {
  name: "测试顾客",
  phone: "13800000000",
  address: "演示市自动化测试路 100 号",
};
const clientId = randomUUID();
const body = (id = "mug", quantity = 1) => ({
  customer,
  items: [{ productId: id, quantity }],
});
async function freePort() {
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}
async function request(
  path,
  { payload, client = clientId, key = randomUUID() } = {},
) {
  const response = await fetch(`${base}${path}`, {
    method: payload ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": client,
      "Idempotency-Key": key,
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return { status: response.status, data: await response.json() };
}
before(async () => {
  // 每次测试都启动独立的真实 PostgreSQL，绝不操作开发库。
  directory = await mkdtemp(join(tmpdir(), "mono-api-test-"));
  const port = await freePort();
  database = await startLocalDatabase({
    directory: join(directory, "pg"),
    port,
    persistent: false,
  });
  pool = createPool(
    `postgresql://shop:shop_local_only@127.0.0.1:${port}/mono_shop`,
  );
  await migrate(pool);
  server = createApp(pool, { rateLimitEnabled: false }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
  if (database) await database.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("迁移可重复运行，种子商品不重复", async () => {
  await migrate(pool);
  const products = await request("/products");
  assert.equal(products.status, 200);
  assert.equal(products.data.length, 8);
  assert.equal((await request("/health")).data.database, "PostgreSQL");
});
test("服务端计算价格和运费，保存快照并扣库存", async () => {
  const order = await request("/orders", { payload: body() });
  assert.equal(order.status, 201);
  assert.equal(order.data.subtotalCents, 8900);
  assert.equal(order.data.shippingCents, 1200);
  assert.equal(order.data.totalCents, 10100);
  assert.equal(order.data.items[0].name, "Everyday 陶瓷杯");
  assert.equal(
    (await pool.query("SELECT stock FROM products WHERE id='mug'")).rows[0]
      .stock,
    55,
  );
});
test("并发重试同一幂等键，只生成一笔订单并扣一次库存", async () => {
  const key = randomUUID();
  const beforeStock = (
    await pool.query("SELECT stock FROM products WHERE id='keyboard'")
  ).rows[0].stock;
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      request("/orders", { payload: body("keyboard"), key }),
    ),
  );
  assert.equal(new Set(results.map((r) => r.data.id)).size, 1);
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.ok(results.every((r) => r.status === 200 || r.status === 201));
  assert.equal(results[0].data.shippingCents, 0);
  assert.equal(
    (await pool.query("SELECT stock FROM products WHERE id='keyboard'")).rows[0]
      .stock,
    beforeStock - 1,
  );
  const conflict = await request("/orders", {
    payload: body("keyboard", 2),
    key,
  });
  assert.equal(conflict.status, 409);
});
test("最后一件库存并发抢购，只有一人成功，不会超卖", async () => {
  await pool.query("UPDATE products SET stock=1 WHERE id='clock'");
  const results = await Promise.all([
    request("/orders", { payload: body("clock") }),
    request("/orders", { payload: body("clock") }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(
    (await pool.query("SELECT stock FROM products WHERE id='clock'")).rows[0]
      .stock,
    0,
  );
});
test("任意商品库存不足时，整单回滚，不扣其他商品库存", async () => {
  const beforeStock = (
    await pool.query("SELECT stock FROM products WHERE id='bag'")
  ).rows[0].stock;
  const beforeOrders = (await pool.query("SELECT count(*) FROM orders")).rows[0]
    .count;
  const result = await request("/orders", {
    payload: {
      customer,
      items: [
        { productId: "bag", quantity: 1 },
        { productId: "clock", quantity: 1 },
      ],
    },
  });
  assert.equal(result.status, 409);
  assert.equal(
    (await pool.query("SELECT stock FROM products WHERE id='bag'")).rows[0]
      .stock,
    beforeStock,
  );
  assert.equal(
    (await pool.query("SELECT count(*) FROM orders")).rows[0].count,
    beforeOrders,
  );
});
test("数据库中途写入失败也会回滚已扣的库存与订单", async () => {
  // 临时约束模拟订单明细写入故障，检验事务的真实回滚能力。
  const beforeStock = (
    await pool.query("SELECT stock FROM products WHERE id='lamp'")
  ).rows[0].stock;
  const beforeOrders = (await pool.query("SELECT count(*) FROM orders")).rows[0]
    .count;
  await pool.query(
    "ALTER TABLE order_items ADD CONSTRAINT test_failure CHECK (product_id <> 'lamp')",
  );
  try {
    assert.equal(
      (await request("/orders", { payload: body("lamp") })).status,
      500,
    );
    assert.equal(
      (await pool.query("SELECT stock FROM products WHERE id='lamp'")).rows[0]
        .stock,
      beforeStock,
    );
    assert.equal(
      (await pool.query("SELECT count(*) FROM orders")).rows[0].count,
      beforeOrders,
    );
  } finally {
    await pool.query("ALTER TABLE order_items DROP CONSTRAINT test_failure");
  }
});
test("当前设备可以查订单，其他设备不能读取这些订单", async () => {
  assert.ok((await request("/orders")).data.length > 0);
  assert.deepEqual(
    (await request("/orders", { client: randomUUID() })).data,
    [],
  );
  assert.equal((await request("/orders", { client: "invalid" })).status, 401);
});
test("拒绝负数数量、伪造价格、重复商品、无效电话和未知商品", async () => {
  const invalidBodies = [
    body("mug", -1),
    { ...body(), priceCents: 1 },
    { customer, items: [body().items[0], body().items[0]] },
    { ...body(), customer: { ...customer, phone: "123" } },
    body("missing"),
  ];
  for (const payload of invalidBodies)
    assert.equal((await request("/orders", { payload })).status, 400);
  assert.equal(
    (await request("/orders", { payload: body(), key: "invalid" })).status,
    400,
  );
});
test("订单价格快照不受商品后续改价影响", async () => {
  const created = await request("/orders", { payload: body("notebook") });
  await pool.query("UPDATE products SET price_cents=100 WHERE id='notebook'");
  const stored = (await request("/orders")).data.find(
    (o) => o.id === created.data.id,
  );
  assert.equal(stored.items[0].priceCents, 5900);
  assert.equal(stored.totalCents, 7100);
});
