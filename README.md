# 拾物 · Electron 电商 Demo

一个带中文界面、中文代码注释的桌面商店，用来学习 **Electron + React + Node.js API + PostgreSQL**，以及开发、构建、打包、部署和发布的完整过程。

包含商品分类 / 搜索 / 排序、商品详情、购物车、填写收货信息、事务下单、库存扣减、订单查询、连接设置和应用内学习指南。商品插画随项目提供，不依赖远程图片。

这是教学商店：**没有真实支付、真实发货、账号登录或自动更新**。请使用虚构收货信息。订单按匿名设备凭据隔离，不是生产级身份认证。

## 先回答：需要下载 VS Code 吗？

**不是必须。** 编辑器负责写代码；Node.js 才负责运行开发工具。你可以用 VS Code、WebStorm 或任何文本编辑器。初学推荐 [VS Code](https://code.visualstudio.com/)，它的终端、代码补全和文件导航比较方便。

当前电脑已有 Node.js，可直接运行下面的命令。其他电脑建议安装 [Node.js 24 LTS](https://nodejs.org/)；项目最低要求 Node.js 22.12。首次安装需要网络下载 Electron 与 PostgreSQL 二进制。

## 1. 先运行起来

在项目目录打开终端：

```bash
npm install
npm run dev
```

一条 `dev` 命令会依次：

1. 启动真正的 PostgreSQL 17，监听本机 `55432` 端口。
2. 创建 `mono_shop` 数据库，执行迁移并插入 8 件演示商品。
3. 启动 Node.js API（`3001`）、Vite 页面开发服务（`5173`）。
4. 打开 Electron 桌面窗口。

关闭应用窗口或在终端按 `Ctrl+C` 会停止整套开发服务。商品库存与订单保存在 `.data/postgres/`，重启不会丢失。购物车和随机设备凭据保存在 Electron 的本机用户数据目录。

**不用先安装 Docker 或 PostgreSQL。** 开发脚本通过 `embedded-postgres` 启动完整数据库。它是便于学习的开发依赖，不会被打进桌面安装包；生产部署使用独立 PostgreSQL。

想使用 Docker 或已经安装的 PostgreSQL，参见[完整学习与发布指南](docs/学习与发布指南.md)。

## 2. 按这个顺序体验

1. 在「发现好物」筛选商品，打开详情，加入购物车。
2. 改数量，点「去结算」，填写虚构地址，例如 `演示市拾物路 100 号`。
3. 点「提交演示订单」，在「我的订单」看到记录。
4. 关闭后再次运行 `npm run dev`，验证订单仍然存在。
5. 打开「开发学习指南」，再阅读项目源码。

运费规则：商品金额满 ¥299 免运费，否则 ¥12。所有金额由服务端按数据库价格重新计算，单位为分。

## 3. 构建和打包是两件事

```bash
# 类型检查 + React 页面编译，输出 dist/
npm run build

# 生成未压缩的应用目录，方便先试运行
npm run pack

# 生成当前操作系统的安装包，输出 release/
npm run dist
```

| 所在系统 | 安装包 | 接收安装包的用户需要什么 |
|---|---|---|
| macOS | `.dmg`、`.zip` | macOS，能连接 API |
| Windows | `.exe`（NSIS） | Windows，能连接 API |
| Linux | `.AppImage`、`.deb` | 对应 Linux 系统，能连接 API |

当前 Mac 默认生成 Apple Silicon 版本。学习包未配置开发者签名、公证；其他系统需要在对应系统构建并验证。**安装包里没有数据库和 API**，本地试运行安装包时要先在两个终端分别执行 `npm run db:start`、`npm run dev:api`。

## 4. 一眼看懂结构

```text
React 页面 → preload 安全桥 → Electron 主进程 → HTTP(S) API → PostgreSQL
   src/       electron/preload.cjs   electron/main.cjs      server/
```

| 路径 | 先看什么 |
|---|---|
| `src/App.tsx` | 商品、购物车、下单和订单界面 |
| `src/api.ts` | 页面怎样请求接口，金额怎样格式化 |
| `electron/main.cjs` | 创建窗口、IPC 白名单、远程 API 连接 |
| `electron/preload.cjs` | 页面能使用哪些桌面能力 |
| `server/app.mjs` | 校验、计价、数据库事务、防超卖、幂等下单 |
| `server/migrations/001_initial.sql` | 三张业务表及约束 |
| `scripts/dev.mjs` | 多个开发进程怎样一起启停 |
| `electron-builder.yml` | 安装包类型、包含文件与图标 |
| `deploy/` | API 镜像、PostgreSQL、HTTPS 服务 |
| `.github/workflows/release.yml` | 跨平台构建与 GitHub Release 草稿 |

## 5. 验证

```bash
npm run typecheck
npm test
npm run build
npm run test:desktop
```

`npm test` 使用临时的真实 PostgreSQL，验证并发、回滚、校验等行为，不碰你的开发数据。`test:desktop` 会打开测试用 Electron 窗口，实际点击下单，再自动关闭；需要桌面环境，截图位于 `artifacts/`。

完整讲解：**[学习与发布指南](docs/学习与发布指南.md)**。验收范围：[验证清单](docs/验证清单.md)。

## 6. 发布为网页

已增加 **[Netlify 部署方案](docs/Netlify部署.md)**：React 网页、Netlify Functions 与托管 PostgreSQL 可以一起部署，无需 Docker。网页与 Electron 共用相同的下单业务代码；桌面安装包仍通过 `npm run dist` 单独生成。
