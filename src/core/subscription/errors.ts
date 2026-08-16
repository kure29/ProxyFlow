import type { SubscriptionIssue } from './types'

export function subscriptionIssue(
  code: string,
  severity: SubscriptionIssue['severity'],
  message: string,
  detail: Pick<SubscriptionIssue, 'nodeId' | 'nodeName' | 'line'> = {},
): SubscriptionIssue {
  return { code, severity, message, ...detail }
}

export class SubscriptionFetchError extends Error {
  constructor(public readonly code: 'FETCH_FAILED' | 'CORS_OR_NETWORK_ERROR' | 'SUBSCRIPTION_TOO_LARGE', message: string) {
    super(message)
    this.name = 'SubscriptionFetchError'
  }
}
