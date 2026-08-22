import type { SubscriptionRequestProfile } from './types'

export const SUBSCRIPTION_REQUEST_PROFILES = ['auto', 'mihomo', 'sing-box', 'generic'] as const

const profileSet = new Set<string>(SUBSCRIPTION_REQUEST_PROFILES)

export function isSubscriptionRequestProfile(value: unknown): value is SubscriptionRequestProfile {
  return typeof value === 'string' && profileSet.has(value)
}

export function normalizeSubscriptionRequestProfile(value: unknown): SubscriptionRequestProfile {
  return isSubscriptionRequestProfile(value) ? value : 'auto'
}

export function subscriptionRequestUserAgents(profile: SubscriptionRequestProfile): readonly string[] {
  if (profile === 'auto') return ['Clash.Meta', 'mihomo', 'sing-box', 'ProxyFlow-Runtime/1.0']
  if (profile === 'mihomo') return ['Clash.Meta']
  if (profile === 'sing-box') return ['sing-box']
  return ['ProxyFlow-Runtime/1.0']
}
