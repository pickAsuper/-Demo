# 把同一个商店发布为网页

Netlify 运行的是 **React 网页 + Netlify Functions + Netlify Database（PostgreSQL）**。Electron 继续作为桌面客户端，通过 HTTPS 请求同一套 API。

## 部署结构

```text
浏览器 → Netlify 静态网页 → /api/* → Netlify Function → 托管 PostgreSQL
Electron 主进程 ────────────────────↑
```

`netlify.toml` 指定 `npm run build:web` 和 `dist` 发布目录。网页构建不会生成 Electron 安装包，也不启动本地数据库。

`netlify/functions/shop-api.mjs` 使用官方 `@netlify/database` 自动获得当前部署对应的数据库连接。`server/netlify-adapter.mjs` 把 Netlify 请求转换给原有 Express 应用，所以两种部署共用库存事务、计价与防重复提交逻辑。

数据库凭据由 Netlify 注入云函数，不写进 Git、HTML 或前端环境变量。不要手动把连接串设置成 `VITE_*` 变量。

## 首次部署

1. 在 Netlify 登录并导入 `pickAsuper/-Demo`，选择 `main` 分支。
2. 在项目 **Data & storage → Database** 中创建数据库。
3. Netlify 读取仓库中的 `netlify.toml`，自动构建网页与云函数。
4. 发布前自动运行 `netlify/database/migrations/` 中的 SQL，创建业务表并插入演示商品。
5. 访问网站，确认商品已加载，再用虚构信息测试下单。

如果项目设置为 **Private project**，未登录的访问者可能得到 401。需要对外分享时，在项目界面检查公开访问设置；公开的是教学商店，不能放真实顾客数据。

这条部署路径不需要 Docker，也不需要自行安装 PostgreSQL。原来的 Docker 部署方案仍可使用。

## 更新代码与数据库

推送 `main` 会触发自动部署。Netlify 的迁移目录与本地 `server/migrations/` 使用不同的迁移记录；初始 `001_initial.sql` 表结构保持一致。后续新增表或字段，应在两边各新增对应的迁移文件，不要重写已应用的 SQL。

`002_seed_products.sql` 是首次部署时的商品快照。重新发布不会重置库存。云数据库与 `.data/postgres/` 完全独立，本机订单不会上传。

Netlify 的预览部署有独立的数据库分支；生产发布使用 production 分支。

## 桌面端访问在线服务

在 Electron 的「连接设置」里输入网站根地址（例如 `https://你的项目.netlify.app`），不要附加 `/api`。也可以把 `SHOP_API_URL` 设置为该地址后重新打包。

## 验证和使用范围

```bash
npm run build:web
npm test
```

测试会在临时 PostgreSQL 中应用 Netlify 的 SQL，验证函数路由、商品、下单、幂等和设备订单隔离。云端还需要实际验证 `/api/health` 与完整网页下单流程。

当前是匿名教学 Demo，没有真实支付和账号登录。Express 的内存限流只在单个函数实例内生效，不是跨实例的全局限流。正式营业前需要补齐认证、平台限流与业务监控。

Netlify Database 与 Functions 会消耗账户套餐的额度，空闲数据库默认会休眠。可在 **Usage & billing** 和数据库页面查看使用量，本项目没有配置付费升级或自动充值。

参考：[Netlify Database](https://docs.netlify.com/build/data-and-storage/netlify-database/)、[数据库 API](https://docs.netlify.com/build/data-and-storage/netlify-database/api/)、[数据库迁移](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/)。
