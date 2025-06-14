<template>
  <Modal class="QrCodeModal-container"
    v-model="show"
    height="auto"
    title="请让对方扫描二维码">
    <div
      class="flex flex-col items-center p-4 gap-2 sm:p-3 sm:gap-1.5">
      <div v-if="qrCodeValue && qrCodeValue.startsWith('data:image/png')"
        class="p-2 bg-white rounded-lg">
        <img :src="qrCodeValue"
          alt="二维码"
          class="max-w-full h-auto max-sm:max-w-[250px]" />
      </div>

      <p v-else-if="!qrCodeValue && showQrCodeModal"
        class="text-gray-500 dark:text-gray-400 sm:text-sm h-48 flex items-center justify-center">
        正在生成二维码...
      </p>

      <p
        v-else-if="qrCodeValue && !qrCodeValue.startsWith('data:image/png')"
        class="text-gray-500 dark:text-gray-400 sm:text-sm h-48 flex items-center justify-center">
        二维码内容已准备，等待扫码...
      </p>

      <p
        class="text-sm text-gray-600 dark:text-gray-300 sm:text-xs">
        扫描此二维码以建立连接
      </p>
    </div>
    <template #footer>
      <Button
        @click="emit('copy')"
        variant="primary"
        size="md"
        class="w-full">
        或者复制链接让对方打开
      </Button>
    </template>
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
