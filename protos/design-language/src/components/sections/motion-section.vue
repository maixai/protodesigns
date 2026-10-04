<script setup lang="ts">
// 动效:把鼠标移到色块上感受时长与缓动的差别。
// 三档时长与统一缓动曲线是跨端一致性的前提 —— Flutter 侧必须取同一组值。
const DURATIONS = [
  { token: 'fast', usage: 'hover / 焦点反馈' },
  { token: 'base', usage: '展开 / 切换' },
  { token: 'slow', usage: '浮层进出' },
] as const
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">动效</h2>
    <p class="dl-section__note">
      把指针移到下面的色块上:hover 反馈用的就是该档时长。
    </p>

    <div class="motions">
      <div v-for="item in DURATIONS" :key="item.token" class="motion">
        <div
          class="motion__box"
          :style="{ '--motion-duration': `var(--dl-duration-${item.token})` }"
        >
          <span class="motion__label">hover</span>
        </div>
        <code class="motion__token">--dl-duration-{{ item.token }}</code>
        <span class="motion__usage">{{ item.usage }}</span>
      </div>
    </div>

    <p class="easing">
      缓动统一取 <code>--dl-ease-standard</code>;进度类动画才允许另取曲线,且必须集中定义。
    </p>
  </section>
</template>

<style scoped>
.motions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
  gap: var(--dl-space-3);
}

.motion {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--dl-space-1);
  text-align: center;
}

.motion__box {
  display: grid;
  place-items: center;
  width: 100%;
  height: 3rem;
  background: var(--dl-bg-sunken);
  border: var(--dl-border-width) solid var(--dl-border-base);
  border-radius: var(--dl-radius-md);
  transition:
    background var(--motion-duration) var(--dl-ease-standard),
    transform var(--motion-duration) var(--dl-ease-standard);
}

.motion__box:hover {
  background: var(--dl-accent-subtle);
  transform: translateY(-2px);
}

.motion__label {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.motion__token {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}

.motion__usage {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

.easing {
  margin: var(--dl-space-3) 0 0;
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-tertiary);
}

code {
  font-size: var(--dl-font-size-xs);
}
</style>
