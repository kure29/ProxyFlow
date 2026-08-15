export function isSafeHttpUrl(value: string | undefined) {
  if (!value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function isValidServer(value: string) {
  return value.trim().length > 0 && !/[\s\r\n]/.test(value)
}
