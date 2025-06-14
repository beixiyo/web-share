<template>
  <Transition
    appear
    enter-active-class="transition duration-300"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-300"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0">
    <div
      class="Mask-container fixed inset-0 z-[99] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <slot />
    </div>
  </Transition>
</template>

<script setup lang="ts">
defineOptions({ name: 'Mask' })
</script>

<style scoped lang="scss"></style>
