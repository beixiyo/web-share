import { createRouter, createWebHistory } from 'vue-router'
import { genRoutes } from '@jl-org/vite-auto-route'


// 拿到 /src/views 下所有 index.vue 作为路由
const views = genRoutes({
  globComponentsImport: () => import.meta.glob('/src/views/**/index.vue'),
  indexFileName: '/index.vue',
  routerPathFolder: '/src/views',
  pathPrefix: /^\/src\/views/,
})
// 拿到 /src/components 下所有 Test.vue 作为路由
const components = genRoutes({
  globComponentsImport: () => import.meta.glob('/src/components/**/Test.vue'),
  indexFileName: '/Test.vue',
  routerPathFolder: '/src/components',
  pathPrefix: /^\/src\/components/,
})

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: views.concat(components),
})

export default router
