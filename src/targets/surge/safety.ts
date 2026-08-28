/**
 * Surge values that are written into a single serialized token must not be
 * able to introduce control or line-separator characters.
 */
export function isSafeSurgeSerializedString(value: unknown): value is string {
  return typeof value === 'string' && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)
}

/**
 * The General proxy-test-url retains the existing absolute HTTP(S) contract.
 * The control check intentionally runs before URL parsing because URL() may
 * normalize some whitespace and separator characters.
 */
export function isSafeSurgeHttpUrl(value: unknown): value is string {
  if (!isSafeSurgeSerializedString(value) || !value) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch {
    return false
  }
}
