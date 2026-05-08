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
```

`npm run update` 等于：

```text
npm run scan + npm run thumbs
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
