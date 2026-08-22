import { getTargetCapabilities } from '../../core/capabilities'
import type { RemoteProxySourceIR } from '../../core/ir'
import { stableOpaqueHash } from '../../core/proxy'
import type { RemoteProxySourceAdapter } from '../../core/proxySet'
import { MIHOMO_DEFAULTS } from './defaults'
import type { MihomoProxyProvider } from './model'
import { safePathSegment } from './naming'

export interface MihomoRemoteProviderLowering {
  key: string
  provider: MihomoProxyProvider
}

export const mihomoRemoteProxySourceAdapter: RemoteProxySourceAdapter<MihomoRemoteProviderLowering> = {
  capabilities: getTargetCapabilities('mihomo').remoteProxySource,
  lower(source) {
    const key = mihomoRemoteProviderKey(source)
    return {
      key,
      provider: {
        type: 'http',
        url: source.url,
        path: `./providers/${safePathSegment(key)}.yaml`,
        interval: MIHOMO_DEFAULTS.providerIntervalSeconds,
        header: { 'User-Agent': ['Clash.Meta'] },
      },
    }
  },
}

export function mihomoRemoteProviderKey(source: Pick<RemoteProxySourceIR, 'id'>) {
  const stablePart = source.id.normalize('NFKC').toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 36) || 'source'
  return `pf-${stablePart}-${stableOpaqueHash(source.id)}`
}
