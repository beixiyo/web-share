<template>
  <Modal class="QrCodeModal-container"
    v-model="show"
    height="auto"
    title="请让对方扫描二维码">
    <div
      class="flex flex-col items-center p-4 sm:p-3">
      <img v-if="qrCodeValue && qrCodeValue.startsWith('data:image/png')"
        :src="qrCodeValue" alt="二维码"
        class="max-w-full h-auto max-sm:max-w-[250px]" />

      <p v-else-if="!qrCodeValue && showQrCodeModal"
        class="text-gray-500 dark:text-gray-400 sm:text-sm">
        正在生成二维码...
      </p>

      <p
        v-else-if="qrCodeValue && !qrCodeValue.startsWith('data:image/png')"
        class="text-gray-500 dark:text-gray-400 sm:text-sm">
        二维码内容已准备，等待扫码...
      </p>

      <p
        class="mt-2 text-sm text-gray-600 dark:text-gray-300 sm:text-xs sm:mt-1">
        扫描此二维码以建立连接</p>
      <Button
        @click="emit('copy')"
        variant="primary"
        size="md"
        class="mt-2 sm:mt-1 sm:text-sm">
        或者复制链接让对方打开
      </Button>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import Modal from '@/components/Modal/index.vue'
import Button from '@/components/Button/index.vue'

defineOptions({ name: 'QrCodeModal' })

const show = defineModel<boolean>()
const props = withDefaults(
  defineProps<{
    qrCodeValue: string
    showQrCodeModal: boolean
  }>(),
  {
  }
)

const emit = defineEmits<{
  (e: 'copy'): void
}>()

</script>

<style lang="scss" scoped></style>
