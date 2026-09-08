# md2publish

把 Markdown 直接转换成更适合发布的普通文章格式，并分别生成：

- 知识星球版
- 微信公众号版

## 功能

- 粘贴 Markdown，或直接导入一个 `.md` / `.markdown` 文件
- 导入文件时可同时选择文中引用的本地图片，工具会将其内联到预览和剪贴板
- 自动处理标题、段落、列表、引用、代码块、图片和表格
- Markdown 图片会输出为真实图片，并以等比例自适应宽度显示
- 微信公众号“复制”会自动把表格渲染为 2 倍分辨率 PNG，并按原文位置嵌入，避免编辑器压缩或改乱表格样式
- 知识星球“复制文章”会自动把全部表格渲染为 2 倍分辨率 PNG，并按原文位置嵌入富文本，绕过编辑器对 `table` 标签的过滤
- 微信公众号剪贴板同时包含 HTML 和纯文本备用格式
- 支持将知识星球版或微信公众号版切换到整屏预览模式，并在整屏模式内手动调节阅读宽度
- 知识星球版支持两种复制模式：
  - **复制文章**：复制整篇富文本，自动将所有表格转为高清图片
  - **复制表格图片**：只复制当前表格图片，适合单独补贴或重试

## 环境要求

- Node.js `20.19+` 或 `22.12+`，推荐安装 Node.js 22 LTS
- npm（安装 Node.js 时会一并安装）
- 最新版 Chrome 或 Edge
- 不要直接双击打开 `index.html`；请通过下面的 Vite 本地服务访问，保证剪贴板 API 正常工作

可以先检查环境：

```bash
node -v
npm -v
```

## Windows 使用方法

### 一键启动（推荐）

双击项目目录里的 `start-dev.bat`（或桌面上的「md2publish」快捷方式）即可：

- 首次运行会自动执行 `npm install` 安装依赖
- 之后会启动开发服务器，并在就绪后**自动打开浏览器**访问 `http://127.0.0.1:5173/`
- 如果服务器已经在运行，再次双击只会打开浏览器，不会重复启动
- 关闭弹出的「md2publish dev server」命令行窗口（或在其中按 `Ctrl+C`）即可停止服务

前提：已安装 Node.js 22 LTS（`node -v` 可正常输出）。

### 手动启动

1. 从 [Node.js 官网](https://nodejs.org/)安装 Node.js 22 LTS。
2. 打开 PowerShell，进入项目目录：

```powershell
cd C:\path\to\md2publish
```

3. 首次运行时安装依赖：

```powershell
npm install
```

4. 启动项目：

```powershell
npm run dev
```

5. 使用最新版 Chrome 或 Edge 打开终端显示的地址，通常是：

```text
http://127.0.0.1:5173/
```

> ⚠️ 在 Windows 上请始终使用 `127.0.0.1` 而不是 `localhost`：`localhost` 会优先解析为 IPv6 回环地址 `::1`，而部分 Windows 机器的防火墙会拦截 IPv6 回环连接，导致 Vite 终端显示 `ready` 但浏览器报 `ERR_CONNECTION_REFUSED`。项目已在 `vite.config.ts` 中通过 `server.host: '127.0.0.1'` 将开发服务器固定绑定到 IPv4 回环地址。

6. 粘贴或导入 Markdown，点击知识星球版的「复制文章」，等待页面提示表格已经转为高清图片，然后粘贴到知识星球编辑器。微信公众号使用右侧的「复制」按钮。
7. 使用结束后回到 PowerShell，按 `Ctrl+C` 停止服务。

项目固定使用 `5173` 端口。如果该端口被其他程序占用，请先关闭占用程序再重新启动。

## macOS 使用方法

### 一键启动（推荐）

双击项目目录里的 `start-dev.command` 即可：

- 首次运行会自动执行 `npm install` 安装依赖
- 之后会启动开发服务器，并在就绪后**自动打开浏览器**访问 `http://127.0.0.1:5173/`
- 如果服务器已经在运行，再次双击只会打开浏览器，不会重复启动
- 关闭弹出的“终端”窗口（或在其中按 `Control+C`）即可停止服务

前提：已安装 Node.js 22 LTS（`node -v` 可正常输出）。脚本同时兼容 Apple 芯片和 Intel Mac 的 Homebrew 默认安装路径。

如果通过某些压缩或同步工具获取项目后，双击时提示没有执行权限，请在“终端”进入项目目录并执行一次：

```bash
chmod +x start-dev.command
```

### 手动启动

1. 从 [Node.js 官网](https://nodejs.org/)安装 Node.js 22 LTS；如果已经安装 Homebrew，也可以执行：

```bash
brew install node
```

2. 打开“终端”，进入项目目录：

```bash
cd /path/to/md2publish
```

3. 首次运行时安装依赖：

```bash
npm install
```

4. 启动项目：

```bash
npm run dev
```

5. 使用最新版 Chrome 打开终端显示的地址，通常是：

```text
http://127.0.0.1:5173/
```

也可以在终端中执行：

```bash
open http://127.0.0.1:5173/
```

6. 粘贴或导入 Markdown，点击知识星球版的「复制文章」，等待表格图片生成和复制完成，再粘贴到知识星球编辑器。微信公众号使用右侧的「复制」按钮。
7. 使用结束后回到终端，按 `Control+C` 停止服务。

macOS 建议优先使用最新版 Chrome。Safari 可以打开和预览页面，但其剪贴板权限和用户激活规则更严格，表格图片生成后再复制可能失败；遇到复制失败时请改用 Chrome。

## 故障排查

### Windows 上 Vite 显示 ready 但浏览器打不开页面

症状：PowerShell 显示 `VITE ready` 和 `Local: http://localhost:5173/`，但浏览器报 `ERR_CONNECTION_REFUSED` 或 `EACCES`。

原因：`localhost` 优先解析为 IPv6 回环地址 `::1`，而部分 Windows 机器的防火墙会拦截 IPv6 回环连接。项目已固定 dev server 绑定到 `127.0.0.1`（见 `vite.config.ts` 的 `server.host`），但**浏览器地址栏仍可能访问 `localhost`（`::1`）而被拦截**。

解决：

1. 始终使用终端输出的完整地址 `http://127.0.0.1:5173/` 访问，不要手动输入 `localhost`
2. 如果仍打不开，检查是否有残留的旧 dev server 进程占用端口：

```powershell
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -ge 5100 -and $_.LocalPort -le 5200 }
```

找到占用 `5173` 的 `OwningProcess` 后结束该进程（`Stop-Process -Id <进程号> -Force`），再重新 `npm run dev`

3. 快速判断本机 IPv6 回环是否被拦截：

```powershell
node -e "require('net').connect(0,'::1',()=>process.exit(0)).on('error',e=>{console.log('IPv6 loopback blocked:',e.code);process.exit(1)})"
```

如果输出 `EACCES`，说明是防火墙拦截 IPv6 回环，按第 1 步使用 `127.0.0.1` 即可；如需彻底解决，可在 Windows 防火墙中放行 IPv6 回环连接。

### 端口被占用

一键启动器固定使用 `5173` 端口。如果 md2publish 已经在该端口运行，再次启动只会打开现有页面；如果浏览器打开的不是 md2publish，或终端显示端口占用错误，请关闭占用该端口的其他程序后重试。

## 构建与测试

```bash
npm run build
npm run test
```

## 使用说明

### 知识星球版复制建议

知识星球会过滤 HTML `table` 标签，因此知识星球输出不再直接复制真实表格：

1. **复制文章**：一次复制全文，所有表格自动转为高清图片并保留原文位置
2. **复制表格图片**：需要单独补贴某个表格时使用；多次点击会依次复制下一张表格

### 导入本地图片

点击「导入 Markdown/图片」，一次选择一个 Markdown 文件和它引用的图片。远程 `http` / `https` 图片无需额外选择；本地相对路径图片会按完整相对路径优先匹配，在文件选择器不提供目录信息时再按唯一文件名匹配。若有图片未找到，页面会列出缺少的路径。

### 微信公众号版

直接使用「复制」按钮。复制内容包含真实图片、自动生成的高清表格图片和纯文本备用格式；标题、正文及提示块使用适合公众号编辑器的内联排版样式。
