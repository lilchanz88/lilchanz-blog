import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { draftSrcExclude } from "./drafts";

/**
 * 构建时生成 RSS 2.0 订阅源（dist/rss.xml）。
 * 数据源：docs/博客/*.md 中排除 draft 的文章，URL 按 teek 的 rewrite 规则
 * 映射为 /博客/<文件名>.html（与 sitemap 一致；文章未使用 permalink）。
 * 新增文章自动进入 RSS，无需维护。
 */
const base = "/lilchanz-blog/";
const siteOrigin = "https://lilchanz88.github.io";
const siteUrl = `${siteOrigin}${base}`;

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const readFrontmatterValue = (file: string, key: string) => {
  const raw = readFileSync(file, "utf-8");
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1] ?? "";
  const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(frontmatter);
  return match?.[1]?.replace(/^["']|["']$/g, "").trim() ?? "";
};

export const generateRss = (outDir: string) => {
  // outDir = docs/.vitepress/dist → docs 目录
  const docsDir = join(outDir, "..", "..");
  const blogDir = join(docsDir, "博客");
  if (!existsSync(blogDir)) return;

  const drafts = new Set(
    (Array.isArray(draftSrcExclude) ? draftSrcExclude : []).map((path) =>
      path.split("/").pop()
    )
  );

  const items = readdirSync(blogDir)
    .filter((file) => file.endsWith(".md") && !drafts.has(file))
    .map((file) => {
      const full = join(blogDir, file);
      const title = readFrontmatterValue(full, "title");
      const desc = readFrontmatterValue(full, "description");
      const date = readFrontmatterValue(full, "date");
      const timestamp = date ? Date.parse(date) : NaN;
      const pubDate = Number.isNaN(timestamp)
        ? ""
        : new Date(timestamp).toUTCString();
      const link = `${siteUrl}${encodeURI(`博客/${file.replace(/\.md$/, ".html")}`)}`;
      return { title, desc, pubDate, timestamp: Number.isNaN(timestamp) ? 0 : timestamp, link };
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "<channel>",
    `  <title>lilchanz'house</title>`,
    `  <link>${siteUrl}</link>`,
    `  <description>代码、思考与生活。记录前端开发、效率工具、编程心得和日常随想。</description>`,
    `  <language>zh-CN</language>`,
    ...items.flatMap((item) => [
      "  <item>",
      `    <title>${escapeXml(item.title)}</title>`,
      `    <link>${item.link}</link>`,
      `    <guid>${item.link}</guid>`,
      item.desc ? `    <description>${escapeXml(item.desc)}</description>` : "",
      item.pubDate ? `    <pubDate>${item.pubDate}</pubDate>` : "",
      "  </item>",
    ]).filter(Boolean),
    "</channel>",
    "</rss>",
  ].join("\n");

  writeFileSync(join(outDir, "rss.xml"), xml, "utf-8");
};
