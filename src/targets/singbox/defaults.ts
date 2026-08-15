export const SINGBOX_BASELINE_VERSION = '1.13.14'

export const SINGBOX_DEFAULTS = {
  healthCheckUrl: 'https://www.gstatic.com/generate_204',
  healthCheckIntervalSeconds: 300,
  healthCheckToleranceMs: 50,
  ruleSetUpdateInterval: '1d',
} as const
