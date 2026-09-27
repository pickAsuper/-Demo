import type { ApiRequest } from "./types";

// 演示版用随机设备凭据隔离订单；真实业务应替换为登录、会话和用户权限。
let clientId = localStorage.getItem("mono-client-id");
if (!clientId) {
  clientId = crypto.randomUUID();
  localStorage.setItem("mono-client-id", clientId);
}

export async function api<T>(
  path: string,
  options: Omit<ApiRequest, "path"> = {},
): Promise<T> {
  const request = { ...options, path, clientId: clientId! };
  if (window.shopDesktop) {
    const response = await window.shopDesktop.request(request);
    if (!response.ok)
      throw new Error((response.data as { error: string }).error);
    return response.data as T;
  }
  // 浏览器走同源 /api：本地由 Vite 代理，Netlify 上由云函数处理。
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method || "GET",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": clientId!,
        ...(options.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error("无法连接商店服务，请启动 API 后重试");
  }
  // 部署遗漏 API 时平台可能返回 HTML 错误页，转换成可理解的提示。
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("商店接口尚未就绪，请稍后重试或联系部署者");
  }
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "服务暂时不可用");
  return data;
}

export const money = (cents: number) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
