<template>
  <div
    class="Mask-container fixed inset-0 z-[99] flex items-center justify-center bg-black/50 backdrop-blur-sm"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'Mask' })
</script>

<style scoped lang="scss">
</style>
