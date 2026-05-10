export const homepageConfig = {
  siteTitle: "音游曲绘下载站",
  metaDescription: "Arcaea 与 Phigros 曲绘、角色和曲包封面下载站，支持搜索、分类浏览和原图下载。",

  hero: {
    eyebrow: "Rhythm Assets",
    title: "曲绘下载站",
    description:
      "这里主要放 Arcaea 和 Phigros 的曲绘、角色、曲包封面等图片资源。想找图就搜关键词，也可以按游戏和分类慢慢翻。",
    searchLabel: "搜索曲绘",
    searchPlaceholder: "搜曲名、角色、曲包或文件名",
    searchButton: "搜索",
  },

  bilibili: {
    enabled: true,
    mid: "385607044",
    url: "https://space.bilibili.com/385607044",
    avatar: "/site-icon.png",
    badge: "Bilibili",
    name: "Unknnownnn",
    fansFallback: "见主页",
    syncLabel: "实时粉丝数以 B 站主页为准",
    description: "这里展示站点所有者的 B 站入口和账号信息，也会放一些相关内容和更新入口。",
    button: "打开 B 站主页",
  },

  stats: {
    totalAssetsLabel: "张图片",
    categoryShortcutLabel: "个分类入口",
  },

  games: {
    arcaeaDescription: "个分类，可直接浏览曲绘文件",
    phigrosDescription: "个分类，可直接浏览曲绘文件",
    entryCta: "进入资源浏览",
  },

  sections: {
    categoriesEyebrow: "Categories",
    categoriesTitle: "按分类找",
    recentEyebrow: "Recent",
    recentTitle: "最近加进来的图",
    generatedPrefix: "索引生成：",
    overviewEyebrow: "Overview",
    overviewTitle: "站内现在有这些",
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
    heroMinHeight: "340px",
    heroTitleMax: "4.4rem",
    accent: "#0f766e",
    accentStrong: "#0f4f66",
    bilibiliPink: "#fb7299",
  },
} as const;
