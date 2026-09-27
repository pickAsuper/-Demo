import serverless from "serverless-http";
import { isIP } from "node:net";
import { createApp } from "./app.mjs";

export function createNetlifyHandler(pool) {
  // 复用相同的 Express 业务代码，事务、计价和幂等逻辑不维护第二份。
  const handle = serverless(createApp(pool));
  return async (event, context = {}) => {
    const headers = Object.fromEntries(
      Object.entries(event.headers || {}).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    );
    const ip = headers["x-nf-client-connection-ip"];
    // Netlify 在入口处设置真实客户端 IP；不信任访客自己提交的转发链。
    delete headers["x-forwarded-for"];
    delete headers.forwarded;
    const path = event.path.replace(
      /^\/\.netlify\/functions\/shop-api(?=\/|$)/,
      "/api",
    );
    context.callbackWaitsForEmptyEventLoop = false;
    const response = await handle(
      {
        ...event,
        path,
        headers,
        multiValueHeaders: undefined,
        requestContext: {
          ...event.requestContext,
          identity: {
            sourceIp: typeof ip === "string" && isIP(ip) ? ip : "127.0.0.1",
          },
        },
      },
      context,
    );
    return {
      ...response,
      headers: { ...response.headers, "cache-control": "no-store" },
    };
  };
}
