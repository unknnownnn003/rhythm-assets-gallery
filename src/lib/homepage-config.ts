export const homepageConfig = {
  siteTitle: "音游曲绘下载站",
  metaDescription: "Arcaea 与 Phigros 曲绘、角色立绘、剧情图与封面资源静态图库。",

  hero: {
    eyebrow: "Rhythm Assets",
    title: "更快、更清晰的音游曲绘下载体验",
    description:
      "保留现有静态资源结构与目录兼容性，只优化前端检索、浏览与下载交互，让大图查找和批量收集都更顺手。",
    searchLabel: "搜索资源",
    searchPlaceholder: "输入曲名、画师、曲包、角色、版本号或背景名",
    searchButton: "立即搜索",
    chips: [
      { label: "Arcaea 曲绘", href: "/arcaea?category=%E6%9B%B2%E7%BB%98" },
      { label: "Phigros 曲绘", href: "/phigros?category=%E6%9B%B2%E7%BB%98" },
      { label: "游玩背景", href: "/arcaea?category=%E6%B8%B8%E7%8E%A9%E8%83%8C%E6%99%AF" },
      { label: "全站搜索", href: "/search" },
    ],
  },

  bilibili: {
    enabled: true,
    url: "https://space.bilibili.com/385607044",
    avatar: "/site-icon.png",
    badge: "Bilibili",
    name: "unknnownnn_003",
    description: "站点维护、资源补档与问题反馈入口集中在这里。",
    button: "前往 B 站主页",
  },

  clientDownload: {
    title: "Arcaea 客户端",
    status: "前端位已预留",
    version: "待接入",
    updatedAt: "等待本地缓存源接入",
    downloadCount: "累计下载 — 次",
    href: "",
    button: "等待下载源接入",
    note: "当前分支只做首页前端位，不新增下载后端与服务器任务。",
  },

  announcements: [
    "图库页保留现有静态索引与目录结构。",
    "批量下载将直接读取现有原图链接并前端打包。",
    "本轮优化仅做本地预览，不同步远程服务器。",
  ],

  footer: {
    copyright: "© Unknnownnn Rhythm Assets Gallery",
    assetNote: "图片资源版权归原游戏与作者所有，本站仅做索引整理与学习交流。",
    contact: "如需勘误、补档或移除资源，请通过站点维护者的 B 站主页联系。",
  },
} as const;
