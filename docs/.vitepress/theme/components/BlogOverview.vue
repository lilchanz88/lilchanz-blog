<script setup lang="ts">
import { computed, ref } from "vue";
import { useData, withBase } from "vitepress";
import { usePosts } from "vitepress-theme-teek";

interface BlogPost {
  url?: string;
  title?: string;
  date?: string;
  capture?: string;
  frontmatter?: {
    description?: string;
    tags?: string[];
    categories?: string[];
    coverImg?: string;
  };
  description?: string;
}

interface BlogPostCard extends BlogPost {
  category: string;
  wordCount: string | number;
  readingTime: string | number;
}

const posts = usePosts();
const { theme } = useData();
const activeCategory = ref("全部");

const eachFileWords = computed(() => theme.value.docAnalysisInfo?.eachFileWords || []);

const getFileWords = (url = "") => {
  return eachFileWords.value.find((item: any) => {
    const path = `/${item.fileInfo.relativePath.replace(".md", "")}`;
    return [path, `${path}.html`].includes(url);
  });
};

const categoryGroups = computed(() => {
  return Object.entries(posts.value.groupPosts.categories || {})
    .map(([category, items]) => {
      const data = (items as BlogPost[])
        .map((post) => {
          const wordsInfo = getFileWords(post.url);
          return {
            ...post,
            category,
            wordCount: wordsInfo?.wordCount || "-",
            readingTime: wordsInfo?.readingTime || "-",
          };
        })
        .sort((a, b) => new Date(b.date || "").getTime() - new Date(a.date || "").getTime());

      return { category, data };
    })
    .sort((a, b) => b.data.length - a.data.length || a.category.localeCompare(b.category, "zh-CN"));
});

const categories = computed(() => [
  { name: "全部", count: posts.value.sortPostsByDate.length },
  ...categoryGroups.value.map((group) => ({ name: group.category, count: group.data.length })),
]);

const visibleGroups = computed(() => {
  if (activeCategory.value === "全部") return categoryGroups.value;
  return categoryGroups.value.filter((group) => group.category === activeCategory.value);
});

const latestPost = computed(() => posts.value.sortPostsByDate[0] as BlogPost | undefined);

const formatDate = (date = "") => date.split(" ")[0] || date;

const getDescription = (post: BlogPostCard) => {
  return post.frontmatter?.description || post.description || post.capture || "记录一次真实的观察、实践和想法。";
};

const getPostUrl = (post: BlogPostCard) => (post.url ? withBase(post.url) : "#");
</script>

<template>
  <section class="blog-overview" aria-label="博客文章总览">
    <div class="blog-overview__hero">
      <div>
        <p class="blog-overview__eyebrow">文章总览</p>
        <h1>按你的节奏，找到想读的内容</h1>
        <p class="blog-overview__intro">
          这里收集技术工具、开发体验和日常随想。先扫标题和摘要，再决定要不要深入读。
        </p>
      </div>

      <div class="blog-overview__stats" aria-label="博客统计">
        <span>{{ posts.sortPostsByDate.length }} 篇文章</span>
        <span>{{ categories.length - 1 }} 个分类</span>
        <span v-if="latestPost">最近更新 {{ formatDate(latestPost.date) }}</span>
      </div>
    </div>

    <div class="blog-overview__tools" aria-label="文章浏览工具">
      <div class="blog-overview__filters" aria-label="分类筛选">
        <button
          v-for="category in categories"
          :key="category.name"
          type="button"
          :class="{ active: activeCategory === category.name }"
          :aria-pressed="activeCategory === category.name"
          @click="activeCategory = category.name"
        >
          {{ category.name }}
          <span>{{ category.count }}</span>
        </button>
      </div>

      <div class="blog-overview__quicklinks">
        <a :href="withBase('/tags.html')">按标签浏览</a>
        <a :href="withBase('/categories.html')">全部分类</a>
      </div>
    </div>

    <div class="blog-overview__groups">
      <section v-for="group in visibleGroups" :key="group.category" class="blog-overview__group">
        <header class="blog-overview__group-header">
          <h2>{{ group.category }}</h2>
          <span>{{ group.data.length }} 篇</span>
        </header>

        <div class="blog-overview__list">
          <article v-for="post in group.data" :key="post.url" class="blog-overview__card">
            <a class="blog-overview__cover" :href="getPostUrl(post)" aria-hidden="true" tabindex="-1">
              <img v-if="post.frontmatter?.coverImg" :src="withBase(post.frontmatter.coverImg)" :alt="post.title" />
            </a>

            <div class="blog-overview__content">
              <div class="blog-overview__meta">
                <span>{{ post.category }}</span>
                <time :datetime="formatDate(post.date)">{{ formatDate(post.date) }}</time>
                <span>{{ post.readingTime }}</span>
              </div>

              <h3>
                <a :href="getPostUrl(post)">{{ post.title }}</a>
              </h3>

              <p>{{ getDescription(post) }}</p>

              <div class="blog-overview__tags">
                <span v-for="tag in post.frontmatter?.tags || []" :key="tag"># {{ tag }}</span>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>
