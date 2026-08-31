<script setup lang="ts">
// astra 橱窗壳层：极简 header（brand + works/about 两个导航）+ router-view + 一行 footer。
// 深站的所有 chrome（登录/上传/通知/语言切换/论坛壳）在此域名下不存在。
</script>

<template>
  <div class="ax-root">
    <header class="ax-header">
      <div class="ax-bar">
        <RouterLink to="/" class="ax-brand">
          <span class="ax-brand-dot" aria-hidden="true"></span>
          astra<span class="ax-brand-sub">canary collection</span>
        </RouterLink>
        <nav class="ax-nav">
          <RouterLink to="/">works</RouterLink>
          <RouterLink to="/about">about</RouterLink>
        </nav>
      </div>
    </header>

    <main class="ax-main">
      <RouterView />
    </main>

    <footer class="ax-footer">
      <div class="ax-bar">
        <span>astra canary collection · grey-test outputs</span>
        <RouterLink to="/about">request access</RouterLink>
      </div>
    </footer>
  </div>
</template>
