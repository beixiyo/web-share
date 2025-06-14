import { type ClassNameValue, twMerge } from 'tailwind-merge'

/**
 * tailwindCSS 类合并
 */
export function cn(...inputs: ClassNameValue[]) {
  return twMerge(inputs)
}
