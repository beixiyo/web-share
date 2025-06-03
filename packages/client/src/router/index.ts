import { createRouter, createWebHistory } from 'vue-router'
import { genRoutes } from '@jl-org/vite-auto-route'


const routes = genRoutes()

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
