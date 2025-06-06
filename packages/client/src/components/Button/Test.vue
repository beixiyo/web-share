<template>
  <div class="h-screen overflow-auto bg-gray-50 p-8 dark:bg-black dark:text-white">
    <div class="mx-auto max-w-5xl">
      <h1 class="mb-8 text-3xl font-bold">按钮组件展示</h1>

      <!-- 扁平风格按钮 -->
      <section class="mb-12">
        <h2 class="mb-4 text-xl font-semibold">扁平风格按钮</h2>
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div class="rounded-lg p-6 shadow-sm">
            <h3 class="mb-4 text-lg font-medium">变体</h3>
            <div class="flex flex-wrap gap-3">
              <Button variant="default">默认按钮</Button>
              <Button variant="primary">主要按钮</Button>
              <Button variant="success">成功按钮</Button>
              <Button variant="warning">警告按钮</Button>
              <Button variant="danger">危险按钮</Button>
              <Button variant="info">信息按钮</Button>
            </div>
          </div>

          <div class="rounded-lg p-6 shadow-sm">
            <h3 class="mb-4 text-lg font-medium">尺寸</h3>
            <div class="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="sm">小按钮</Button>
              <Button variant="primary" size="md">中按钮</Button>
              <Button variant="primary" size="lg">大按钮</Button>
            </div>
          </div>

          <div class="rounded-lg p-6 shadow-sm">
            <h3 class="mb-4 text-lg font-medium">图标按钮</h3>
            <div class="flex flex-wrap items-center gap-3">
              <Button variant="primary" :leftIcon="SaveIcon">保存</Button>
              <Button variant="success" :rightIcon="ArrowRightIcon">下一步</Button>
              <Button variant="default" iconOnly :leftIcon="MenuIcon" aria-label="菜单" />
              <Button variant="primary" iconOnly :leftIcon="SunIcon" aria-label="亮色主题" />
              <Button variant="info" iconOnly :leftIcon="MoonIcon" aria-label="暗色主题" />
            </div>
          </div>

          <div class="rounded-lg p-6 shadow-sm">
            <h3 class="mb-4 text-lg font-medium">状态</h3>
            <div class="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                :loading="loading['flat-loading']"
                loadingText="加载中..."
                :leftIcon="SaveIcon"
                @click="handleLoadingClick('flat-loading')"
              >
                {{ loading['flat-loading'] ? '加载中' : '点击加载' }}
              </Button>
              <Button variant="danger" disabled :leftIcon="AlertCircleIcon">
                禁用按钮
              </Button>
              <Button variant="success" :leftIcon="CheckIcon">
                完成
              </Button>
            </div>
          </div>
        </div>
      </section>

      <!-- 新拟态风格按钮 -->
      <section class="mb-12 rounded-lg bg-[#e8e8e8] p-12 dark:bg-[#262626]">
        <h2 class="mb-4 text-xl font-semibold">新拟态风格按钮</h2>
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div class="rounded-lg p-6 shadow-[5px_5px_10px_#bebebe,-5px_-5px_10px_#ffffff] dark:shadow-[5px_5px_10px_#333,-5px_-5px_10px_#333]">
            <h3 class="mb-4 text-lg font-medium">变体</h3>
            <div class="flex flex-wrap gap-3">
              <Button designStyle="neumorphic" variant="default">默认按钮</Button>
              <Button designStyle="neumorphic" variant="primary">主要按钮</Button>
              <Button designStyle="neumorphic" variant="success">成功按钮</Button>
              <Button designStyle="neumorphic" variant="warning">警告按钮</Button>
              <Button designStyle="neumorphic" variant="danger">危险按钮</Button>
            </div>
          </div>

          <div class="rounded-lg p-6 shadow-[5px_5px_10px_#bebebe,-5px_-5px_10px_#ffffff] dark:shadow-[5px_5px_10px_#333,-5px_-5px_10px_#333]">
            <h3 class="mb-4 text-lg font-medium">图标与状态</h3>
            <div class="flex flex-wrap items-center gap-3">
              <Button
                designStyle="neumorphic"
                variant="primary"
                :leftIcon="ThumbsUpIcon"
              >
                点赞
              </Button>
              <Button
                designStyle="neumorphic"
                variant="success"
                :loading="loading['neumorphic-loading']"
                loadingText="保存中..."
                :leftIcon="SaveIcon"
                @click="handleLoadingClick('neumorphic-loading')"
              >
                {{ loading['neumorphic-loading'] ? '保存中' : '保存' }}
              </Button>
              <Button
                designStyle="neumorphic"
                iconOnly
                variant="info"
                :leftIcon="MoonIcon"
                aria-label="暗色主题"
              />
              <Button
                designStyle="neumorphic"
                disabled
                variant="danger"
              >
                禁用
              </Button>
            </div>
          </div>
        </div>
      </section>

      <!-- 描边和幽灵按钮 -->
      <section class="mb-12">
        <h2 class="mb-4 text-xl font-semibold">其他风格按钮</h2>
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div class="rounded-lg p-6 shadow-sm">
            <h3 class="mb-4 text-lg font-medium">描边按钮</h3>
            <div class="flex flex-wrap gap-3">
              <Button designStyle="outlined" variant="default">默认按钮</Button>
              <Button designStyle="outlined" variant="primary">主要按钮</Button>
              <Button designStyle="outlined" variant="success">成功按钮</Button>
              <Button designStyle="outlined" variant="warning">警告按钮</Button>
              <Button designStyle="outlined" variant="danger">危险按钮</Button>
            </div>
          </div>

          <div class="rounded-lg p-6 shadow-sm">
            <h3 class="mb-4 text-lg font-medium">幽灵按钮</h3>
            <div class="flex flex-wrap gap-3">
              <Button designStyle="ghost" variant="default">默认按钮</Button>
              <Button designStyle="ghost" variant="primary">主要按钮</Button>
              <Button designStyle="ghost" variant="success">成功按钮</Button>
              <Button designStyle="ghost" variant="warning">警告按钮</Button>
              <Button designStyle="ghost" variant="danger">危险按钮</Button>
            </div>
          </div>

          <div class="rounded-lg p-6 shadow-sm">
            <h3 class="mb-4 text-lg font-medium">圆角变体</h3>
            <div class="flex flex-wrap items-center gap-3">
              <Button variant="primary" rounded="none">无圆角</Button>
              <Button variant="primary" rounded="sm">小圆角</Button>
              <Button variant="primary" rounded="md">中圆角</Button>
              <Button variant="primary" rounded="lg">大圆角</Button>
              <Button variant="primary" rounded="full">完全圆角</Button>
            </div>
          </div>

          <div class="rounded-lg p-6 shadow-sm">
            <h3 class="mb-4 text-lg font-medium">块级按钮</h3>
            <div class="flex flex-col gap-3">
              <Button variant="primary" block>块级主要按钮</Button>
              <Button
                variant="success"
                block
                :leftIcon="Loader2Icon"
                :loading="loading['block-loading']"
                loadingText="加载中..."
                @click="handleLoadingClick('block-loading')"
              >
                {{ loading['block-loading'] ? '提交中' : '提交表单' }}
              </Button>
              <Button designStyle="outlined" variant="danger" block>块级描边按钮</Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Button from './index.vue'
import {
  AlertCircle as AlertCircleIcon,
  ArrowRight as ArrowRightIcon,
  Check as CheckIcon,
  Loader2 as Loader2Icon,
  Menu as MenuIcon,
  Moon as MoonIcon,
  Save as SaveIcon,
  Sun as SunIcon,
  ThumbsUp as ThumbsUpIcon,
} from 'lucide-vue-next'

// 加载状态
const loading = ref<Record<string, boolean>>({})

// 模拟按钮加载状态
const handleLoadingClick = (id: string) => {
  loading.value = { ...loading.value, [id]: true }

  // 2秒后恢复
  setTimeout(() => {
    loading.value = { ...loading.value, [id]: false }
  }, 2000)
}
</script>

