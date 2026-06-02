# Arcaea 自动更新脚本用法

## 整体流程

当 Arcaea 发布新版本 APK 后，按以下步骤更新网站资源：

```
准备新旧两版 APK → 提取新增图片 → 手动超分 → 压缩超分图片 → 同步到远程服务器 → 更新元信息/重新生成站点
```

## 前置条件

- 本地需安装 `tar`（Windows 可用 Git Bash 自带的，或安装 `tar` 命令）
- 新旧两版 Arcaea APK 文件（或已解压的目录）
- Node.js >= 22.12.0

---

## 第一步：提取新增/变更的图片资源

### 命令

```powershell
npm run arcaea:extract -- --new "新版APK路径" --old "旧版APK路径" --out "输出目录"
```

### 示例

```powershell
npm run arcaea:extract -- --new "D:\Files\曲绘\Arcaea\APK\arcaea_6.15.0.apk" --old "D:\Files\曲绘\Arcaea\APK\arcaea_6.14.0c.apk" --out "D:\Files\曲绘\Arcaea\曲绘（85）6.15.0"
```

### 参数说明

| 参数 | 必需 | 说明 |
| ---- | ---- | ---- |
| `--new` | 是 | 新版 APK 文件路径，或已解压的目录。传目录时可以是 APK 解压根目录或其中的 `assets` 目录 |
| `--old` | 是 | 旧版 APK 文件路径，或已解压的目录，规则同上 |
| `--out` | 是 | 提取结果输出目录，脚本会在其下创建分类子目录 |

### 脚本行为

- **只读不写**：不会修改原始 APK、已解压目录、`public/assets` 或远程资源目录
- **选择性抽取**：只抽取站点会用到的图片资源，不解包音频、模型、谱面等大文件
- **SHA-1 对比**：对比新旧两版相同路径文件的 SHA-1，只复制新增或内容变化的图片
- **跳过 `_256`**：忽略歌曲目录中的 `_256` 压缩曲绘

### 输出目录结构

脚本会在 `--out` 指定的目录下创建以下分类子目录：

| 子目录 | 内容 |
| ------ | ---- |
| `曲绘/` | 歌曲 1080_base 曲绘（含独立难度 `_3`/`_4`） |
| `曲包封面/` | Pack 封面、选择封面、章节分隔图 |
| `剧情/cg/` | 剧情 CG 图片 |
| `剧情贴图/` | 剧情用的 VN 贴图资源 |
| `角色/立绘/` | 搭档立绘 |
| `角色/头像/` | 搭档头像 |
| `角色/LinkPlay预览/` | LinkPlay 多人模式搭档预览 |
| `游玩背景/` | 游玩时的背景图 |
| `LinkPlay贴纸/` | 多人模式贴纸 |
| `世界模式/` | 世界模式相关图片 |
| `启动页面/` | 启动页面图片 |
| `_metadata/` | 新版 `songlist`、`packlist`、`char/characters.json`、`story2/ordering` 副本 |

输出根目录还会生成 `arcaea-update-report.json`，记录复制了哪些文件。

### 曲绘命名规则

曲绘输出文件名会在原始文件名前加可读前缀：

```
曲名_曲师_版本_曲包_IDX xxx_BPM xxx_SIDE x_游玩背景_难度标识_定数_谱师_曲绘_[原始文件名]
```

- 如果文件是 `1080_base_3` 或 `1080_base_4`（独立难度曲绘），前缀会优先使用该难度自己的曲名、曲师、BPM、背景、谱师、曲绘画师和显示难度，不会和普通难度信息混淆
- 原始文件名（如 `1080_base.jpg`）保留在末尾
- 角色资源会从 `char/characters.json` 读取搭档名，输出文件名优先使用中文名并附带英文名，原始数字文件名保留在末尾

---

## 第二步：压缩手动超分后的图片

这一步必须在你手动超分完成后单独运行，不要和提取命令串在一起。

```powershell
npm run arcaea:compress -- --dir "D:\Files\曲绘\Arcaea\曲绘（85）6.15.0"
```

脚本逻辑来自 `D:\Files\曲绘\Arcaea\compress.py`：

- 递归查找文件名以 `_optimization` 结尾的 `.png`、`.jpg`、`.jpeg`
- 输出同目录 `_opt.jpg`
- JPEG 质量默认 `95`
- 透明图用白底合成，输出 RGB JPEG
- 转换成功后默认删除原始 `_optimization` 文件，避免站点同时扫到超分源图和压缩图
- 默认不覆盖已存在的 `_opt.jpg`，需要覆盖时加 `--overwrite`
- 输出 `arcaea-compress-report.json`

常用命令：

```powershell
npm run arcaea:compress -- --dir "D:\Files\曲绘\Arcaea\曲绘（85）6.15.0" --overwrite
npm run arcaea:compress -- --dir "D:\Files\曲绘\Arcaea\曲绘（85）6.15.0" --keep-original
npm run arcaea:compress -- --quality 95
```

---

## 第三步：同步到远程服务器

确认超分和压缩结果无误后，单独运行发布命令：

```powershell
npm run arcaea:publish -- -LocalDir "D:\Files\曲绘\Arcaea\曲绘（85）6.15.0"
```

默认行为：

- 从目录名推断版本号，例如 `曲绘（85）6.15.0` 会推断为 `6.15.0`
- 远程目标目录默认为 `DEPLOY_REMOTE_ASSET_ROOT/Arcaea（至版本号）`
- 如果远程目标目录不存在，先从服务器上最新旧版 `Arcaea（至x.x.x）` 复制一份作为基底
- 上传本地更新目录里的图片分类子目录，跳过 `_metadata` 和报告文件
- 上传成功后，默认把上一版 Arcaea 目录移到 `DEPLOY_REMOTE_WORK_PATH/asset-backups/arcaea/时间戳/`
- 最后自动执行 `.\scripts\deploy.ps1 -Mode remote-build`

只同步原图、不触发远程构建：

```powershell
npm run arcaea:publish -- -LocalDir "D:\Files\曲绘\Arcaea\曲绘（85）6.15.0" -SkipDeploy
```

---

## 第四步：更新网站元信息

APK 里的 `songlist`、`packlist`、`story2/ordering` 等文件包含了歌曲、曲包、剧情、难度、搭档等关联数据，网站扫描器需要这些信息来增强索引。

### 命令

```powershell
npm run arcaea:metadata -- --assets-dir "新版APK解压后的assets目录"
```

### 示例

```powershell
npm run arcaea:metadata -- --assets-dir "D:\Files\曲绘\Arcaea\APK\arcaea_6.15.0\assets"
```

### 脚本读取的文件

| 文件路径 | 内容 |
| -------- | ---- |
| `songs/songlist` | 歌曲列表（含曲名、曲师、BPM、SIDE、背景、版本、各难度定数/谱师/画师） |
| `songs/packlist` | 曲包列表（含本地化名称、父包关系、章节分区） |
| `char/characters.json` | 搭档列表（含中文/日文/韩文搜索名、英文名、关联曲包 ID） |
| `app-data/story2/ordering` | 剧情章节/节点结构（含剧情标题、类型、关联角色、解锁曲包） |
| `app-data/story/main/entries_*` | 主线剧情节点详情（CG 路径、解锁曲目 ID） |
| `app-data/story/side/entries_*` | 支线剧情节点详情 |

### 输出文件

```text
scripts/data/arcaea-metadata.json
```

这个 JSON 文件会被 `npm run scan` 读取，用于增强网站索引中的以下信息：

- 曲绘 → 歌曲 ID、曲名、曲师、曲包、版本、BPM、SIDE、游玩背景、反转背景
- 独立难度曲绘 → 对应难度自己的曲名、曲师、显示难度、谱师、曲绘画师、BPM、背景
- 曲包名称 → `name_localized` 本地化显示名；存在 `pack_parent` 时附带父包上下文
- 角色立绘/头像/LinkPlay → 优先关联 `characters.json` 中的中文搭档名、英文名和 `pack_id` 曲包；旧 `搭档列表.CSV` 只作为兜底
- 剧情 CG → 章节名、节点号、剧情类型、解锁曲包、关联曲目和角色
- 剧情贴图 → 按目录名匹配剧情章节

---

## 第五步：重新生成站点

更新元信息后，重新扫描、生成缩略图和站点：

```powershell
npm run update
npm run build
```

`npm run update` 等于：

```text
npm run scan && npm run thumbs && npm run sitemap
```

---

## 第六步：部署到服务器（可选）

```powershell
.\scripts\deploy.ps1 -Mode remote-build
```

---

## 快速参考

| 目标 | 命令 |
| ---- | ---- |
| 提取新增图片 | `npm run arcaea:extract -- --new <新> --old <旧> --out <输出>` |
| 压缩超分图片 | `npm run arcaea:compress -- --dir <输出目录>` |
| 同步到远程并部署 | `npm run arcaea:publish -- -LocalDir <输出目录>` |
| 更新元信息 | `npm run arcaea:metadata -- --assets-dir <assets目录>` |
| 重新扫描+缩略图 | `npm run update` |
| 构建站点 | `npm run build` |

提取、压缩、同步这三个阶段必须分开执行，中间保留手动超分和人工确认空间。
