import type { ResolvedProxyEndpointIR } from '../proxy'
import { getTargetCapabilities, type CapabilityStatus, type PrimaryTarget, type TransportCapability } from './targetCapabilities'

export interface TargetProxyCompatibility {
  status: CapabilityStatus
  unsupportedFeatures: string[]
}

export function proxyCompatibilityForTarget(
  proxy: ResolvedProxyEndpointIR,
  target: PrimaryTarget,
): TargetProxyCompatibility {
  const capabilities = getTargetCapabilities(target)
  const declarations = [capabilities.protocols[proxy.protocol]]
  if ('transport' in proxy && proxy.transport) {
    const transport: TransportCapability = proxy.transport.kind === 'http'
      ? proxy.transport.variant
      : proxy.transport.kind
    declarations.push(capabilities.transports[transport])
  }
  if (declarations.some(({ status }) => status === 'unsupported')) {
    return { status: 'unsupported', unsupportedFeatures: declarations.flatMap((item) => item.reason ? [item.reason] : []) }
  }

  const unsupportedFeatures = (proxy.metadata?.compatibility?.unsupportedFeatures ?? [])
    .filter((feature) => !featureSupportedByTarget(feature, proxy, target))
  if (unsupportedFeatures.length > 0 || declarations.some(({ status }) => status === 'partial')) {
    return { status: 'partial', unsupportedFeatures }
  }
  if (proxy.metadata?.compatibility?.status === 'partial'
    || declarations.some(({ status }) => status === 'target-native')) {
    return { status: 'target-native', unsupportedFeatures: [] }
  }
  return { status: 'supported', unsupportedFeatures: [] }
}

function featureSupportedByTarget(feature: string, proxy: ResolvedProxyEndpointIR, target: PrimaryTarget) {
  if (proxy.protocol !== 'shadowsocks' || !feature.startsWith('plugin:')) return false
  const plugin = feature.slice('plugin:'.length).trim().toLocaleLowerCase()
  return getTargetCapabilities(target).proxyVariants.shadowsocksPlugins.includes(plugin)
}
