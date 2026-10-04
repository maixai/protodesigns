<script setup lang="ts">
// token 隔离证明:两个按钮的代码几乎一样,唯一的差别是是否引用 token。
//
// 把它并排放进三个方向里看 —— 走 token 的按钮每列都不同,硬编码的按钮三列完全一致。
// 这就是"组件是否真的只消费 token"的可视化判据,也是评审可以机械核对的一条。
</script>

<template>
  <section class="dl-section">
    <h2 class="dl-section__title">token 隔离证明</h2>
    <p class="dl-section__note">
      在并排对比页上看:左侧按钮三列各不相同,右侧按钮三列完全相同。
    </p>

    <div class="proof">
      <div class="proof__cell">
        <span class="proof__tag proof__tag--ok">走 token</span>
        <button type="button" class="proof__btn">
          主要操作
        </button>
      </div>
      <div class="proof__cell">
        <span class="proof__tag proof__tag--bad">硬编码</span>
        <button type="button" class="dl-anti-hardcoded">
          主要操作
        </button>
      </div>
    </div>

    <p class="proof__how">
      机械核对方式:对 <code>src/components</code> 与 <code>src/pages</code> 执行
      <code>grep -rnE '#[0-9a-fA-F]{3,8}|[0-9]+px'</code>,应当只命中 token 定义与注释。
    </p>
  </section>
</template>

<style scoped>
.proof {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: var(--dl-space-3);
}

.proof__cell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--dl-space-2);
}

.proof__tag {
  font-size: var(--dl-font-size-xs);
  font-weight: var(--dl-weight-strong);
  letter-spacing: var(--dl-tracking-label);
}

.proof__tag--ok {
  color: var(--dl-success);
}

.proof__tag--bad {
  color: var(--dl-error);
}

.proof__btn {
  min-height: var(--dl-control-height);
  padding: 0 var(--dl-space-3);
  font-family: inherit;
  font-size: var(--dl-font-size-sm);
  font-weight: var(--dl-weight-medium);
  color: var(--dl-text-on-accent);
  background: var(--dl-accent);
  border: none;
  border-radius: var(--dl-radius-md);
  cursor: pointer;
}

.proof__how {
  margin: var(--dl-space-3) 0 0;
  font-size: var(--dl-font-size-xs);
  line-height: var(--dl-line-body);
  color: var(--dl-text-tertiary);
  overflow-wrap: anywhere;
}

code {
  font-size: var(--dl-font-size-xs);
  color: var(--dl-text-secondary);
}
</style>
