# NyaMarkdownor

[English](README.md) | [简体中文](README.zh-CN.md)

NyaMarkdownor 是一款本地优先的跨平台 Markdown 桌面编辑器，支持 Windows、macOS 和 Linux。当前稳定版本为 `1.0.4`，提供源码、分屏、预览和所见即所得四种编辑视图，并覆盖多文档、本地文件安全、结构化表格编辑、Markdown 感知剪贴板、工作恢复和版本历史等日常写作流程。

应用不要求账号，不包含同步、遥测、远程渲染或隐藏的在线服务依赖。Markdown 源文档始终是规范数据，预览和所见即所得模式都是源文档的投影。

## 下载

Windows、macOS 和 Linux 安装包发布在 [GitHub Releases](https://github.com/stevennight/NyaMarkdownor/releases/latest)，并附带 `SHA256SUMS` 校验文件。

## 主要能力

界面支持 English 和简体中文，可手动选择语言或跟随系统语言。

### 编辑与预览

- 使用 CodeMirror 6 提供高性能 Markdown 源码编辑。
- 支持源码、分屏、预览和基于 Tiptap 的所见即所得模式。
- 支持浅色/深色主题、语法弱化、查找替换、大文档手动预览快照和 Web Worker 渲染。
- 所见即所得模式尽量保留原始 Markdown 语义和写法，包括前言、标题、强调、行内代码、代码围栏、列表、任务列表、链接、图片、表格和换行形式。
- 原始 HTML 默认禁用；表格单元格中的换行使用受限的 `<br>` 语义，不开放通用 HTML 执行。

### 本地文件与多标签页

- 桌面版通过 Tauri/Rust 打开、创建、保存和导出本地文件。
- 支持 `.md`、`.markdown`、`.mdown`、`.mkdn`、`.mdwn` 和 `.txt`。
- 支持 UTF-8、UTF-8 BOM、UTF-16 LE/BE BOM，以及 Windows 常见 GB18030/GBK/系统 ANSI 文本。
- 文件、新建草稿、最近文件和工作区文件统一在文档标签页中打开。
- 支持多选打开、拖入文件/文件夹/本地图片、标签页恢复、重新打开已关闭标签页、键盘切换和拖动排序。
- 文件夹工作区由 Rust 有界扫描，支持过滤、路径排序、最近修改排序和命令面板快速打开。
- 桌面启动参数和系统“打开方式”传入的文件会在工作恢复完成后作为真实本地标签页打开；第二个进程会把文件转交给已运行实例。

### 表格与剪贴板

- 支持表格检测、插入、规范化、行列增删/复制/移动、排序、对齐和删除。
- 提供上下文表格工具栏和可滚动的 Table Inspector。
- 支持单元格、矩形范围、整行、整列、表头、正文和整表结构化选择。
- 可从 TSV、CSV、HTML 表格、Markdown 表格或换行文本粘贴并自动扩展表格。
- 智能复制同时写入干净文本、经过清理的 HTML 和 `text/markdown`；表格选择会生成 TSV/CSV/HTML/Markdown 结构化内容，而不是复制原始竖线语法。
- 表格单元格换行在 Markdown 中序列化为 `<br>`，CSV 中保留带引号的真实换行，纯文本保持网格形状。

### 文件安全、工作恢复与版本历史

- 保存已有文件前由 Rust 核对磁盘状态并创建恢复版本，写入使用临时文件和回滚替换。
- 自动保存和 `Ctrl+S` 使用同一滚动自动版本；默认滚动窗口为 10 分钟。
- 关闭脏标签、重新加载、恢复版本、处理恢复冲突和覆盖目标等重大变动前，必须先创建固定安全检查点。
- 用户可主动创建手动检查点；手动检查点不会因容量压力被静默删除。
- 默认每个来源保留 48 个自动版本、32 个安全版本和 32 个手动版本；共享上限为 2,048 个条目或 2 GiB，单个备份候选最大 256 MiB。
- 版本历史按文档汇总磁盘版本和本地检查点，并单独列出已确认源文件缺失的孤立历史。
- 可比较、恢复、作为独立草稿打开或删除单个版本，也可删除某个文档的全部历史。
- 工作恢复持续保存打开标签、活动标签、编辑内容和磁盘基线。正常关闭窗口只刷新工作现场，不额外创建历史版本。
- 外部文件发生真实内容变化或当前状态无法确认时，自动保存会暂停，并提供比较、重新加载、覆盖或另存为流程。

详细规则见[工作恢复与版本历史设计规格](docs/RECOVERY_AND_VERSION_HISTORY.md)。

## 数据与隐私

- 本地文件和版本历史不会上传。
- 正式版 Bundle Identifier 为 `io.github.stevennight.nyamarkdownor`。
- 开发版 Bundle Identifier 为 `io.github.stevennight.nyamarkdownor.dev`。
- Tauri 根据 Bundle Identifier 生成应用数据目录，因此正式版和开发版状态互相隔离。
- 偏好设置、标签页、草稿、检查点、最近文件和工作区状态写入 Tauri app-data 目录。
- 中央磁盘版本历史默认写入 Tauri app-local-data 目录下的 `backups-v1`；可在设置中选择其他备份根目录。
- 当前产品不扫描或迁移旧 Bundle Identifier 对应的数据目录。

## 桌面版与网页预览

```bash
npm install
npm run dev
```

`npm run dev` 启动 Tauri 桌面版，也是完整的本地文件运行模式。它包含原生文件对话框、Rust 文件 IO、最近文件、文件夹工作区、版本历史、外部修改检测和系统文件关联。

仅需浏览器界面时可运行：

```bash
npm run web:dev
```

网页预览刻意保持为“草稿模式”：新建只创建未绑定草稿，打开操作显示为导入草稿，保存/另存为只下载副本。网页预览不会假装持有真实磁盘路径，也不提供桌面文件安全语义。

Vite 开发服务器固定使用 `http://127.0.0.1:8765`，与 Tauri `devUrl` 保持一致。

## 验证

运行前端完整验证：

```bash
npm run verify
```

涉及 Rust/Tauri 的修改还应运行：

```bash
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

桌面开发与打包需要 Rust 工具链及对应平台的 Tauri 系统依赖。

## 发布

设置中的“关于”页面显示版本、提交、UTC 构建时间和发布仓库。普通本地构建使用 `package.json` 派生的开发版本，例如 `1.0.4-dev`。

推送 `vMAJOR.MINOR.PATCH` tag 会触发 Release 工作流：

1. 校验 tag 和 Windows MSI 版本范围。
2. 在 Linux 上运行前端验证和 Rust 测试。
3. 构建 Windows MSI/NSIS、macOS DMG、Linux AppImage/DEB。
4. 汇总 SHA-256 校验文件并发布 GitHub Release。

本地发布构建可通过以下环境变量注入相同元数据：

- `NYAMARKDOWNOR_VERSION`
- `NYAMARKDOWNOR_COMMIT`
- `NYAMARKDOWNOR_BUILD_DATE`
- `NYAMARKDOWNOR_UPDATE_REPOSITORY`

## 相关文档

- [架构说明（中文）](docs/ARCHITECTURE.zh-CN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [工作恢复与版本历史设计规格](docs/RECOVERY_AND_VERSION_HISTORY.md)
