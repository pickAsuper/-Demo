import pg from "pg";
import { databaseUrl } from "./config.mjs";

export function createPool(connectionString = databaseUrl) {
  // 连接池复用 TCP 连接，避免每次请求都重新连接数据库。
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
  });
  // 空闲连接也可能因数据库重启断开。监听 error 防止未捕获事件终止 API；
  // 正在主动关闭连接池时，数据库同时关闭产生的断连无需重复报错。
  pool.on("error", (error) => {
    if (!pool.ending) console.error("数据库空闲连接异常：", error.code);
  });
  return pool;
}
