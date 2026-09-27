const { app, BrowserWindow, ipcMain, session } = require("electron");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs/promises");
const { mkdirSync } = require("node:fs");
const { validateApiUrl } = require("./config.cjs");

let mainWindow;
let apiUrl;
let settingsFile;
// 自动化测试可使用独立数据目录，避免污染学习者的购物车和连接设置。
if (process.env.SHOP_USER_DATA) {
  mkdirSync(process.env.SHOP_USER_DATA, { recursive: true });
  app.setPath("userData", process.env.SHOP_USER_DATA);
}
const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
const pageUrl = pathToFileURL(join(__dirname, "../dist/index.html")).href;

async function readSettings() {
  settingsFile = join(app.getPath("userData"), "connection.json");
  const bundledPath = app.isPackaged
    ? join(process.resourcesPath, "client-config.json")
    : join(__dirname, "../dist/client-config.json");
  let bundled = {};
  let saved = {};
  try {
    bundled = JSON.parse(await fs.readFile(bundledPath, "utf8"));
  } catch {
    /* 首次开发尚未构建。 */
  }
  try {
    saved = JSON.parse(await fs.readFile(settingsFile, "utf8"));
  } catch {
    /* 首次启动尚未保存设置。 */
  }
  apiUrl = validateApiUrl(
    process.env.SHOP_API_URL ||
      saved.apiUrl ||
      bundled.apiUrl ||
      "http://127.0.0.1:3001",
  );
}

function checkSender(event) {
  // 只接受主窗口的顶层页面，拒绝未知窗口或 iframe 发来的 IPC。
  if (
    event.sender !== mainWindow?.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame ||
    event.senderFrame.url !== (devUrl ? `${devUrl}/` : pageUrl)
  )
    throw new Error("不可信的页面来源");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 940,
    minWidth: 920,
    minHeight: 680,
    title: "拾物 · 桌面商店",
    backgroundColor: "#f6f7f9",
    ...(process.platform === "darwin"
      ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 20, y: 17 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event) => event.preventDefault());
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(join(__dirname, "../dist/index.html"));
}

app
  .whenReady()
  .then(async () => {
    await readSettings();
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    ipcMain.handle("shop:config", (event) => {
      checkSender(event);
      return { apiUrl, version: app.getVersion(), platform: process.platform };
    });
    ipcMain.handle("shop:configure", async (event, value) => {
      checkSender(event);
      const nextUrl = validateApiUrl(value);
      await fs.writeFile(
        settingsFile,
        JSON.stringify({ apiUrl: nextUrl }, null, 2),
        { mode: 0o600 },
      );
      apiUrl = nextUrl;
      return { apiUrl, version: app.getVersion(), platform: process.platform };
    });
    ipcMain.handle("shop:request", async (event, request) => {
      checkSender(event);
      // 只暴露电商需要的三个接口，不能把主进程变成任意 URL 请求代理。
      const {
        path,
        method = "GET",
        body,
        clientId,
        idempotencyKey,
      } = request || {};
      if (
        ![
          "GET /health",
          "GET /products",
          "GET /orders",
          "POST /orders",
        ].includes(`${method} ${path}`)
      )
        throw new Error("接口不在允许列表");
      const serialized = body ? JSON.stringify(body) : undefined;
      if (serialized && serialized.length > 32768)
        throw new Error("请求内容过大");
      try {
        const response = await fetch(`${apiUrl}/api${path}`, {
          method,
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: {
            "Content-Type": "application/json",
            ...(clientId ? { "X-Client-Id": String(clientId) } : {}),
            ...(idempotencyKey
              ? { "Idempotency-Key": String(idempotencyKey) }
              : {}),
          },
          body: serialized,
        });
        return {
          ok: response.ok,
          status: response.status,
          data: await response.json(),
        };
      } catch {
        return {
          ok: false,
          status: 0,
          data: { error: "无法连接商店服务，请启动服务或检查连接设置" },
        };
      }
    });
    createWindow();
    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  })
  .catch((error) => {
    console.error("应用启动失败：", error.message);
    app.quit();
  });

// 教学启动器以窗口关闭作为结束信号，所以 macOS 也退出应用。
app.on("window-all-closed", () => app.quit());
