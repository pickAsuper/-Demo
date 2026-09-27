import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { validateApiUrl } = require("../electron/config.cjs");

// 构建时只写入公开的 API 地址，数据库密码绝不能打进安装包。
const apiUrl = validateApiUrl(
  process.env.SHOP_API_URL || "http://127.0.0.1:3001",
);
await writeFile("dist/client-config.json", JSON.stringify({ apiUrl }, null, 2));
console.log(`客户端 API 地址：${apiUrl}`);
