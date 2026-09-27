import {
  ArrowUpRight,
  Box,
  Code2,
  CloudUpload,
  PackageCheck,
  Rocket,
} from "lucide-react";

const chapters = [
  {
    icon: Code2,
    title: "开发",
    text: "修改源代码，边写边看。这个命令同时启动 PostgreSQL、API、Vite 和 Electron。",
    command: "npm run dev",
    result: "开发窗口，保存代码即可看到页面变化",
  },
  {
    icon: Box,
    title: "构建",
    text: "检查 TypeScript，把 React 页面编译、压缩成浏览器能运行的静态文件。",
    command: "npm run build",
    result: "dist/：编译后的页面资源",
  },
  {
    icon: PackageCheck,
    title: "打包",
    text: "把页面、主进程和 Electron 运行时组合成桌面安装包。用户不需要安装 Node.js。",
    command: "npm run dist",
    result: "release/：当前操作系统的安装包",
  },
  {
    icon: CloudUpload,
    title: "部署",
    text: "把 API 与 PostgreSQL 放到服务器。安装包连接 API，数据库始终只对服务端开放。",
    command: "docker compose -f deploy/compose.yml up -d --build",
    result: "独立运行的服务端，完整配置见部署教程",
  },
  {
    icon: Rocket,
    title: "发布",
    text: "更新版本号，测试安装包，然后签名、公证并上传到发布渠道。项目附带手动触发的发布工作流。",
    command: "npm version patch --no-git-tag-version",
    result: "新的版本号与可供下载的发布草稿",
  },
];

export default function Guide() {
  return (
    <section className="guide page-section">
      <div className="page-heading">
        <div>
          <span className="section-kicker">从代码到桌面应用</span>
          <h1>跟着这个项目学一遍。</h1>
          <p>开发、构建、打包、部署、发布，分别在做什么？</p>
        </div>
        <Code2 size={44} strokeWidth={1.2} />
      </div>
      <div className="architecture">
        <span>
          Electron 桌面端<small>React 页面 + 主进程</small>
        </span>
        <ArrowUpRight />
        <span>
          Node.js API<small>校验、计价、处理订单</small>
        </span>
        <ArrowUpRight />
        <span>
          PostgreSQL<small>商品、库存、订单</small>
        </span>
      </div>
      <div className="chapters">
        {chapters.map((chapter, index) => (
          <article key={chapter.title}>
            <div className="chapter-step">{index + 1}</div>
            <div className="chapter-body">
              <h2>
                <chapter.icon size={20} />
                {chapter.title}
              </h2>
              <p>{chapter.text}</p>
              <pre>
                <code>{chapter.command}</code>
              </pre>
              <small>得到什么：{chapter.result}</small>
            </div>
          </article>
        ))}
      </div>
      <div className="guide-note">
        <h3>一定要安装 VS Code 吗？</h3>
        <p>
          不用。VS Code 只是写代码的编辑器，任何文本编辑器都可以。初学建议使用
          VS Code，配合 ESLint、中文语言包和 PostgreSQL
          扩展；运行项目真正需要的是 Node.js。
        </p>
        <p>
          完整命令、文件阅读顺序、平台差异和上线步骤，请打开项目里的{" "}
          <strong>README.md</strong> 与 <strong>docs/学习与发布指南.md</strong>
          。
        </p>
      </div>
    </section>
  );
}
