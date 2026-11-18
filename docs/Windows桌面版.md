# Windows 桌面版

在 `feature/desktop-exe` 分支执行 `npm ci` 安装依赖，然后运行：

| 命令 | 用途 |
| --- | --- |
| `npm run dev:exe` | 启动本机 Vite 开发服务和 Electron 窗口。首次启动可能需要下载 Electron。 |
| `npm run build:exe` | 生成 Windows x64 的 NSIS 安装程序，输出到 `release/`。 |
| `npm run build:exe:ia32` | 生成 32 位 Windows（x86/ia32）的 NSIS 安装程序，文件名以 `-ia32.exe` 结尾。 |
| `npm run dev` / `npm run build` | 仍用于网页版，网页构建输出到 `dist/`。 |

32 位 Windows 10 使用 `ia32` 安装包。32 位版单独使用 Electron 43.8.8；[Electron 43 是最后支持 32 位 Windows 的系列](https://www.electronjs.org/blog/electron-43-0)。64 位 Windows 请选用 `x64` 安装包。

桌面安装版每次成功新增、编辑、删除或导入排班后，会把完整任务和排班明细写到 Windows 的「文档」目录，文件名为 `小营变电班排班数据_自动备份.json`。备份不弹出保存窗口，每次成功写入会替换上一份快照。它是普通 JSON 文件，只保留最新一份；需要历史副本时，可另行复制该文件。

桌面版有自己的本地数据库。迁移网页数据时，先在网页选择「导出系统数据」，再在桌面端选择「导入系统数据」。恢复自动备份也使用「导入系统数据」。

开发版使用独立的数据库和备份路径，默认将备份放在「文档」下的 `变电站巡视计划（开发）` 子目录。运行测试时可设置 `SUBSTATION_DEV_DATA_DIR`，将开发版数据库和备份写到临时目录。
