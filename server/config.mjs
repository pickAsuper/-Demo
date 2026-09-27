import "dotenv/config";

// 数据库连接只存在于服务端；永远不要把它传给 Electron 页面。
export const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://shop:shop_local_only@127.0.0.1:55432/mono_shop";
export const port = Number(process.env.PORT || 3001);
export const host = process.env.HOST || "127.0.0.1";
