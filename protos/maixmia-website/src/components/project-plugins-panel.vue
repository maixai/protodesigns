<script setup lang="ts">
// 项目与 Agent 共用同一个插件工作流,项目包装层只传递作用域与窗体状态。
import type { AgentSummary } from '../contracts/generated/agent-summary'
import type { Project } from '../contracts/generated/project'
import type { ProjectPanelState } from './project-settings-state'
import AgentPlugins from './agent-plugins.vue'
defineProps<{ project: Project; agent: AgentSummary; requestedPluginKey?: string }>()
const emit = defineEmits<{ state: [state: ProjectPanelState]; announce: [message: string]; manageAgent: [pluginKey: string]; openRequestConsumed: [] }>()
</script>
<template>
  <AgentPlugins embedded class="project-plugins" :agent-id="agent.id" :agent-name="agent.name" :project-path="project.path" :project-name="project.name"
    :requested-plugin-key="requestedPluginKey ?? ''" @state="emit('state', $event)" @announce="emit('announce', $event)" @manage-agent="emit('manageAgent', $event)" @open-request-consumed="emit('openRequestConsumed')" />
</template>
