# Rhythm Assets Gallery

一个静态音游曲绘下载站，目前主要面向 Arcaea 和 Phigros 的曲绘、角色、曲包封面等图片资源。

项目把 `public/assets` 视为原图来源。扫描脚本会生成 `public/data` 下的索引 JSON，缩略图脚本会生成 `public/thumbs` 下的 WebP 缩略图。最终部署的是 Astro 构建出的静态 `dist` 目录。

## 技术栈

- Astro
- React，仅用于图库搜索、筛选、加载更多等交互
- TypeScript
- Tailwind CSS
- Fuse.js
- Sharp
- Node.js 脚本

## 常用命令

```powershell
npm run dev
npm run build
npm run preview
npm run scan
npm run thumbs
npm run update
npm run validate:assets
npm run import:incoming
npm run arcaea:extract
npm run phigros:extract
npm run phigros:publish
npm run arcaea:metadata
```

`npm run update` 等于：

```text
npm run scan + npm run thumbs + npm run sitemap
```

## Arcaea APK Runtime Download

Arcaea 客户端下载不再依赖 `public/downloads` 或 `dist/downloads`。推荐模式是：

- 服务器定时运行 `npm run arcaea:check-apk`
- 脚本直接在服务器本地缓存 APK，写入私有元数据 JSON
- 首页运行时通过 `/api/apk/arcaea/latest` 读取最新版本信息，不需要重新构建站点
- 用户通过 `/api/download/arcaea/latest` 下载，由服务器本地文件提供流式响应

默认建议的环境变量：

```text
STATS_DATA_DIR=/www/wwwroot/stats-data
ARCAEA_APK_RUNTIME_DIR=/www/wwwroot/stats-data/arcaea-apk
ARCAEA_APK_META_FILE=/www/wwwroot/stats-data/arcaea-apk/arcaea-apk.json
ARCAEA_APK_DOWNLOAD_DIR=/www/wwwroot/stats-data/arcaea-apk/files
STATS_SALT=<long-random-secret>
```

Security and Nginx hardening notes: `docs/SECURITY-HARDENING.md`

特性说明：

- APK 元数据接口只公开 `version`、`filename`、`sizeBytes`、`scrapedAt`，不再暴露真实上游 URL 或本地文件路径
- 下载接口支持 `HEAD` 和 HTTP `Range`，可用于断点续传和多线程分段下载
- 服务器缓存和站点构建产物解耦，远程构建时不会把 APK 打进 `dist`

## Arcaea APK 更新提取流程

### 只提取新版 APK 的新增资源

如果目标只是从新版 APK 和上一版 APK 中找出新增或变化的图片资源，并放到一个待处理目录里，用：

```powershell
npm run arcaea:extract -- --new "D:\Files\曲绘\Arcaea\APK\arcaea_新版本.apk" --old "D:\Files\曲绘\Arcaea\APK\arcaea_上一版本.apk" --out "D:\Files\曲绘\Arcaea\曲绘（85）6.xx.x"
```

`--new` 和 `--old` 可以传 APK 文件，也可以传已解压目录。如果传目录，目录本身可以是 APK 解压根目录，也可以直接是其中的 `assets` 目录。

这个脚本会：

- 只读取输入 APK 或目录，不修改原始 APK、已解压目录、`public/assets` 或远程资源目录。
- 从 APK 中选择性抽取站点会使用的图片资源，不解包音频、模型、谱面以外的无关大文件。
- 对比新版和旧版相同路径文件的 SHA-1，复制新增或内容变化的图片。
- 跳过歌曲目录里的 `_256` 压缩曲绘。
- 按资源类型输出到 `曲绘`、`曲包封面`、`剧情/cg`、`剧情贴图`、`角色/立绘`、`角色/头像`、`角色/LinkPlay预览`、`游玩背景`、`LinkPlay贴纸`、`世界模式`、`启动页面` 等子目录。
- 同步复制新版的 `songlist`、`packlist`、`char/characters.json`、`story2/ordering` 到输出目录的 `_metadata/`，方便人工核对。
- 写入 `arcaea-update-report.json`，列出复制了哪些文件。
- 曲绘输出文件名会根据新版 `songlist` 自动加可读前缀。
- 如果是 `1080_base_3` 或 `1080_base_4` 等独立难度曲绘，前缀会优先使用该难度自己的曲名、曲师、BPM、背景、谱师、曲绘画师和显示难度，避免和普通难度信息混淆。
- 角色资源输出文件名会根据新版 `char/characters.json` 自动加中文名和英文名前缀，原始数字文件名保留在末尾。

所以，**提取更新资源这一步只需要跑 `npm run arcaea:extract`**。它负责把新增内容找出来并放进你指定的文件夹，供你后续手动超分、压缩和整理。

### 压缩手动超分后的 Arcaea 曲绘

手动超分完成后，先单独运行压缩命令：

```powershell
npm run arcaea:compress -- --dir "D:\Files\曲绘\Arcaea\曲绘（85）6.14.10"
```

默认行为：

- 自动查找目录内所有文件名以 `_optimization` 结尾的 `.png`、`.jpg`、`.jpeg`。
- 按 `D:\Files\曲绘\Arcaea\compress.py` 的逻辑转成同目录 `_opt.jpg`。
- 默认质量 `95`，白底合成透明图，输出 RGB JPEG。
- 转换成功后默认删除 `_optimization` 源图，避免站点同时扫到超分源图和压缩图；需要保留源图时加 `--keep-original`。
- 如果 `_opt.jpg` 已存在，默认跳过；需要覆盖时加 `--overwrite`。
- 写入 `arcaea-compress-report.json`。

常用参数：

```powershell
npm run arcaea:compress -- --dir "D:\Files\曲绘\Arcaea\曲绘（85）6.14.10" --overwrite
npm run arcaea:compress -- --dir "D:\Files\曲绘\Arcaea\曲绘（85）6.14.10" --keep-original
npm run arcaea:compress -- --quality 95
```

### 同步 Arcaea 更新到远程服务器

确认压缩结果无误后，再单独运行同步/发布命令：

```powershell
npm run arcaea:publish -- -LocalDir "D:\Files\曲绘\Arcaea\曲绘（85）6.14.10"
```

默认行为：

- 从目录名推断版本号，例如 `曲绘（85）6.14.10` 会推断为 `6.14.10`。
- 远程目标目录默认为 `DEPLOY_REMOTE_ASSET_ROOT/Arcaea（至版本号）`。
- 如果远程目标目录不存在，会先从服务器上最新的旧 `Arcaea（至x.x.x）` 目录复制一份作为基底，再把本次新增图片覆盖进去。
- 上传本地更新目录里的图片分类子目录，跳过 `_metadata` 和报告文件。
- 上传成功后，默认把上一版 Arcaea 目录移到 `DEPLOY_REMOTE_WORK_PATH/asset-backups/arcaea/时间戳/`，避免扫描时同时出现新旧两套 Arcaea 目录。
- 最后自动执行 `.\scripts\deploy.ps1 -Mode remote-build`，让服务器重新扫描原图、生成索引和缩略图，并切换新站点。

常用参数：

```powershell
npm run arcaea:publish -- -Version 6.14.10
npm run arcaea:publish -- -LocalDir "D:\Files\曲绘\Arcaea\曲绘（85）6.14.10" -SkipDeploy
npm run arcaea:publish -- -RemoteGameDir "Arcaea（至6.14.10）"
```

Arcaea 更新不要把三步连成一个命令。推荐按顺序分别执行：`arcaea:extract`、手动超分、`arcaea:compress`、确认结果、`arcaea:publish`。

## Phigros APK 更新提取流程

Phigros 是 Unity/Addressables 游戏，APK 里通常没有直接可见的 `png`/`jpg` 原图。当前基础自动化脚本会读取 APK 内的 `assets/aa/catalog.json`，比较新版和上一版的 Addressables key 与 bundle 文件，提取新版新增 bundle 里的曲绘和头像。

默认 APK 目录是：

```text
D:\Files\曲绘\Phigros\APK
```

把新版 APK 放进去后运行：

```powershell
npm run phigros:extract
```

脚本会自动选择目录里版本号最高的 `Phigros_*.apk` 作为新版，选择它之前的最高版本作为旧版。输出目录默认是：

```text
D:\Files\曲绘\Phigros\版本号
```

例如 `3.19.2` 会输出到：

```text
D:\Files\曲绘\Phigros\3_19_2
```

这个脚本会：

- 只读取 APK，不修改原始 APK、`public/assets` 或远程资源目录。
- 只扫描新版 APK 中相对旧版新增的 Unity bundle，避免全量解包。
- 从新增 bundle 中导出 `Texture2D` 图片。
- 将 `Illustration` 且尺寸较大的图片输出到 `曲绘`。
- 将宽高均不超过 `200` 的图片输出到 `头像`。
- 从 Addressables key 中解析曲名和曲师，按 `曲名 - 曲师.png` 命名曲绘。
- 写入 `phigros-update-report.json`，记录新旧 APK、候选 key、导出文件、bundle、尺寸和命名来源。

也可以显式指定版本或路径：

```powershell
npm run phigros:extract -- --new 3.19.2 --old 3.19.1.1
npm run phigros:extract -- --new "D:\Files\曲绘\Phigros\APK\Phigros_3.19.2.apk" --old "D:\Files\曲绘\Phigros\APK\Phigros_3.19.1.1.apk"
```

如果要改 APK 目录、输出父目录或直接指定输出目录：

```powershell
npm run phigros:extract -- --apk-dir "D:\Files\曲绘\Phigros\APK" --output-parent "D:\Files\曲绘\Phigros"
npm run phigros:extract -- --out "D:\Files\曲绘\Phigros\3_19_2"
```

首次运行前需要 Python 包：

```powershell
pip install UnityPy texture2ddecoder
```

注意：当前 Phigros 脚本是基础自动化，只处理“新增 bundle”中的曲绘和头像。它不会尝试把同名但内容变化的旧 bundle 做资源级精确映射，因为 Unity Addressables 的资源定位关系需要进一步解析，否则容易把旧图误命名为新曲。

### 上传整理后的 Phigros 更新并刷新网站

手动核对、重命名、整理完 `D:\Files\曲绘\Phigros\版本号` 下的图片后，可以运行：

```powershell
npm run phigros:publish
```

默认行为：

- 自动选择 `D:\Files\曲绘\Phigros` 下版本号最高的目录作为本地更新目录。
- 从目录名推断版本号，例如 `3_19_2` 会推断为 `3.19.2`。
- 上传 `曲绘` 和 `头像` 两个子目录中的图片。
- 远程目标目录默认为 `DEPLOY_REMOTE_ASSET_ROOT/Phigros（至版本号）`。
- 如果远程目标目录不存在，会先从服务器上最新的旧 `Phigros（至x.x.x）` 目录复制一份作为基底，再把本次新增图片覆盖进去。
- 上传成功后，默认把上一版 Phigros 目录移到 `DEPLOY_REMOTE_WORK_PATH/asset-backups/phigros/时间戳/`，避免扫描时同时出现新旧两套 Phigros 目录。
- 最后自动执行 `.\scripts\deploy.ps1 -Mode remote-build`，让服务器重新扫描原图、生成索引和缩略图，并切换新站点。

常用参数：

```powershell
npm run phigros:publish -- -Version 3.19.2
npm run phigros:publish -- -LocalDir "D:\Files\曲绘\Phigros\3_19_2"
npm run phigros:publish -- -RemoteGameDir "Phigros（至3.19.2）"
npm run phigros:publish -- -PreviousRemoteGameDir "Phigros（至3.19.1）"
```

只上传、不触发远程构建：

```powershell
npm run phigros:publish -- -SkipDeploy
```

保留远程上一版目录不移走：

```powershell
npm run phigros:publish -- -KeepPrevious
```

注意：`-KeepPrevious` 会让远程原图根目录里同时存在新旧 Phigros 目录，网站扫描时可能出现重复资源；通常只用于临时调试。

### 更新网站使用的 Arcaea 元信息

如果新版 APK 已经解压，且你希望网站的曲名、曲包、剧情、角色、难度等关联信息也跟着新版更新，再运行：

```powershell
npm run arcaea:metadata -- --assets-dir "D:\Files\曲绘\Arcaea\APK\arcaea_新版本\assets"
```

这个脚本会从新版 `assets` 中读取：

- `songs/songlist`
- `songs/packlist`
- `char/characters.json`
- `app-data/story2/ordering`
- `app-data/story/main/entries_*`
- `app-data/story/side/entries_*`

并生成：

```text
scripts/data/arcaea-metadata.json
```

扫描器会用这个文件增强网站索引。当前增强内容包括：

- 曲绘关联歌曲 ID、曲名、曲师、曲包、版本、BPM、SIDE、游玩背景、反转背景。
- 独立难度曲绘关联对应难度自己的曲名、曲师、显示难度、谱师、曲绘画师、BPM 和背景。
- 曲包显示名会优先使用 `name_localized`，并在存在 `pack_parent` 时附带父曲包上下文，减少多个 `Collaboration Chapter 2/3` 难以区分的问题。
- 角色立绘、头像、LinkPlay 预览优先关联 `characters.json` 中的中文名、英文名和 `pack_id` 曲包；旧 `搭档列表.CSV` 只作为兜底。
- 剧情 CG 关联剧情章节、剧情节点、剧情类型、解锁曲包、关联曲目和关联角色。
- 剧情贴图尽量按目录名关联到对应剧情章节。

更新元信息后，如果要重新生成网站：

```powershell
npm run update
npm run build
```

如果要同步到服务器，再按部署流程运行：

```powershell
.\scripts\deploy.ps1 -Mode remote-build
```

## 本地开发流程

1. 安装依赖：

```powershell
npm install
```

2. 准备本地测试图片，放在：

```text
public/assets
```

3. 生成索引和缩略图：

```powershell
npm run update
```

4. 启动开发服务器：

```powershell
npm run dev
```

5. 浏览器打开 Astro 输出的本地地址，一般是：

```text
http://localhost:4321/
```

如果端口被占用，Astro 会自动换到下一个端口。

## 添加新图片流程

手动添加图片时：

1. 把原图放入 `public/assets`。
2. 保持目录结构能表达游戏和分类，例如：

```text
public/assets/Arcaea（至6.14.0）/曲绘/...
public/assets/Phigros（至3.19.1）/曲绘/...
```

服务器上如果外面还有一层 `曲绘/` 目录也可以，只要最终扫描根目录指向正确即可。

3. 运行：

```powershell
npm run update
```

4. 再运行：

```powershell
npm run build
```

注意：

- 不要手动修改 `public/assets` 里的原图文件，除非确实要替换资源。
- `public/assets`、`public/thumbs`、`public/data/*.json` 默认不建议提交到 git。
- 如果服务器上已经有完整原图目录，本地只需要少量测试文件即可。

## 构建流程

完整构建前建议先更新资源索引和缩略图：

```powershell
npm run update
npm run build
```

如果只是改首页 UI、文字、样式或组件逻辑，没有新增图片，可以只运行：

```powershell
npm run build
```

构建成功后，静态文件会输出到：

```text
dist
```

## 部署 dist 目录

这是静态站，不需要 Node.js 后端常驻运行。推荐部署方式：

### PowerShell 自动部署

项目提供 Windows PowerShell 部署脚本：

```powershell
.\scripts\deploy.ps1
```

脚本会按顺序执行：

1. `npm run update`
2. `npm run build`
3. 创建本地上传快照 `.deploy-work/dist-snapshot`
4. 在服务器创建临时发布目录
5. 使用 `scp` 上传快照内容
6. 上传成功后在服务器执行发布切换：当前正式目录移动为 `.old`，新目录切换为正式目录

任一步骤失败时，脚本会停止执行。脚本不会把服务器 IP、用户名、密码硬编码进脚本。

部署配置从项目根目录的本地文件读取：

```powershell
.\.deploy.env
```

`.deploy.env` 已加入 `.gitignore`，不要提交这个文件。仓库里只保留 `.deploy.env.example` 作为模板。

运行过一次 `npm install` 后，仓库会自动把 `core.hooksPath` 指向 `.githooks`，启用本地 `pre-commit` 检查。也可以手动运行：

```powershell
npm run hooks:install
```

提交前检查会拦截：

- `.deploy.env`
- SSH 私钥文件、`.pem` / `.p12` / `.pfx`
- 私钥内容块
- `.deploy.env.example` 和 `README.md` 里的真实部署值

需要手动检查时可以运行：

```powershell
npm run guard:secrets
```

当前站点按宝塔 Linux 面板常见目录配置：

```env
DEPLOY_HOST=your-server.example.com
DEPLOY_USER=deploy
DEPLOY_PORT=22
DEPLOY_PATH=/www/wwwroot/example.com
DEPLOY_SITE_URL=https://example.com
DEPLOY_REMOTE_WORK_PATH=/www/wwwroot/example.com.build-work
DEPLOY_MIN_FREE_MB=2048
DEPLOY_USE_SSH_CONFIG=false
DEPLOY_PROGRESS_POLL_SECONDS=3
DEPLOY_REMOTE_SHARP_CONCURRENCY=1
DEPLOY_REMOTE_SHARP_CACHE_MEMORY_MB=64
```

如果你的 SSH 登录用户不是 `deploy`，只改 `.deploy.env` 里的 `DEPLOY_USER`。`DEPLOY_PATH` 应该和宝塔面板里这个网站的根目录一致；宝塔默认通常是 `/www/wwwroot/域名`。

默认 `DEPLOY_USE_SSH_CONFIG=false`，脚本会忽略本机 `~/.ssh/config`，避免被已有 Host 别名、跳板机或图形 SSH 工具写入的配置影响。如果你确实依赖 `~/.ssh/config` 里的密钥、跳板机或端口配置，可以改成：

```env
DEPLOY_USE_SSH_CONFIG=true
```

如果只需要指定密钥文件，优先在 `.deploy.env` 里显式配置：

```env
DEPLOY_IDENTITY_FILE=C:\Users\你的用户名\.ssh\id_rsa
```

然后运行：

```powershell
.\scripts\deploy.ps1
```

也可以临时指定其他配置文件：

```powershell
.\scripts\deploy.ps1 -ConfigPath .\.deploy.env
```

要求本机已经可以通过 `ssh` 和 `scp` 登录服务器。推荐使用 SSH key；如果使用密码登录，会由系统的 `ssh/scp` 命令交互式提示输入，密码不要写进脚本或仓库文件。

脚本会在上传前检查服务器上 `DEPLOY_PATH` 所在分区的剩余空间。因为当前全量发布会同时保留临时新版本和 `.old` 备份，服务器剩余空间只有约 18G 时要避免上传过大的 `dist`。`DEPLOY_MIN_FREE_MB` 用来保留安全余量，默认示例为 2048 MB。

上传阶段会显示总进度、当前估算速度和剩余时间。这个进度通过定时查询服务器临时目录大小估算，`DEPLOY_PROGRESS_POLL_SECONDS` 控制刷新间隔，默认 3 秒。

脚本默认先复制一份本地 `dist` 快照再上传，避免上传过程中 `dist` 被重新构建或其他工具改动导致 `scp` 找不到文件。这个快照目录是 `.deploy-work/dist-snapshot`，已加入 `.gitignore`。如果确定不会并发改动 `dist`，可以跳过快照：

```powershell
.\scripts\deploy.ps1 -SkipLocalSnapshot
```

### 远程构建部署

如果服务器上已经有完整曲绘原图目录，可以让服务器构建网页，只从本地上传源码包，不上传本地 `dist`、`public/assets`、`public/thumbs`、`public/data` 和 `node_modules`。

先在 `.deploy.env` 里配置服务器原图目录：

```env
DEPLOY_REMOTE_ASSET_ROOT=/服务器上的/曲绘/目录
```

然后运行：

```powershell
.\scripts\deploy.ps1 -Mode remote-build
```

远程构建模式会：

1. 本地打包源码，排除大目录和生成目录。
2. 清理服务器旧的 `source-*`、`source-*.tar.gz` 和未切换的 release 临时目录。
3. 上传源码包到 `DEPLOY_REMOTE_WORK_PATH`。
4. 检查服务器 Node.js 版本必须满足 `>=22.12.0`。
5. 在服务器写入构建用 `.env`，其中 `ASSET_ROOT` 指向 `DEPLOY_REMOTE_ASSET_ROOT`。
6. 复用正式站点里已有的 `thumbs` 缩略图目录，避免未变化图片重复生成缩略图。
7. 在服务器执行 `npm ci` 或 `npm install`、`npm run update`、`npm run build`。
8. 构建成功后把服务器生成的 `dist` 原子切换为宝塔网站目录。

注意：远程构建模式不会把原图复制进 `dist`。宝塔/Nginx 需要把网页路径 `/assets/` 指向 `DEPLOY_REMOTE_ASSET_ROOT`，否则详情页原图下载链接会 404。索引会在每次构建时重新生成到 `dist/data`；缩略图会优先复用正式站点已有的 `thumbs`，只为新增或变更的图片补齐。

`DEPLOY_REMOTE_ASSET_ROOT` 不要放在 `DEPLOY_PATH` 里面。远程构建会对 `DEPLOY_PATH` 做原子切换，如果原图目录在这个正式网站目录下，会有被移动到 `.old` 的风险。建议把原图放在独立目录，例如 `/www/rhythm-assets`，再用宝塔/Nginx 给 `/assets/` 配 alias。

如果服务器内存较小，缩略图生成可能被系统 kill，表现为退出码 `137`。默认配置会限制 `sharp` 的并发和缓存：

```env
DEPLOY_REMOTE_SHARP_CONCURRENCY=1
DEPLOY_REMOTE_SHARP_CACHE_MEMORY_MB=64
```

当前部署脚本使用全量上传 `dist` 构建产物的方式。脚本已经预留 `-Mode incremental` 参数位置，但增量上传尚未实现；后续可以在这个入口接入基于文件清单、mtime/hash 或 rsync 风格的增量同步，让只修改过的构建内容上传到服务器并立即通过网页访问。

### 手动部署

1. 在本地或服务器上运行：

```powershell
npm run update
npm run build
```

2. 把 `dist` 目录内容上传到服务器网站根目录。

例如 Nginx 站点目录：

```text
/var/www/rhythm-assets-gallery
```

上传后目录里应该能看到：

```text
index.html
_astro/
assets/
data/
thumbs/
arcaea/
phigros/
search/
asset/
```

3. Nginx 指向这个目录即可。

香港服务器直连部署是推荐保留方案。Cloudflare 可以作为可选加速层，但不要把站点可用性完全绑定在 Cloudflare 上。

## 推荐 Nginx 配置示例

下面是静态站配置示例，按你的域名和目录改 `server_name`、`root`：

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/rhythm-assets-gallery;
    index index.html;

    gzip on;
    gzip_types
        text/plain
        text/css
        application/javascript
        application/json
        image/svg+xml;

    location = /favicon.ico {
        access_log off;
        expires 30d;
        add_header Cache-Control "public, max-age=2592000";
    }

    location /_astro/ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }

    location /thumbs/ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
        try_files $uri =404;
    }

    location /data/ {
        expires 5m;
        add_header Cache-Control "public, max-age=300";
        try_files $uri =404;
    }

    location / {
        expires 5m;
        add_header Cache-Control "public, max-age=300";
        try_files $uri $uri/ /index.html;
    }
}
```

如果你更新图片后发现浏览器还看到旧缩略图，可以先确认 `npm run update` 是否生成了新缩略图，再清理浏览器缓存或 CDN 缓存。

## Cloudflare 使用建议

Cloudflare 不是必需项。大陆访问 Cloudflare 有时不稳定，所以建议保留香港服务器直连方案；Cloudflare 只作为可选缓存和防护层。

推荐缓存策略：

- HTML：短缓存，例如 5 分钟。
- `/data/*.json`：短缓存，例如 1 到 5 分钟，避免更新索引后长时间不生效。
- `/thumbs/*`：长缓存，例如 30 天或更久。
- `/assets/*`：长缓存，例如 30 天或更久。
- `/_astro/*`：长缓存，因为构建产物文件名通常带 hash。

如果使用 Cloudflare Cache Rules，可以按路径设置：

```text
*.html                  Browser TTL: 5 minutes
/data/*                 Browser TTL: 1-5 minutes
/thumbs/*               Browser TTL: 30 days
/assets/*               Browser TTL: 30 days
/_astro/*               Browser TTL: 30 days or longer
```

更新资源后，如果开启了 Cloudflare 且用户仍看到旧内容，可以只清理这些路径：

```text
/data/*
/thumbs/*
```

原图 `/assets/*` 通常不建议频繁覆盖同名文件。如果必须覆盖同名原图，记得同步清理 CDN 缓存。

## 首页自定义

首页大部分文案和少量样式参数在：

```text
src/lib/homepage-config.ts
```

常用修改项：

- `siteTitle` 和 `metaDescription`：浏览器标题和页面描述。
- `hero`：首页标题、说明文字、搜索框提示、搜索按钮。
- `bilibili`：B 站卡片文案、链接、按钮，或用 `enabled: false` 隐藏。
- `stats`、`games`、`sections`：首页各区块标签。
- `theme`：内容最大宽度、Hero 高度、标题最大字号、主题色。

改完后运行：

```powershell
npm run build
```

## 预留自动化更新流程

项目没有实现爬虫、下载器或联网抓取。

当前预留的本地流程是：

1. 外部程序或人工流程把候选资源放入 `automation/incoming`。
2. 运行 `npm run import:incoming` 生成 dry-run 导入报告。
3. 人工检查报告。
4. 确认后，未来可以通过显式导入步骤放入 `public/assets`。
5. 运行 `npm run update`。
6. 运行 `npm run build`。

预留目录：

```text
automation/incoming
automation/processed
automation/rejected
automation/logs
```

`scripts/import-incoming-assets.ts` 当前只扫描 `automation/incoming`、检查扩展名和可读性、写入 dry-run 报告。它不会移动、删除、重命名、覆盖、下载或抓取文件。

Arcaea APK 客户端是明确的例外：它使用 `scripts/check-arcaea-apk.ts` 在服务器本地嗅探和缓存，再由 `scripts/stats-server.mjs` 在运行时提供元数据和下载接口，不参与站点构建产物同步。
