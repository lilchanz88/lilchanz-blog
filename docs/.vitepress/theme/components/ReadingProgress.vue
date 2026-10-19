<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useData } from "vitepress";

const { page, frontmatter } = useData();
const progress = ref(0);
let raf = 0;

// 只在文章正文页显示，首页和工具页不打扰
const enabled = computed(
  () => frontmatter.value.layout !== "home" && page.value.relativePath.startsWith("博客/")
);

const update = () => {
  const doc = document.documentElement;
  const max = doc.scrollHeight - doc.clientHeight;
  progress.value = max > 8 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0;
};

const onScroll = () => {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(update);
};

onMounted(() => {
  if (!enabled.value) return;
  update();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("resize", onScroll);
  cancelAnimationFrame(raf);
});
</script>

<template>
  <div v-if="enabled" class="reading-progress" aria-hidden="true">
    <span class="reading-progress__bar" :style="{ width: `${progress * 100}%` }" />
  </div>
</template>

<style scoped>
.reading-progress {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 40;
  width: 100%;
  height: 2.5px;
  pointer-events: none;
  background: transparent;
}

.reading-progress__bar {
  display: block;
  width: 0;
  height: 100%;
  background: linear-gradient(90deg, #22d3ee, #a78bfa);
  box-shadow: 0 0 12px rgba(34, 211, 238, 0.55);
  transition: width 0.12s linear;
}

@media (prefers-reduced-motion: reduce) {
  .reading-progress__bar {
    transition: none;
  }
}
</style>
