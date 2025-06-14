<template>
  <!-- 拖拽覆盖层 -->
  <div :class="dragOverlayClass">
    <div :class="dropZoneClass">
      <div v-if="isDropZoneActive" class="space-y-4">
        <div class="text-6xl">📁</div>
        <div class="text-xl font-semibold">释放文件开始传输</div>
        <div class="text-sm opacity-75">
          支持多文件同时传输
        </div>
      </div>
      <div v-else class="space-y-4">
        <div class="text-6xl opacity-50">🚫</div>
        <div class="text-xl font-semibold">不支持的内容类型</div>
        <div class="text-sm opacity-75">
          请拖拽文件到此区域
        </div>
      </div>
    </div>
  </div>

  <!-- 拖拽状态指示器 -->
  <div
    v-if="isDragging"
    class="fixed top-4 right-4 z-40 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-lg dark:bg-gray-800/90"
  >
    <div class="flex items-center space-x-2">
      <div class="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
      <span class="text-sm font-medium dark:text-gray-200">
        {{ isDragFile ? '检测到文件' : '拖拽中...' }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * 拖拽覆盖层组件的 Props 接口
 */
interface DragDropOverlayProps {
  /** 是否正在拖拽 */
  isDragging: boolean
  /** 是否拖拽的是文件 */
  isDragFile: boolean
  /** 拖拽区域是否激活 */
  isDropZoneActive: boolean
}

/**
 * 定义组件 props
 */
const props = withDefaults(defineProps<DragDropOverlayProps>(), {
  isDragging: false,
  isDragFile: false,
  isDropZoneActive: false,
})

/**
 * 拖拽覆盖层样式计算
 */
const dragOverlayClass = computed(() => {
  if (!props.isDragging) return 'hidden'

  return [
    'fixed inset-0 z-50 flex items-center justify-center',
    'bg-black/20 backdrop-blur-sm',
    props.isDropZoneActive
      ? 'bg-emerald-500/20'
      : 'bg-gray-500/20',
  ].join(' ')
})

/**
 * 放置区域样式计算
 */
const dropZoneClass = computed(() => {
  return [
    'border-4 border-dashed rounded-2xl p-8 m-8',
    'flex flex-col items-center justify-center text-center',
    'transition-all duration-200',
    props.isDropZoneActive
      ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
      : 'border-gray-400 bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  ].join(' ')
})
</script>

<style scoped>
/**
 * 拖拽覆盖层的自定义样式
 */

/* 拖拽覆盖层动画 */
.drag-overlay-enter-active,
.drag-overlay-leave-active {
  transition: all 0.2s ease-in-out;
}

.drag-overlay-enter-from,
.drag-overlay-leave-to {
  opacity: 0;
  backdrop-filter: blur(0px);
}

.drag-overlay-enter-to,
.drag-overlay-leave-from {
  opacity: 1;
  backdrop-filter: blur(4px);
}

/* 放置区域动画 */
.drop-zone-enter-active,
.drop-zone-leave-active {
  transition: all 0.2s ease-in-out;
}

.drop-zone-enter-from,
.drop-zone-leave-to {
  transform: scale(0.95);
  opacity: 0;
}

.drop-zone-enter-to,
.drop-zone-leave-from {
  transform: scale(1);
  opacity: 1;
}

/* 状态指示器动画 */
.status-indicator-enter-active,
.status-indicator-leave-active {
  transition: all 0.2s ease-in-out;
}

.status-indicator-enter-from,
.status-indicator-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.status-indicator-enter-to,
.status-indicator-leave-from {
  transform: translateX(0);
  opacity: 1;
}

/* 脉冲动画增强 */
@keyframes enhanced-pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(1.1);
  }
}

.animate-pulse {
  animation: enhanced-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* 深色模式下的特殊样式 */
@media (prefers-color-scheme: dark) {
  .drag-overlay {
    background-color: rgba(0, 0, 0, 0.4);
  }

  .status-indicator {
    background-color: rgba(31, 41, 55, 0.9);
    border: 1px solid rgba(75, 85, 99, 0.3);
  }
}

/* 响应式设计 */
@media (max-width: 640px) {
  .drop-zone {
    margin: 1rem;
    padding: 2rem;
  }

  .drop-zone .text-6xl {
    font-size: 3rem;
  }

  .drop-zone .text-xl {
    font-size: 1.125rem;
  }

  .status-indicator {
    top: 0.5rem;
    right: 0.5rem;
    padding: 0.5rem;
  }

  .status-indicator .text-sm {
    font-size: 0.75rem;
  }
}

/* 高对比度模式支持 */
@media (prefers-contrast: high) {
  .drop-zone {
    border-width: 6px;
  }

  .drop-zone.active {
    border-color: #059669;
    background-color: #d1fae5;
  }

  .drop-zone.inactive {
    border-color: #6b7280;
    background-color: #f3f4f6;
  }
}

/* 减少动画模式支持 */
@media (prefers-reduced-motion: reduce) {
  .drag-overlay-enter-active,
  .drag-overlay-leave-active,
  .drop-zone-enter-active,
  .drop-zone-leave-active,
  .status-indicator-enter-active,
  .status-indicator-leave-active {
    transition: none;
  }

  .animate-pulse {
    animation: none;
  }
}
</style>
