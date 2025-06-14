<template>
  <!-- 浮动小球 -->
  <div
    v-for="peer in user" :key="peer.peerId"
    class="animate-float"
    @click="emit('clickPeer', peer)"
    @contextmenu.prevent="emit('contextmenuPeer', peer)"
  >
    <div
      class="group cursor-pointer rounded-full p-4 shadow-lg backdrop-blur-sm transition-all duration-300 hover:scale-110 sm:p-3 hover:shadow-xl sm:hover:scale-105" :class="[
        peer.peerId === info?.peerId
          ? 'bg-emerald-500/80 dark:bg-emerald-600/80'
          : 'bg-white/80 dark:bg-gray-800/80 dark:shadow-gray-900/50',
      ]"
    >
      <div class="size-14 flex items-center justify-center text-center sm:size-12">
        <span
          class="line-clamp-1 font-bold sm:text-sm" :class="[
            peer.peerId === info?.peerId
              ? 'text-white'
              : 'text-emerald-600 dark:text-emerald-400',
          ]"
        >
          {{ peer.name.displayName }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserInfo } from 'web-share-common'

defineOptions({ name: 'User' })

const props = withDefaults(
  defineProps<{
    info?: UserInfo
  }>(),
  {
  },
)

const emit = defineEmits<{
  (e: 'clickPeer', peer: UserInfo): void
  (e: 'contextmenuPeer', peer: UserInfo): void
}>()

const user = defineModel<UserInfo[]>({
  default: [],
})
</script>
