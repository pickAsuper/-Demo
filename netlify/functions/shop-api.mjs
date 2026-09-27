import { getDatabase, getConnectionString } from "@netlify/database";
import { createNetlifyHandler } from "../../server/netlify-adapter.mjs";

let cached;

export async function handler(event, context) {
  try {
    // Netlify 自动注入当前部署对应的数据库凭据；不写入 Git 或前端资源。
    const connectionString = getConnectionString();
    if (!cached || cached.connectionString !== connectionString) {
      // 凭据轮换或数据库分支变化时重建连接池，普通请求复用同一个池。
      if (cached) await cached.pool.end();
      const { pool } = getDatabase();
      pool.on("error", (error) =>
        console.error("云数据库空闲连接异常：", error.code),
      );
      cached = { connectionString, pool, handle: createNetlifyHandler(pool) };
    }
    return await cached.handle(event, context);
  } catch (error) {
    console.error("Netlify API 初始化失败：", error.code || error.name);
    return {
      statusCode: 503,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
      body: JSON.stringify({ error: "商店服务正在准备中，请稍后重试" }),
    };
  }
}
