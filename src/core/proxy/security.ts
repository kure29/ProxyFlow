const SENSITIVE_QUERY_KEYS = /^(token|key|secret|password|passwd|auth|authorization|access_token|apikey|api_key)$/i

export function redactSecret(value: string | undefined, visibleSuffix = 0): string | undefined {
  if (value === undefined) return undefined
  if (value.length === 0) return ''
  return visibleSuffix > 0 ? `${'*'.repeat(Math.max(3, value.length - visibleSuffix))}${value.slice(-visibleSuffix)}` : '***'
}

export function redactSubscriptionUrl(value: string): string {
  try {
    const url = new URL(value)
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.test(key)) url.searchParams.set(key, '***')
    }
    if (url.username) url.username = '***'
    if (url.password) url.password = '***'
    return url.toString()
  } catch {
    return value.replace(/([?&](?:token|key|secret|password|auth)\s*=)[^&#\s]+/gi, '$1***')
  }
}

export function maskServer(server: string): string {
  if (!server) return '—'
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(server)) {
    const parts = server.split('.')
    return `${parts[0]}.${parts[1]}.***.***`
  }
  const labels = server.split('.')
  if (labels.length < 2) return `${server.slice(0, 2)}***`
  return `${labels[0].slice(0, 2)}***.${labels.slice(-2).join('.')}`
}
