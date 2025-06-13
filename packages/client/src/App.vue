<template>
  <router-view />
</template>

<script setup lang="ts">
import { useChangeTheme } from './hooks/useTheme'

useChangeTheme()
</script>