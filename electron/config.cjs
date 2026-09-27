// 远程服务器必须使用 HTTPS，本机教学服务允许 HTTP。
function validateApiUrl(value) {
  const url = new URL(value);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:"))
    throw new Error("远程 API 地址必须使用 HTTPS");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("请输入服务器根地址，例如 https://shop.example.com");
  return url.origin;
}
module.exports = { validateApiUrl };
