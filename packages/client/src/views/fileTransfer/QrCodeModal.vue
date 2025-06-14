<template>
  <Modal
    v-model="show"
    class="QrCodeModal-container"
    height="auto"
    title="请让对方扫描二维码"
  >
    <div
      class="flex flex-col items-center gap-2 p-4 sm:gap-1.5 sm:p-3"
    >
      <div
        v-if="qrCodeValue && qrCodeValue.startsWith('data:image/png')"
        class="rounded-lg bg-white p-2"
      >
        <img
          :src="qrCodeValue"
          alt="二维码"
          class="h-auto max-w-full max-sm:max-w-[250px]"
        >
      </div>

      <p
        v-else-if="!qrCodeValue && showQrCodeModal"
        class="h-48 flex items-center justify-center text-gray-500 sm:text-sm dark:text-gray-400"
      >
        正在生成二维码...
      </p>

      <p
        v-else-if="qrCodeValue && !qrCodeValue.startsWith('data:image/png')"
        class="h-48 flex items-center justify-center text-gray-500 sm:text-sm dark:text-gray-400"
      >
        二维码内容已准备，等待扫码...
      </p>

      <p
        class="text-sm text-gray-600 sm:text-xs dark:text-gray-300"
      >
        扫描此二维码以建立连接
      </p>
    </div>
    <template #footer>
      <Button
        variant="primary"
        size="md"
        class="w-full"
        @click="emit('copy')"
      >
        或者复制链接让对方打开
      </Button>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import Button from '@/components/Button/index.vue'
import Modal from '@/components/Modal/index.vue'

defineOptions({ name: 'QrCodeModal' })

const props = withDefaults(
  defineProps<{
    qrCodeValue: string
    showQrCodeModal: boolean
  }>(),
  {
  },
)
const emit = defineEmits<{
  (e: 'copy'): void
}>()
const show = defineModel<boolean>()
</script>

<style lang="scss" scoped></style>
