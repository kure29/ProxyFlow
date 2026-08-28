/**
 * Shared safety contract for values written as one Surge configuration token.
 * Keep this below the target adapter so target-native Config validation and
 * Surge serialization use the same authoritative rules.
 */
export function isSafeSurgeSerializedString(value: unknown): value is string {
  return typeof value === 'string' && !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value)
}

export function isSafeSurgeHttpUrl(value: unknown): value is string {
  if (!isSafeSurgeSerializedString(value) || !value) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch {
    return false
  }
}
