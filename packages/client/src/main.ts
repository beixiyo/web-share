import 'virtual:uno.css'
import '@/styles/index.css'
import '@/plugins'
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import directives from '@/directives'


const app = createApp(App)

app
  .use(router)
  .use(directives)
  .mount('#app')
