export const homepageConfig = {
  siteTitle: "音游曲绘下载站",
  metaDescription: "Arcaea 与 Phigros 曲绘、角色下载站，支持搜索、分类浏览和原图下载。",

  hero: {
    eyebrow: "Picture Assets",
    title: "曲绘下载站",
    description:
      "Arcaea 和 Phigros 图片资源检索，支持搜索与筛选。",
    searchLabel: "搜索曲绘",
    searchPlaceholder: "搜曲名、角色、曲包或文件名",
    searchButton: "搜索",
  },

  bilibili: {
    enabled: true,
    url: "https://space.bilibili.com/385607044",
    avatar: "/site-icon.png",
    badge: "Bilibili",
    name: "unknnownnn_003",
    description: "up主个人主页，欢迎问题反馈与交流",
    button: "B 站主页",
  },

  stats: {
    totalAssetsLabel: "张图片",
    categoryShortcutLabel: "个分类",
  },

  games: {
    arcaeaDescription: "个分类",
    phigrosDescription: "个分类",
    entryCta: "进入",
  },

  sections: {
    categoriesEyebrow: "分类",
    categoriesTitle: "分类浏览",
    recentEyebrow: "最新",
    recentTitle: "最近更新",
    generatedPrefix: "最后更新时间：",
    overviewEyebrow: "概览",
    overviewTitle: "站点一览",
    categoryUnit: "个分类",
    unknownSize: "未知大小",
  },

  footer: {
    copyright: "© Unknnownnn Rhythm Assets Gallery",
    assetNote: "图片资源版权归原游戏与作者所有，本站仅作整理索引与学习交流。",
    contact: "如需移除或修正资源信息，请通过站点所有者的 B 站主页联系。",
  },

  theme: {
    maxWidth: "1180px",
    heroMinHeight: "310px",
    heroTitleMax: "4.4rem",
    accent: "#0f766e",
    accentStrong: "#0f4f66",
    bilibiliPink: "#fb7299",
  },
} as const;
