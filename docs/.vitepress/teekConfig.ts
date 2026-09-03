import { defineTeekConfig } from "vitepress-theme-teek/config";
import { version } from "vitepress-theme-teek/es/version";
import { draftFilenames, draftGlobPatterns } from "./drafts";

export const teekConfig = defineTeekConfig({
  teekHome: true, // 开启博客首页
  vpHome: false, // 隐藏 VP 默认首页
  sidebarTrigger: true, // 侧边栏折叠功能
  // 从 sidebar / doc-analysis 数据中剔除草稿（draft: true，见 drafts.ts）
  // 注意：插件选项必须放在 vitePlugins 下才会被 teek 读取
  vitePlugins: {
    sidebarOption: { initItems: false, ignoreList: draftFilenames },
    docAnalysisOption: { ignoreList: draftFilenames },
    mdH1Option: { ignoreList: draftFilenames },
    // 文章列表/搜索元数据来自 file-content-loader，走 fast-glob ignore（需 glob 模式）
    fileContentLoaderIgnore: draftGlobPatterns,
  },
  author: { name: "lilchanz", link: "https://github.com/lilchanz88" },
  banner: {
    name: "lilchanz'house",
    bgStyle: "fullImg",
    imgSrc: "/blog/legendary-warrior-hero-1920.webp",
    imgWaves: false,
    mask: true,
    maskBg: "rgba(0, 0, 0, 0.42)",
    description: "代码、思考与生活",
    descStyle: "default",
  },
  footerInfo: {
    theme: {
      name: `Theme By Teek@${version}`,
    },
    copyright: {
      createYear: 2025,
      suffix: "lilchanz",
    },
  },
  codeBlock: {
    copiedDone: (TkMessage) => TkMessage.success("复制成功！"),
  },
  articleShare: { enabled: true },
});
