import { createApp } from 'vue'
import directives from '@/directives'
import App from './App.vue'
import i18n from './i18n'
import router from './router'
import 'virtual:uno.css'
import '@/styles/css/index.css'
import '@/plugins'

const app = createApp(App)

app
  .use(router)
  .use(i18n)
  .use(directives)
  .mount('#app')
