const { contextBridge, ipcRenderer } = require("electron");

// 页面不能直接使用 Node.js。预加载脚本只暴露经过限制的能力。
contextBridge.exposeInMainWorld("shopDesktop", {
  request: (request) => ipcRenderer.invoke("shop:request", request),
  getConfig: () => ipcRenderer.invoke("shop:config"),
  setApiUrl: (url) => ipcRenderer.invoke("shop:configure", url),
});
