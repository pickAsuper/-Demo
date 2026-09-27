import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "development-csp",
      // React 热更新会注入开发脚本；仅开发页面放行内联脚本，安装包保持严格 CSP。
      transformIndexHtml: {
        order: "pre",
        handler(html, context) {
          return context.server
            ? html.replace(
                "script-src 'self';",
                "script-src 'self' 'unsafe-inline';",
              )
            : html;
        },
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
  build: { outDir: "dist", sourcemap: false },
});
