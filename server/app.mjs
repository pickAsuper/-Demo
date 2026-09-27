import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";

const uuid = z.string().uuid();
const checkoutSchema = z
  .object({
    customer: z
      .object({
        name: z.string().trim().min(1).max(40),
        phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的 11 位手机号码"),
        address: z.string().trim().min(5).max(200),
      })
      .strict(),
    items: z
      .array(
        z
          .object({
            productId: z.string().min(1).max(50),
            quantity: z.number().int().min(1).max(99),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// API 输出使用驼峰字段，数据库使用下划线字段，各层职责保持清晰。
const mapProduct = (p) => ({
  id: p.id,
  name: p.name,
  subtitle: p.subtitle,
  description: p.description,
  category: p.category,
  priceCents: p.price_cents,
  stock: p.stock,
  image: p.image,
  color: p.color,
  tag: p.tag,
});

async function readOrder(client, id, clientId) {
  const {
    rows: [o],
  } = await client.query("SELECT * FROM orders WHERE id=$1 AND client_id=$2", [
    id,
    clientId,
  ]);
  if (!o) throw new HttpError(404, "订单不存在");
  const { rows } = await client.query(
    "SELECT * FROM order_items WHERE order_id=$1 ORDER BY id",
    [id],
  );
  return {
    id: o.id,
    orderNumber: o.order_number,
    status: o.status,
    createdAt: o.created_at,
    subtotalCents: o.subtotal_cents,
    shippingCents: o.shipping_cents,
    totalCents: o.total_cents,
    customer: { name: o.customer_name, phone: o.phone, address: o.address },
    items: rows.map((i) => ({
      productId: i.product_id,
      name: i.product_name,
      image: i.image,
      priceCents: i.price_cents,
      quantity: i.quantity,
    })),
  };
}

export function createApp(pool, { rateLimitEnabled = true } = {}) {
  const app = express();
  app.disable("x-powered-by");
  // 仅在明确使用一个可信反向代理时设置 TRUST_PROXY=1。
  if (process.env.TRUST_PROXY === "1") app.set("trust proxy", 1);
  app.use(helmet());
  app.use(express.json({ limit: "32kb" }));
  if (rateLimitEnabled)
    app.use(
      "/api",
      rateLimit({
        windowMs: 60000,
        limit: 120,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: { error: "操作太频繁，请稍后再试" },
      }),
    );

  app.get("/api/health", async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "PostgreSQL" });
  });
  app.get("/api/products", async (_req, res) => {
    const { rows } = await pool.query(
      "SELECT * FROM products ORDER BY sort_order, id",
    );
    res.json(rows.map(mapProduct));
  });

  app.use("/api/orders", (req, _res, next) => {
    const result = uuid.safeParse(req.get("x-client-id"));
    if (!result.success)
      return next(new HttpError(401, "设备凭据无效，请重新打开应用"));
    req.clientId = result.data;
    next();
  });
  app.get("/api/orders", async (req, res) => {
    // 教学版只返回当前设备最近 50 笔订单，避免跨设备读取收货信息。
    const { rows } = await pool.query(
      "SELECT id FROM orders WHERE client_id=$1 ORDER BY created_at DESC LIMIT 50",
      [req.clientId],
    );
    res.json(
      await Promise.all(rows.map((o) => readOrder(pool, o.id, req.clientId))),
    );
  });
  app.post("/api/orders", async (req, res) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success)
      throw new HttpError(400, parsed.error.issues[0].message);
    const key = uuid.safeParse(req.get("idempotency-key"));
    if (!key.success) throw new HttpError(400, "缺少有效的下单幂等键");
    const { customer, items } = parsed.data;
    if (new Set(items.map((i) => i.productId)).size !== items.length)
      throw new HttpError(400, "购物车中存在重复商品");
    // 排序后生成请求摘要，同一幂等键不能用于不同的商品或收货地址。
    items.sort((a, b) => a.productId.localeCompare(b.productId));
    const hash = createHash("sha256")
      .update(JSON.stringify({ customer, items }))
      .digest("hex");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // 同一设备重复点击/网络重试会等待同一把锁，最终返回同一笔订单。
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [req.clientId + key.data],
      );
      const previous = await client.query(
        "SELECT id,request_hash FROM orders WHERE client_id=$1 AND idempotency_key=$2",
        [req.clientId, key.data],
      );
      if (previous.rowCount) {
        if (previous.rows[0].request_hash !== hash)
          throw new HttpError(409, "这次下单内容已变化，请重新结算");
        const order = await readOrder(
          client,
          previous.rows[0].id,
          req.clientId,
        );
        await client.query("COMMIT");
        return res.json(order);
      }
      // 按固定顺序锁定商品行，既防止超卖，又降低并发事务死锁的概率。
      const { rows: productRows } = await client.query(
        "SELECT * FROM products WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE",
        [items.map((i) => i.productId)],
      );
      let subtotal = 0;
      for (const item of items) {
        const product = productRows.find((p) => p.id === item.productId);
        if (!product) throw new HttpError(400, "商品已下架，请刷新购物车");
        if (product.stock < item.quantity)
          throw new HttpError(
            409,
            `${product.name} 库存不足，目前剩余 ${product.stock} 件`,
          );
        subtotal += product.price_cents * item.quantity;
      }
      // 客户端不传价格；所有金额和运费都由服务端使用数据库价格计算。
      const shipping = subtotal >= 29900 ? 0 : 1200;
      const id = randomUUID();
      const orderNumber = `SW${Date.now()}${randomUUID().slice(0, 8).toUpperCase()}`;
      await client.query(
        `INSERT INTO orders
        (id,order_number,client_id,idempotency_key,request_hash,customer_name,phone,address,subtotal_cents,shipping_cents,total_cents)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          orderNumber,
          req.clientId,
          key.data,
          hash,
          customer.name,
          customer.phone,
          customer.address,
          subtotal,
          shipping,
          subtotal + shipping,
        ],
      );
      for (const item of items) {
        const p = productRows.find((p) => p.id === item.productId);
        await client.query("UPDATE products SET stock=stock-$1 WHERE id=$2", [
          item.quantity,
          p.id,
        ]);
        await client.query(
          `INSERT INTO order_items (order_id,product_id,product_name,image,price_cents,quantity)
          VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, p.id, p.name, p.image, p.price_cents, item.quantity],
        );
      }
      const order = await readOrder(client, id, req.clientId);
      await client.query("COMMIT");
      res.status(201).json(order);
    } catch (error) {
      // 任意商品失败会撤销整笔订单和所有库存变更，不会出现“扣库存但没订单”。
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });
  app.use((_req, _res, next) => next(new HttpError(404, "接口不存在")));
  app.use((error, _req, res, _next) => {
    const status = error.status || 500;
    // 服务端记录错误；客户端不接收数据库连接串、SQL 或堆栈。
    if (status >= 500)
      console.error("API 请求失败：", error.code || error.name);
    res
      .status(status)
      .json({
        error:
          status >= 500
            ? "服务暂时不可用，请确认 API 与数据库已启动"
            : error.message,
      });
  });
  return app;
}
