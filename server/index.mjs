import { createPool } from "./db.mjs";
import { migrate } from "./migrate.mjs";
import { createApp } from "./app.mjs";
import { host, port } from "./config.mjs";

const pool = createPool();
await migrate(pool);
const server = createApp(pool).listen(port, host, () =>
  console.log(`商店 API 已启动：http://${host}:${port}`),
);
// 收到停止信号后先停止接收新请求，再关闭连接池。
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  });
