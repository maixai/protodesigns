<script setup lang="ts">
// 组件样板:组件库组件由 themeOverrides 驱动,自绘组件由 CSS 变量驱动。
// 两者取值同源,因此换方向时整块一起变 —— 若某个组件外观纹丝不动,说明它没走 token。
import { NAlert, NButton, NCheckbox, NInput, NSwitch, NTag } from 'naive-ui'
import { ref } from 'vue'

const keyword = ref('')
const checked = ref(true)
const switched = ref(true)
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">组件样板</h2>
    <p class="dl-section__note">
      圆角、密度、字重与强调色的差异在这里最直观地体现出来。
    </p>

    <div class="dl-row">
      <n-button type="primary">主要操作</n-button>
      <n-button>次要操作</n-button>
      <n-button quaternary>轻量操作</n-button>
      <n-button type="primary" disabled>禁用态</n-button>
    </div>

    <div class="dl-row">
      <div class="samples__field">
        <n-input v-model:value="keyword" placeholder="搜索样例记录" />
      </div>
      <n-tag type="primary">进行中</n-tag>
      <n-tag>草稿</n-tag>
    </div>

    <div class="dl-row">
      <n-checkbox v-model:checked="checked">启用通知</n-checkbox>
      <n-switch v-model:value="switched" />
    </div>

    <n-alert class="samples__alert" type="info" title="层级提示">
      提示、卡片与浮层都靠同一套层级机制建立,不要混用。
    </n-alert>
  </section>
</template>

<style scoped>
.samples__field {
  flex: 1 1 12rem;
  min-width: 0;
}

.samples__alert {
  margin-top: var(--dl-space-3);
}
</style>
