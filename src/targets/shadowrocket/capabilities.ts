import { getTargetCapabilities } from '../../core/capabilities'

/** Executable mirror of the paused target's evidence boundary. */
export const SHADOWROCKET_MINIMUM_VERSION = 'audit pending'
export const shadowrocketCapabilities = getTargetCapabilities('shadowrocket')
export const SHADOWROCKET_SUPPORTED_MATCHERS = ['domain', 'domain-suffix', 'domain-keyword', 'ip-cidr', 'ip-cidr6', 'geo-ip'] as const
export const SHADOWROCKET_SUPPORTED_DNS = ['system', 'udp'] as const
