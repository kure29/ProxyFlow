import type { SubscriptionIssue, SubscriptionRefreshErrorCode } from './types'

export function subscriptionIssue(
  code: string,
  severity: SubscriptionIssue['severity'],
  message: string,
  detail: Pick<SubscriptionIssue, 'nodeId' | 'nodeName' | 'line'> = {},
): SubscriptionIssue {
  return { code, severity, message, ...detail }
}

export class SubscriptionFetchError extends Error {
  constructor(
    public readonly code: Extract<SubscriptionRefreshErrorCode,
      | 'SUBSCRIPTION_INVALID_URL'
      | 'SUBSCRIPTION_HTTP_ERROR'
      | 'SUBSCRIPTION_CORS_BLOCKED'
      | 'SUBSCRIPTION_NETWORK_ERROR'
      | 'SUBSCRIPTION_TIMEOUT'
      | 'SUBSCRIPTION_TOO_LARGE'
      | 'SUBSCRIPTION_REFRESH_SUPERSEDED'>,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message)
    this.name = 'SubscriptionFetchError'
  }
}
