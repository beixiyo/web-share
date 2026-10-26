/// <reference types="vite/client" />

/** 强制输出为独立文件的下载 Worker URL，不能内联成 data URL */
declare module '*?no-inline&url' {
  const url: string
  export default url
}

interface ImportMetaEnv {
  // Auto generate by env-parse
  readonly VITE_SERVER_URL: string
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
