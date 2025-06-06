import { twMerge, type ClassNameValue } from 'tailwind-merge'

/**
 * tailwindCSS 类合并
 */
export function cn(...inputs: ClassNameValue[]) {
  return twMerge(inputs)
}
