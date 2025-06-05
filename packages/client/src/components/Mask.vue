<template>
  <Transition name="mask">
    <div
      class="Mask-container fixed inset-0 z-[99]
        flex justify-center items-center
      bg-black/30 filter backdrop-blur">
      <slot></slot>
    </div>
  </Transition>
</template>

<script setup lang="ts">

defineOptions({ name: 'Mask' })

</script>

<style scoped lang="scss">
@include vue-transition('mask') {
  opacity: 0;
}
</style>