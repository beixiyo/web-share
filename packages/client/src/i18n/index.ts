/** 管理应用语言、翻译资源及页面语言属性 */
import { watch } from 'vue'
import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import zh from './locales/zh.json'

const storedLanguage = localStorage.getItem('language')
const initialLanguage = storedLanguage === 'zh' || storedLanguage === 'en'
  ? storedLanguage
  : navigator.language.startsWith('zh') ? 'zh' : 'en'

const i18n = createI18n({
  legacy: false,
  locale: initialLanguage,
  fallbackLocale: 'en',
  messages: {
    en,
    zh,
  },
})

watch(i18n.global.locale, (locale) => {
  document.documentElement.lang = locale
  localStorage.setItem('language', locale)
}, { immediate: true, flush: 'sync' })

export default i18n
