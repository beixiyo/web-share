<template>
  <div
    class="absolute top-36 z-10 w-[calc(100vw-1.5rem)] max-w-xl rounded-xl border border-emerald-100 bg-white/90 p-3 shadow-lg backdrop-blur-md center-x dark:border-emerald-900/30 dark:bg-gray-800/90 dark:shadow-emerald-900/20 sm:w-fit"
  >
    <div class="flex flex-col gap-3 px-1 sm:items-center sm:px-2">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div class="min-w-0 flex flex-col">
          <span class="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{{ t('inviteCard.currentCode') }}</span>
          <div class="flex items-center justify-between gap-2 sm:justify-start">

            <span class="min-w-0 truncate font-mono text-[28px] font-bold leading-none text-emerald-600 dark:text-emerald-400 sm:text-3xl">
              {{ roomCode }}
            </span>
            <Button
              variant="ghost"
              size="sm"
              :icon-only="true"
              :left-icon="Copy"
              class="text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
              @click="emit('copyCode')"
            />
          </div>
        </div>

        <div class="hidden mx-2 h-10 w-px bg-gray-200 dark:bg-gray-700 sm:block" />

        <div class="flex flex-nowrap items-center gap-2">
          <Button
            variant="default"
            size="sm"
            design-style="neumorphic"
            :left-icon="QrCode"
            class="min-w-0 flex-1 sm:flex-none"
            @click="emit('showQrCode')"
          >
            {{ t('inviteCard.qrCode') }}
          </Button>
          <Button
            variant="default"
            size="sm"
            design-style="neumorphic"
            :left-icon="ExternalLink"
            class="min-w-0 flex-1 sm:flex-none"
            @click="emit('copyLink')"
          >
            {{ t('inviteCard.link') }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            :icon-only="true"
            :left-icon="RotateCcw"
            :title="t('inviteCard.refresh')"
            class="shrink-0 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400"
            @click="emit('refreshInvite')"
          />

        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Copy, ExternalLink, QrCode, RotateCcw } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import Button from '@/components/Button/index.vue'

defineOptions({ name: 'InviteCard' })

defineProps<{
  /** 当前房间连接码 */
  roomCode: string
}>()

const emit = defineEmits<{
  (e: 'copyCode'): void
  (e: 'copyLink'): void
  (e: 'refreshInvite'): void
  (e: 'showQrCode'): void
}>()

const { t } = useI18n()
</script>
