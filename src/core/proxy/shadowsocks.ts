/** Methods supported by both the V0.5 Mihomo and sing-box target baselines. */
const SHADOWSOCKS_METHODS = new Set([
  '2022-blake3-aes-128-gcm',
  '2022-blake3-aes-256-gcm',
  '2022-blake3-chacha20-poly1305',
  'none',
  'aes-128-gcm',
  'aes-192-gcm',
  'aes-256-gcm',
  'chacha20-ietf-poly1305',
  'xchacha20-ietf-poly1305',
  'aes-128-ctr',
  'aes-192-ctr',
  'aes-256-ctr',
  'aes-128-cfb',
  'aes-192-cfb',
  'aes-256-cfb',
  'rc4-md5',
  'chacha20-ietf',
  'xchacha20',
])

export function isSupportedShadowsocksMethod(value: string) {
  return SHADOWSOCKS_METHODS.has(value.toLocaleLowerCase())
}

/** v2ray-plugin is the only plugin name accepted unchanged by both V0.5 targets. */
export function isPortableShadowsocksPlugin(value: string) {
  return value.toLocaleLowerCase() === 'v2ray-plugin'
}
