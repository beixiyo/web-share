<template>
  <!-- 星空布局容器 -->
  <div
    class="starfield-container pointer-events-none fixed inset-0 overflow-hidden"
  >
    <!-- 连接线 -->
    <svg
      class="absolute inset-0 size-full"
      style="z-index: 1;"
    >
      <defs>
        <linearGradient
          id="connectionGradient" x1="0%" y1="0%" x2="100%"
          y2="100%"
        >
          <stop offset="0%" style="stop-color:#10b981;stop-opacity:0.1" />
          <stop offset="50%" style="stop-color:#10b981;stop-opacity:0.3" />
          <stop offset="100%" style="stop-color:#10b981;stop-opacity:0.1" />
        </linearGradient>
        <linearGradient
          id="connectionGradientDark" x1="0%" y1="0%" x2="100%"
          y2="100%"
        >
          <stop offset="0%" style="stop-color:#059669;stop-opacity:0.15" />
          <stop offset="50%" style="stop-color:#059669;stop-opacity:0.4" />
          <stop offset="100%" style="stop-color:#059669;stop-opacity:0.15" />
        </linearGradient>
      </defs>
      <g v-for="(line, index) in connectionLines" :key="`line-${index}`">
        <line
          :x1="line.x1"
          :y1="line.y1"
          :x2="line.x2"
          :y2="line.y2"
          stroke="url(#connectionGradient)"
          stroke-width="1"
          class="connection-line"
          :style="{
            animationDelay: `${index * 0.5}s`,
          }"
        />
      </g>
    </svg>

    <!-- 浮动小球 -->
    <div
      v-for="(peer, index) in user"
      :key="peer.peerId"
      class="user-orb pointer-events-auto absolute"
      :style="getUserOrbStyle(peer, index)"
      @click="emit('clickPeer', peer)"
      @contextmenu.prevent="emit('contextmenuPeer', peer)"
    >
      <div
        class="group relative cursor-pointer rounded-full p-4 shadow-lg backdrop-blur-sm transition-all duration-500 hover:scale-125 sm:p-3 hover:shadow-2xl hover:shadow-emerald-500/20"
        :class="[
          peer.peerId === info?.peerId
            ? 'bg-emerald-500/90 dark:bg-emerald-600/90 ring-2 ring-emerald-400/50'
            : 'bg-white/90 dark:bg-gray-800/90 dark:shadow-gray-900/50 hover:bg-white/95 dark:hover:bg-gray-700/95',
        ]"
      >
        <!-- 光晕效果 -->
        <div
          class="absolute inset-0 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          :class="[
            peer.peerId === info?.peerId
              ? 'bg-emerald-400/20 animate-pulse'
              : 'bg-emerald-400/10 animate-pulse',
          ]"
        />

        <!-- 用户内容 -->
        <div
          class="relative z-10 size-14 flex items-center justify-center text-center sm:size-12"
        >
          <span
            class="line-clamp-1 font-bold transition-all duration-300 group-hover:scale-110 sm:text-sm"
            :class="[
              peer.peerId === info?.peerId
                ? 'text-white drop-shadow-sm'
                : 'text-emerald-600 dark:text-emerald-400',
            ]"
          >
            {{ peer.name.displayName }}
          </span>
        </div>

        <!-- 悬停时的粒子效果 -->
        <div
          class="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        >
          <div
            v-for="particle in 6"
            :key="`particle-${particle}`"
            class="absolute size-1 animate-ping rounded-full bg-emerald-400/60"
            :style="getParticleStyle(particle)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserInfo } from 'web-share-common'

defineOptions({ name: 'User' })

withDefaults(
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

/** 星空布局相关状态 */
const containerSize = ref({ width: 0, height: 0 })
const userPositions = ref<Map<string, { x: number, y: number, baseX: number, baseY: number }>>(new Map())
const animationTime = ref(0)

/** 获取容器尺寸 */
function updateContainerSize() {
  containerSize.value = {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

/** 生成星空布局位置 */
function generateStarfieldPositions(users: UserInfo[]) {
  const { width, height } = containerSize.value
  const positions = new Map()

  /** 根据屏幕尺寸调整边距 */
  const margin = Math.min(100, Math.max(50, width * 0.05)) // 动态边距，5%屏幕宽度
  const safeWidth = width - margin * 2
  const safeHeight = height - margin * 2

  if (users.length === 0)
    return

  /** 如果只有1-2个用户，使用特殊布局 */
  if (users.length <= 2) {
    users.forEach((user, index) => {
      const centerX = width / 2
      const centerY = height / 2

      let x, y
      if (users.length === 1) {
        /** 单个用户居中偏移 */
        x = centerX + (Math.random() - 0.5) * 200
        y = centerY + (Math.random() - 0.5) * 200
      }
      else {
        /** 两个用户对称分布 */
        const offset = Math.min(300, width * 0.2)
        x = centerX + (index === 0
          ? -offset
          : offset)
        y = centerY + (Math.random() - 0.5) * 100
      }

      positions.set(user.peerId, {
        x: Math.max(margin, Math.min(width - margin, x)),
        y: Math.max(margin, Math.min(height - margin, y)),
        baseX: x,
        baseY: y,
      })
    })
  }
  else {
    /** 多用户时使用改进的星空分布算法 */
    const attempts = 50 // 最大尝试次数
    const minDistance = Math.min(150, Math.max(80, Math.sqrt(safeWidth * safeHeight) / users.length * 0.8))

    users.forEach((user) => {
      const seed = user.peerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
      let bestX = 0; let bestY = 0; let maxMinDistance = 0

      /** 多次尝试找到最佳位置 */
      for (let attempt = 0; attempt < attempts; attempt++) {
        const random1 = (Math.sin(seed * 12.9898 + attempt) * 43758.5453) % 1
        const random2 = (Math.sin(seed * 78.233 + attempt) * 43758.5453) % 1

        const x = margin + Math.abs(random1) * safeWidth
        const y = margin + Math.abs(random2) * safeHeight

        /** 计算与已有位置的最小距离 */
        let minDistanceToOthers = Infinity
        for (const [, pos] of positions) {
          const distance = Math.sqrt((x - pos.x) ** 2 + (y - pos.y) ** 2)
          minDistanceToOthers = Math.min(minDistanceToOthers, distance)
        }

        /** 选择距离其他点最远的位置 */
        if (minDistanceToOthers > maxMinDistance) {
          maxMinDistance = minDistanceToOthers
          bestX = x
          bestY = y
        }

        /** 如果找到足够好的位置，提前结束 */
        if (minDistanceToOthers >= minDistance) {
          break
        }
      }

      positions.set(user.peerId, {
        x: bestX,
        y: bestY,
        baseX: bestX,
        baseY: bestY,
      })
    })
  }

  userPositions.value = positions
}

/** 获取用户小球的样式 */
function getUserOrbStyle(peer: UserInfo, index: number) {
  const position = userPositions.value.get(peer.peerId)
  if (!position)
    return {}

  /** 根据屏幕尺寸调整浮动参数 */
  const { width } = containerSize.value
  const isMobile = width < 768

  /** 添加浮动动画偏移 */
  const floatRadius = isMobile
    ? 12
    : 20 // 大屏幕上更大的浮动半径
  const floatSpeed = isMobile
    ? 0.0008
    : 0.0012 // 大屏幕上稍快的浮动速度
  const phaseOffset = index * 0.7 // 增加相位偏移，让动画更有层次

  const floatX = Math.sin(animationTime.value * floatSpeed + phaseOffset) * floatRadius
  const floatY = Math.cos(animationTime.value * floatSpeed * 0.8 + phaseOffset) * floatRadius * 0.7

  return {
    left: `${position.x + floatX}px`,
    top: `${position.y + floatY}px`,
    transform: 'translate(-50%, -50%)',
    animationDelay: `${index * 0.15}s`,
  }
}

/** 生成连接线 */
const connectionLines = computed(() => {
  const lines: Array<{ x1: number, y1: number, x2: number, y2: number }> = []
  const users = user.value

  if (users.length < 2)
    return lines

  /** 根据屏幕尺寸和用户数量动态调整连线距离 */
  const { width, height } = containerSize.value
  const screenDiagonal = Math.sqrt(width * width + height * height)

  /** 基础连线距离，根据屏幕对角线长度调整 */
  let maxDistance = screenDiagonal * 0.25 // 屏幕对角线的25%

  /** 根据用户数量调整连线距离 */
  if (users.length <= 3) {
    /** 用户较少时，增加连线距离确保有连线 */
    maxDistance = screenDiagonal * 0.4
  }
  else if (users.length <= 6) {
    maxDistance = screenDiagonal * 0.3
  }
  else {
    /** 用户较多时，减少连线距离避免过于密集 */
    maxDistance = screenDiagonal * 0.2
  }

  /** 移动端特殊处理 */
  if (width < 768) {
    maxDistance = Math.min(maxDistance, 400) // 移动端最大400px
  }

  /** 收集所有距离信息 */
  const distances: Array<{
    i: number
    j: number
    distance: number
    pos1: { x: number, y: number }
    pos2: { x: number, y: number }
  }> = []

  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const pos1 = userPositions.value.get(users[i].peerId)
      const pos2 = userPositions.value.get(users[j].peerId)

      if (pos1 && pos2) {
        const distance = Math.sqrt(
          (pos1.x - pos2.x) ** 2 + (pos1.y - pos2.y) ** 2,
        )

        distances.push({
          i,
          j,
          distance,
          pos1: { x: pos1.x, y: pos1.y },
          pos2: { x: pos2.x, y: pos2.y },
        })
      }
    }
  }

  /** 按距离排序，优先连接距离较近的用户 */
  distances.sort((a, b) => a.distance - b.distance)

  /** 确保每个用户至少有一条连线（如果可能的话） */
  const connectedUsers = new Set<number>()
  const maxLines = Math.min(distances.length, users.length * 2) // 限制连线数量

  for (const item of distances) {
    if (lines.length >= maxLines)
      break

    /** 如果距离在允许范围内，或者某个用户还没有连线，则添加连线 */
    const shouldConnect = item.distance <= maxDistance
      || (!connectedUsers.has(item.i) || !connectedUsers.has(item.j))

    if (shouldConnect && item.distance <= maxDistance * 1.5) { // 稍微放宽距离限制
      lines.push({
        x1: item.pos1.x,
        y1: item.pos1.y,
        x2: item.pos2.x,
        y2: item.pos2.y,
      })

      connectedUsers.add(item.i)
      connectedUsers.add(item.j)
    }
  }

  return lines
})

/** 获取粒子样式 */
function getParticleStyle(particleIndex: number) {
  const angle = (particleIndex / 6) * 360
  const radius = 25
  const x = Math.cos(angle * Math.PI / 180) * radius
  const y = Math.sin(angle * Math.PI / 180) * radius

  return {
    left: `calc(50% + ${x}px)`,
    top: `calc(50% + ${y}px)`,
    animationDelay: `${particleIndex * 0.1}s`,
  }
}

/** 动画循环 */
let animationId: number
function startAnimation() {
  const animate = () => {
    animationTime.value = Date.now()
    animationId = requestAnimationFrame(animate)
  }
  animate()
}

function stopAnimation() {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
}

/** 监听用户变化，重新生成位置 */
watch(user, (newUsers) => {
  if (newUsers.length > 0) {
    generateStarfieldPositions(newUsers)
  }
}, { immediate: true })

/** 监听窗口大小变化 */
function handleResize() {
  updateContainerSize()
  if (user.value.length > 0) {
    generateStarfieldPositions(user.value)
  }
}

/** 生命周期 */
onMounted(() => {
  updateContainerSize()
  startAnimation()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  stopAnimation()
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
/* 星空容器 */
.starfield-container {
  z-index: 10;
}

/* 用户小球 */
.user-orb {
  z-index: 20;
  animation: orbFloat 6s ease-in-out infinite;
}

/* 连接线动画 */
.connection-line {
  animation: lineGlow 3s ease-in-out infinite;
}

/* 小球浮动动画 */
@keyframes orbFloat {

  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
  }

  50% {
    transform: translate(-50%, -50%) scale(1.02);
  }
}

/* 连接线发光动画 */
@keyframes lineGlow {

  0%,
  100% {
    opacity: 0.2;
    stroke-width: 1;
  }

  50% {
    opacity: 0.6;
    stroke-width: 1.5;
  }
}

/* 粒子动画增强 */
@keyframes particleFloat {
  0% {
    transform: scale(0) rotate(0deg);
    opacity: 0;
  }

  50% {
    transform: scale(1) rotate(180deg);
    opacity: 1;
  }

  100% {
    transform: scale(0) rotate(360deg);
    opacity: 0;
  }
}

/* 悬停时的粒子效果 */
.user-orb:hover .absolute.size-1 {
  animation: particleFloat 1.5s ease-in-out infinite;
}

/* 响应式调整 */
@media (max-width: 640px) {
  .user-orb {
    animation-duration: 8s;
    /* 移动端动画稍慢 */
  }

  .connection-line {
    stroke-width: 0.5;
    opacity: 0.3;
  }
}

/* 大屏幕优化 */
@media (min-width: 1024px) {
  .user-orb {
    animation-duration: 5s;
    /* 大屏幕动画稍快 */
  }

  .connection-line {
    stroke-width: 1.5;
    opacity: 0.4;
  }

  /* 大屏幕上的悬停效果增强 */
  .user-orb:hover {
    transform: translate(-50%, -50%) scale(1.1);
  }

  .user-orb:hover .group {
    box-shadow: 0 20px 40px rgba(16, 185, 129, 0.3);
  }
}

/* 超大屏幕优化 */
@media (min-width: 1440px) {
  .connection-line {
    stroke-width: 2;
    opacity: 0.5;
  }

  /* 超大屏幕上的连接线更明显 */
  .connection-line:hover {
    stroke-width: 3;
    opacity: 0.8;
  }
}

/* 深色模式下的连接线 */
@media (prefers-color-scheme: dark) {
  .connection-line {
    stroke: url(#connectionGradientDark);
  }
}

/* 深色模式渐变 */
.starfield-container svg defs {
  --connection-color-dark: #059669;
}

/* 进入动画 */
.user-orb {
  animation: orbEnter 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
    orbFloat 6s ease-in-out infinite 0.8s;
}

@keyframes orbEnter {
  0% {
    transform: translate(-50%, -50%) scale(0) rotate(180deg);
    opacity: 0;
  }

  100% {
    transform: translate(-50%, -50%) scale(1) rotate(0deg);
    opacity: 1;
  }
}

/* 连接线进入动画 */
.connection-line {
  stroke-dasharray: 5, 5;
  animation: lineEnter 1s ease-out forwards,
    lineGlow 3s ease-in-out infinite 1s;
}

@keyframes lineEnter {
  0% {
    stroke-dashoffset: 100;
    opacity: 0;
  }

  100% {
    stroke-dashoffset: 0;
    opacity: 0.2;
  }
}
</style>
