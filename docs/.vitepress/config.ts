import { defineConfig } from "vitepress";
import { readFileSync } from "node:fs";
import { createRewrites } from "vitepress-theme-teek/config";
import llmstxt from "vitepress-plugin-llms";
import { teekConfig } from "./teekConfig";
// 构建时排除 draft: true 的文章（teek 主题的 draft 只在前端隐藏列表）
import { draftSrcExclude } from "./drafts";
// 构建时生成 RSS 订阅源（dist/rss.xml）
import { generateRss } from "./rss";

const base = "/lilchanz-blog/";
const siteOrigin = "https://lilchanz88.github.io";
const siteUrl = `${siteOrigin}${base}`;
const siteTitle = "lilchanz'house";
const description =
  "代码、思考与生活。记录前端开发、效率工具、编程心得和日常随想。";
const keywords = "前端开发, Node.js, TypeScript, 效率工具, 编程心得, 随想";

const toHtmlPath = (path: string) => {
  const normalized = path.replace(/^\/+/, "").replace(/\/$/, "");
  if (!normalized) return "";
  return normalized.endsWith(".html") ? normalized : `${normalized}.html`;
};

const toSitemapPath = (path: string) => {
  const basePath = base.replace(/\/$/, "");
  const pathname = path.startsWith("http")
    ? new URL(path).pathname
    : `/${path.replace(/^\/+/, "")}`;

  if (pathname === "/" || pathname === basePath) return base;
  if (pathname.startsWith(base)) return pathname;
  return `${basePath}${pathname}`;
};

const cjkOrWordTokenizer = (text: string) => {
  const segments =
    text.match(
      /[\p{Script=Han}]+|[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[a-z0-9][a-z0-9+#._-]*/giu
    ) ?? [];

  return segments.flatMap((segment) => {
    if (!/[\p{Script=Han}]/u.test(segment)) return segment;
    if (segment.length <= 2) return segment;

    const grams = new Set([segment]);
    for (let size = 2; size <= Math.min(4, segment.length); size += 1) {
      for (let index = 0; index <= segment.length - size; index += 1) {
        grams.add(segment.slice(index, index + size));
      }
    }
    return [...grams];
  });
};

const headingRegex = /<h(\d*).*?>(.*?<a.*? href="#.*?".*?>.*?<\/a>)<\/h\1>/gi;
const headingContentRegex = /(.*?)<a.*? href="#(.*?)".*?>.*?<\/a>/i;

const clearHtmlTags = (value: string) => value.replace(/<[^>]*>/g, "");

const readFrontmatterValue = (file: string, key: string) => {
  const raw = readFileSync(file, "utf-8");
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1] ?? "";
  const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(frontmatter);
  return match?.[1]?.replace(/^["']|["']$/g, "").trim() ?? "";
};

const splitSearchSections = (file: string, html: string) => {
  const pageTitle = readFrontmatterValue(file, "title");
  const pageDescription = readFrontmatterValue(file, "description");
  const sections: Array<{ anchor?: string; titles: string[]; text: string }> = [];

  if (pageTitle) {
    sections.push({
      titles: [pageTitle],
      text: [pageTitle, pageDescription].filter(Boolean).join("\n"),
    });
  }

  const result = html.split(headingRegex);
  result.shift();
  let parentTitles: string[] = [];

  for (let index = 0; index < result.length; index += 3) {
    const level = Number.parseInt(result[index], 10) - 1;
    const heading = result[index + 1];
    const headingResult = headingContentRegex.exec(heading);
    const title = clearHtmlTags(headingResult?.[1] ?? "").trim();
    const anchor = headingResult?.[2] ?? "";
    const content = result[index + 2];
    if (!title || !content) continue;

    let titles = parentTitles.slice(0, level);
    titles[level] = title;
    titles = titles.filter(Boolean);
    sections.push({
      anchor,
      titles,
      text: clearHtmlTags(content),
    });

    if (level === 0) parentTitles = [title];
    else parentTitles[level] = title;
  }

  return sections;
};

// https://vitepress.dev/reference/site-config
export default defineConfig({
  extends: teekConfig,
  base,
  title: siteTitle,
  description,
  cleanUrls: false,
  rewrites: createRewrites({ srcDir: "docs" }),
  srcExclude: draftSrcExclude.length ? draftSrcExclude : undefined,
  lastUpdated: true,
  lang: "zh-CN",
  head: [
    [
      "link",
      { rel: "icon", type: "image/svg+xml", href: `${base}teek-logo-mini.svg` },
    ],
    ["link", { rel: "icon", type: "image/png", href: `${base}teek-logo-mini.png` }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:locale", content: "zh-CN" }],
    ["meta", { property: "og:site_name", content: siteTitle }],
    ["meta", { property: "og:image", content: `${siteUrl}teek-logo-large.png` }],
    ["meta", { name: "author", content: "lilchanz" }],
    ["meta", { name: "keywords", content: keywords }],
  ],
  transformPageData(pageData) {
    const pageDescription =
      pageData.description || pageData.frontmatter.description || description;
    const pageTitle =
      pageData.title && pageData.title !== siteTitle
        ? `${pageData.title} | ${siteTitle}`
        : siteTitle;
    const permalink =
      typeof pageData.frontmatter.permalink === "string"
        ? pageData.frontmatter.permalink
        : "";
    const pagePath = permalink
      ? toHtmlPath(permalink)
      : pageData.relativePath === "index.md"
        ? ""
        : pageData.relativePath.replace(/\.md$/, ".html");
    const pageUrl = `${siteUrl}${pagePath}`;

    pageData.frontmatter.head = [
      ...(pageData.frontmatter.head || []),
      ["link", { rel: "canonical", href: pageUrl }],
      ["meta", { property: "og:title", content: pageTitle }],
      ["meta", { property: "og:description", content: pageDescription }],
      ["meta", { property: "og:url", content: pageUrl }],
      ["meta", { name: "twitter:card", content: "summary_large_image" }],
      ["meta", { name: "twitter:title", content: pageTitle }],
      ["meta", { name: "twitter:description", content: pageDescription }],
    ];
  },
  markdown: {
    // 开启行号
    lineNumbers: true,
    image: {
      // 默认禁用；设置为 true 可为所有图片启用懒加载。
      lazyLoading: true,
    },
    // 更改容器默认值标题
    container: {
      tipLabel: "提示",
      warningLabel: "警告",
      dangerLabel: "危险",
      infoLabel: "信息",
      detailsLabel: "详细信息",
    },
  },
  sitemap: {
    hostname: siteOrigin,
    transformItems: (items) => {
      return items
        .map((item) => ({ ...item, url: toSitemapPath(item.url) }))
        .filter(
          (item) =>
            !item.url.includes("/@pages/") &&
            !item.url.endsWith("/login.html") &&
            !item.url.endsWith("/risk-link.html")
        );
    },
  },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    darkModeSwitchLabel: "主题",
    sidebarMenuLabel: "菜单",
    returnToTopLabel: "返回顶部",
    lastUpdatedText: "上次更新时间",
    outline: {
      level: [2, 4],
      label: "本页导航",
    },
    docFooter: {
      prev: "上一页",
      next: "下一页",
    },
    sidebar: {},
    nav: [
      { text: "首页", link: "/" },
      { text: "博客", link: "/articleOverview" },
      { text: "归档", link: "/archives" },
      { text: "关于", link: "/关于/关于" },
    ],
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/lilchanz88",
      },
    ],
    search: {
      provider: "local",
      options: {
        miniSearch: {
          options: {
            tokenize: cjkOrWordTokenizer,
          },
          searchOptions: {
            combineWith: "AND",
            prefix: true,
            fuzzy: 0.2,
            boost: {
              title: 5,
              text: 2,
              titles: 1.5,
            },
          },
          _splitIntoSections: splitSearchSections,
        },
      },
    },
    editLink: {
      text: "在 GitHub 上编辑此页",
      pattern:
        "https://github.com/lilchanz88/lilchanz-blog/edit/main/docs/:path",
    },
  },
  vite: {
    plugins: [llmstxt() as any],
  },
  buildEnd(siteConfig) {
    generateRss(siteConfig.outDir);
  },
});
