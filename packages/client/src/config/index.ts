export const THEME_KEY = 'theme'

export const CHUNK_SIZE = 12 * 1024

export const ResumeConfig = {
  /** 断点续传缓存键前缀 */
  RESUME_CACHE_KEY_PREFIX: 'resume_cache_',
  /** 断点续传数据块键前缀 */
  RESUME_CHUNK_KEY_PREFIX: 'resume_chunk_',
  /** 断点续传元数据键 */
  RESUME_METADATA_KEY: 'resume_metadata',

  localForageOptions: {
    name: 'resumeManager',
    storeName: 'resumeCache',
    description: '断点续传缓存数据',
  } as LocalForageOptions,
}
