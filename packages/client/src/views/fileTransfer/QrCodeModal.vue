<template>
  <Modal class="QrCodeModal-container"
    v-model="show"
    title="请让对方扫描二维码">
    <div class="flex flex-col items-center p-4">
      <img v-if="qrCodeValue && qrCodeValue.startsWith('data:image/png')"
        :src="qrCodeValue" alt="二维码" />

      <p v-else-if="!qrCodeValue && showQrCodeModal" class="text-gray-500">
        正在生成二维码...
      </p>

      <p
        v-else-if="qrCodeValue && !qrCodeValue.startsWith('data:image/png')"
        class="text-gray-500">
        二维码内容已准备，等待扫码...
      </p>

      <p class="mt-2 text-sm text-gray-600">扫描此二维码以建立连接</p>
      <button @click="emit('copy')"
        class="px-6 py-2 mt-2 bg-indigo-600 text-white rounded-lg shadow-md hover:bg-indigo-700 transition-colors duration-200">
        或者复制链接让对方打开
      </button>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import Modal from '@/components/Modal/index.vue'

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
