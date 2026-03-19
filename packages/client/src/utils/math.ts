export function formatByte(bytes: number): string {
  if (bytes === 0)
    return '0 B'
  if (bytes < 0)
    return `-${formatByte(-bytes)}`

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1,
  )

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}
