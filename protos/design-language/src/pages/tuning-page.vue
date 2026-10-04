<script setup lang="ts">
// 调教台:青瓷已定稿,这一页用来把各要素的取值逐项调准。
//
// 区块顺序 = 规范草案的阅读顺序:从语言总览与材质,到排版调教,
// 再到色板 / 角色层 / 结构 / 组件 / 状态 / 无障碍边界。
import DirColumn from '../components/dir-column.vue'
import AsyncStatesSection from '../components/sections/async-states-section.vue'
import ColorRampSection from '../components/sections/color-ramp-section.vue'
import ComponentSamplesSection from '../components/sections/component-samples-section.vue'
import DoDontSection from '../components/sections/do-dont-section.vue'
import InteractionStatesSection from '../components/sections/interaction-states-section.vue'
import MaterialsSection from '../components/sections/materials-section.vue'
import MotionSection from '../components/sections/motion-section.vue'
import NaiveMappingSection from '../components/sections/naive-mapping-section.vue'
import OverviewSection from '../components/sections/overview-section.vue'
import RadiusSection from '../components/sections/radius-section.vue'
import RoleTokenSection from '../components/sections/role-token-section.vue'
import SemanticColorSection from '../components/sections/semantic-color-section.vue'
import ShadowSection from '../components/sections/shadow-section.vue'
import SpecExtrasSection from '../components/sections/spec-extras-section.vue'
import SpacingSection from '../components/sections/spacing-section.vue'
import ThemeSection from '../components/sections/theme-section.vue'
import TokenIsolationSection from '../components/sections/token-isolation-section.vue'
import TypeTuningSection from '../components/sections/type-tuning-section.vue'
import TypographySection from '../components/sections/typography-section.vue'
import { CURRENT_DIRECTION } from '../theme/directions'

const direction = CURRENT_DIRECTION
</script>

<template>
  <div class="tuning">
    <div class="tuning__frame">
      <dir-column :direction="direction">
        <div class="tuning__content">
          <overview-section :direction="direction" />
          <materials-section />
          <type-tuning-section />
          <color-ramp-section />
          <semantic-color-section />
          <role-token-section />
          <typography-section />
          <spacing-section />
          <radius-section />
          <shadow-section />
          <motion-section />
          <component-samples-section />
          <interaction-states-section />
          <async-states-section />
          <theme-section :direction-id="direction.id" />
          <spec-extras-section />
          <do-dont-section />
          <token-isolation-section />
          <naive-mapping-section />
        </div>
      </dir-column>
    </div>
  </div>
</template>

<style scoped>
.tuning {
  max-width: 60rem;
  margin: 0 auto;
  padding: var(--dl-page-pad);
}

.tuning__frame {
  border: 1px solid var(--dl-page-border);
  border-radius: var(--dl-page-radius);
  overflow: hidden;
}

.tuning__content {
  padding: var(--dl-space-6);
}
</style>
