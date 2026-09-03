import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * 构建时扫描 frontmatter 里 draft: true 的文章。
 * teek 主题的 draft 只在前端隐藏列表，不排除的话：
 *   - 页面/搜索/sitemap 仍会发布（用 srcExclude 解决，见 config.ts）
 *   - sidebar / doc-analysis 数据仍会收录（用 ignoreList 解决，见 teekConfig.ts）
 * 本模块统一扫描，两处共用，未来新草稿自动生效。
 */
const scanDrafts = (): string[] => {
  for (const dir of ["docs", "."]) {
    const blogDir = join(process.cwd(), dir, "博客");
    if (!existsSync(blogDir)) continue;
    return readdirSync(blogDir)
      .filter(
        (file) =>
          file.endsWith(".md") &&
          readFrontmatterValue(join(blogDir, file), "draft") === "true"
      )
      .map((file) => `博客/${file}`);
  }
  return [];
};

const readFrontmatterValue = (file: string, key: string) => {
  const raw = readFileSync(file, "utf-8");
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1] ?? "";
  const match = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(frontmatter);
  return match?.[1]?.replace(/^["']|["']$/g, "").trim() ?? "";
};

const draftFiles = scanDrafts();

/** VitePress srcExclude 用的 glob 路径 */
export const draftSrcExclude = draftFiles.length ? draftFiles : undefined;

/** teek 插件 ignoreList 用的文件名列表（按 basename 匹配） */
export const draftFilenames = draftFiles.map((file) => file.split("/").pop()!);

/** fileContentLoaderIgnore 用的 glob 模式（fast-glob 按相对路径匹配，需加 glob 星号前缀） */
export const draftGlobPatterns = draftFilenames.map((name) => `**/${name}`);
