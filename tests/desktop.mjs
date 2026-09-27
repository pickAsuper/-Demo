import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { startLocalDatabase } from "../scripts/local-db.mjs";
import { createPool } from "../server/db.mjs";
import { migrate } from "../server/migrate.mjs";
import { createApp } from "../server/app.mjs";

// 覆盖范围与截图要求见 docs/验证清单.md；所有下单使用隔离的测试库。
let application, database, pool, server;
const directory = await mkdtemp(join(tmpdir(), "mono-desktop-test-"));
const screenshots = resolve("artifacts");
const errors = [];
const report = [];
async function getPort() {
  const socket = createServer();
  await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}
try {
  await mkdir(screenshots, { recursive: true });
  const databasePort = await getPort();
  database = await startLocalDatabase({
    directory: join(directory, "pg"),
    port: databasePort,
    persistent: false,
  });
  pool = createPool(
    `postgresql://shop:shop_local_only@127.0.0.1:${databasePort}/mono_shop`,
  );
  await migrate(pool);
  server = createApp(pool, { rateLimitEnabled: false }).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const apiUrl = `http://127.0.0.1:${server.address().port}`;
  application = await electron.launch({
    // 指定可执行文件时，可对已经打包的 .app 运行同一套验收。
    ...(process.env.SHOP_PACKAGED_EXECUTABLE
      ? { executablePath: process.env.SHOP_PACKAGED_EXECUTABLE, args: [] }
      : { args: ["."] }),
    cwd: resolve("."),
    env: {
      ...process.env,
      SHOP_API_URL: apiUrl,
      SHOP_USER_DATA: join(directory, "user"),
      ELECTRON_RENDERER_URL: "",
    },
  });
  const page = await application.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await page
    .getByRole("button", { name: "加入购物车：Daylight 机械键盘", exact: true })
    .waitFor();
  const screenshot = async (name) => {
    // 等待 DOM 更新真正绘制到原生窗口，避免截到前一帧的加载占位图。
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    // 通过 Electron 原生截图归一化到 CSS 像素，避免 Retina 截图翻倍。
    const png = await application.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const [width, height] = window.getContentSize();
      return (await window.capturePage()).resize({ width, height }).toPNG();
    });
    await writeFile(join(screenshots, `${name}.png`), png);
  };
  const assertFit = async () => {
    const sizes = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert.ok(sizes.scrollWidth <= sizes.width, JSON.stringify(sizes));
    for (const selector of [".profile", ".connection", ".header-cart"]) {
      const bounds = await page.locator(selector).boundingBox();
      assert.ok(
        bounds && bounds.y >= 0 && bounds.y + bounds.height <= sizes.height + 1,
        `${selector} 在窗口内完整可见`,
      );
    }
    report.push(sizes);
  };
  await assertFit();
  await screenshot("01-storefront");
  await page.locator(".product-card").first().scrollIntoViewIfNeeded();
  await screenshot("01b-products");
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal(await page.locator(".product-card").count(), 8);
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  await assert.rejects(
    page.evaluate(() => window.shopDesktop.request({ path: "/not-allowed" })),
  );
  await page.getByRole("button", { name: "桌面数码", exact: true }).click();
  assert.equal(await page.locator(".product-card").count(), 3);
  await page.getByRole("button", { name: "全部好物", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索商品" }).fill("不存在的商品");
  await page.getByText("还没有找到这件好物").waitFor();
  await page
    .getByRole("button", { name: "查看全部好物", exact: true })
    .scrollIntoViewIfNeeded();
  await screenshot("02-no-results");
  await page.getByRole("button", { name: "清除搜索" }).click();
  await page.getByLabel("商品排序").selectOption("low");
  assert.ok(
    (await page.locator(".product-name").first().innerText()).includes(
      "笔记本",
    ),
  );
  await page.getByLabel("商品排序").selectOption("featured");
  await page.getByRole("button", { name: "查看Daylight 机械键盘详情" }).click();
  await page.getByRole("dialog").waitFor();
  await screenshot("03-product-detail");
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "打开购物车，0 件商品" }).click();
  await page.getByText("留个位置，给喜欢的好物").waitFor();
  await page.getByRole("button", { name: "去逛逛" }).click();
  await page
    .getByRole("button", { name: "加入购物车：Everyday 陶瓷杯" })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "打开购物车，1 件商品" }).click();
  await page.getByRole("button", { name: "增加Everyday 陶瓷杯" }).click();
  await page.getByRole("button", { name: "减少Everyday 陶瓷杯" }).click();
  await page.getByRole("button", { name: "移除Everyday 陶瓷杯" }).click();
  await page.getByText("留个位置，给喜欢的好物").waitFor();
  await page.getByRole("button", { name: "去逛逛" }).click();
  await page
    .getByRole("button", { name: "加入购物车：Daylight 机械键盘" })
    .click();
  await page
    .getByRole("button", { name: "加入购物车：Everyday 陶瓷杯" })
    .click();
  await page.getByRole("button", { name: "打开购物车，2 件商品" }).click();
  await screenshot("04-cart");
  await page.getByRole("button", { name: "去结算", exact: true }).click();
  await page
    .getByRole("textbox", { name: "收货人", exact: true })
    .fill("演示顾客");
  await page
    .getByRole("textbox", { name: "手机号码", exact: true })
    .fill("13800000000");
  await page
    .getByRole("textbox", { name: "收货地址", exact: true })
    .fill("演示市拾物路 100 号");
  await screenshot("05-checkout");
  await page.getByRole("button", { name: "提交演示订单", exact: true }).click();
  await page.getByText("喜欢的好物，已安排。").waitFor();
  await screenshot("06-success");
  assert.equal(
    (await pool.query("SELECT total_cents FROM orders")).rows[0].total_cents,
    45800,
  );
  await page.getByRole("button", { name: "查看我的订单" }).click();
  await page.locator(".order-card").waitFor();
  await screenshot("07-orders");
  await page.reload();
  await page.getByRole("button", { name: "我的订单", exact: true }).click();
  await page.locator(".order-card").waitFor();
  await page.getByRole("button", { name: "刷新订单" }).click();
  await page.locator(".order-card").waitFor();
  await page.getByRole("button", { name: "开发学习指南", exact: true }).click();
  assert.equal(await page.locator(".chapters article").count(), 5);
  await screenshot("08-guide");
  await page.locator(".guide-note").scrollIntoViewIfNeeded();
  await screenshot("08b-guide-publishing");
  await page.getByRole("button", { name: "连接设置", exact: true }).click();
  await page.getByRole("textbox", { name: "API 服务器地址" }).fill(apiUrl);
  await page.getByRole("button", { name: "保存并连接" }).click();
  await page.getByText("连接地址已保存", { exact: true }).waitFor();
  await screenshot("09-settings");
  // 在数据库设置库存边界，再从界面真实点击加购验证按钮状态。
  await pool.query("UPDATE products SET stock=1 WHERE id='clock'");
  await page.getByRole("button", { name: "发现好物", exact: true }).click();
  await page.reload();
  await page
    .getByRole("button", { name: "加入购物车：Minute 桌面时钟" })
    .click();
  await page.getByRole("button", { name: "打开购物车，1 件商品" }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "增加Minute 桌面时钟" })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(920, 680),
  );
  await assertFit();
  await screenshot("10-small-window");
  await page.getByRole("button", { name: "打开购物车，1 件商品" }).click();
  await page.getByRole("button", { name: "去结算", exact: true }).click();
  await screenshot("11-small-checkout");
  await page.getByRole("button", { name: "关闭弹窗" }).click();
  await page.getByRole("button", { name: "探索桌面好物" }).click();
  assert.equal(await page.locator(".product-card").count(), 3);
  // 停止 API 后验证失败状态与重试入口，不能显示假的成功状态。
  await new Promise((resolve) => server.close(resolve));
  server = undefined;
  await page.reload();
  await page.getByText("商店暂时还没开门").waitFor();
  await page.getByRole("button", { name: "重新连接" }).scrollIntoViewIfNeeded();
  await screenshot("12-offline");
  await page.getByRole("button", { name: "重新连接" }).click();
  await page.getByText("商店暂时还没开门").waitFor();
  assert.deepEqual(errors, []);
  await writeFile(
    join(screenshots, "desktop-report.json"),
    JSON.stringify(
      {
        passed: true,
        mode: process.env.SHOP_PACKAGED_EXECUTABLE ? "packaged" : "source",
        viewports: report,
        rendererErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    "Electron 验收通过：浏览、搜索、分类、排序、详情、购物车、下单、订单、指南、设置、最小窗口与断线提示。",
  );
} finally {
  if (application) await application.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
  if (database) await database.stop();
  await rm(directory, { recursive: true, force: true });
}
