<script setup lang="ts" name="TeekLayoutProvider">
import Teek from "vitepress-theme-teek";
import ContributeChart from "./ContributeChart.vue";
import NotFound from "./404.vue";
import ChatWidget from "./ChatWidget.vue";
import ReadingProgress from "./ReadingProgress.vue";
</script>

<template>
  <Teek.Layout>
    <template #teek-archives-top-before>
      <ContributeChart />
    </template>

    <template #not-found>
      <NotFound />
    </template>

    <template #teek-home-banner-content-after>
      <div class="home-hero-actions">
        <a class="home-hero-actions__primary" href="/lilchanz-blog/articleOverview.html">开始阅读</a>
        <a class="home-hero-actions__secondary" href="/lilchanz-blog/%E5%B7%A5%E5%85%B7/%E5%9C%A8%E7%BA%BF%E5%B7%A5%E5%85%B7.html">在线工具</a>
      </div>
    </template>

    <template #layout-bottom>
      <ReadingProgress />
      <ChatWidget />
    </template>
  </Teek.Layout>
</template>

<style lang="scss">
.tk-my.is-circle-bg {
  margin-bottom: 20px;

  .tk-my__avatar.circle-rotate {
    margin-top: 200px;
  }
}
</style>
