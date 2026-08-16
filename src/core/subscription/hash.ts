function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return bytesToHex(new Uint8Array(digest))
}

export async function sourceConfigFingerprint(inputKind: 'url' | 'paste' | 'file', value: string): Promise<string> {
  const normalized = inputKind === 'url' ? normalizeUrl(value) : value
  return sha256(JSON.stringify({ version: 1, inputKind, value: normalized }))
}

function normalizeUrl(value: string) {
  const trimmed = value.trim()
  try {
    const url = new URL(trimmed)
    url.protocol = url.protocol.toLowerCase()
    url.hostname = url.hostname.toLowerCase()
    return url.toString()
  } catch {
    return trimmed
  }
}
