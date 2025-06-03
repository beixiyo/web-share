<template>
  <!-- 浮动小球 -->
  <div v-for="peer in user" :key="peer.peerId"
    class="animate-float"
    @click="emit('clickPeer', peer)"
    @contextmenu.prevent="emit('contextmenuPeer', peer)">

    <div :class="[
      'group cursor-pointer p-4 rounded-full shadow-lg backdrop-blur-sm transition-all duration-300',
      'hover:scale-110 hover:shadow-xl',
      peer.peerId === info?.peerId ? 'bg-indigo-500/80' : 'bg-white/80'
    ]">
      <div class="flex justify-center items-center size-14 text-center">
        <span :class="[
          'font-bold line-clamp-1',
          peer.peerId === info?.peerId ? 'text-white' : 'text-indigo-600'
        ]">
          {{ peer.name.displayName }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserInfo } from 'web-share-common'


defineOptions({ name: 'User' })

const user = defineModel<UserInfo[]>({
  default: []
})

const props = withDefaults(
  defineProps<{
    info?: UserInfo
  }>(),
  {
  }
)

const emit = defineEmits<{
  (e: 'clickPeer', peer: UserInfo): void
  (e: 'contextmenuPeer', peer: UserInfo): void
}>()

</script>
