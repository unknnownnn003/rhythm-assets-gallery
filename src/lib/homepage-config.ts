export const homepageConfig = {
  siteTitle: "音游曲绘下载站",
  metaDescription: "高清 Arcaea 与 Phigros 曲绘、角色立绘、剧情 CG 和封面图库，支持一键搜索与批量下载。",

  hero: {
    eyebrow: "Rhythm Assets",
    title: "Arcaea & Phigros\n曲绘资源库",
    description:
      "收录曲绘、立绘、剧情 CG、游玩背景等高清素材，支持多条件筛选与批量下载。",
    searchLabel: "搜索资源",
    searchPlaceholder: "搜曲名、画师、曲包，多个关键词用空格分开",
    searchButton: "搜索",
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
    description: "资源补档、问题反馈、更新预告都在这里，欢迎来玩。",
    button: "前往 B 站主页",
  },

  clientDownload: {
    title: "Arcaea 客户端",
    status: "暂无新版",
    version: "待接入",
    updatedAt: "暂无",
    downloadCount: "暂无",
    href: "",
    button: "暂无可用版本",
    note: "",
  },

  announcements: [
    "曲绘图片版权归原游戏与画师所有，本站仅提供索引整理。",
    "批量下载功能已上线：选中图片后，点击底部按钮即可打包为 ZIP。",
  ],

  footer: {
    copyright: "© Unknnownnn Rhythm Assets Gallery",
    assetNote: "图片资源版权归原游戏与作者所有，本站仅做索引整理与学习交流。",
    contact: "如需勘误、补档或移除资源，请通过站点维护者的 B 站主页联系。",
  },
} as const;
