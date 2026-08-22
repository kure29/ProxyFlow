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
      | 'SUBSCRIPTION_RUNTIME_UNAVAILABLE'
      | 'SUBSCRIPTION_RUNTIME_POLICY_BLOCKED'
      | 'SUBSCRIPTION_TLS_ERROR'
      | 'SUBSCRIPTION_REQUEST_PROFILE_INVALID'
      | 'SUBSCRIPTION_CONTENT_ENCODING_ERROR'
      | 'SUBSCRIPTION_TOO_LARGE'
      | 'SUBSCRIPTION_UNSUPPORTED_FORMAT'
      | 'SUBSCRIPTION_PARSE_FAILED'
      | 'SUBSCRIPTION_NO_USABLE_NODES'
      | 'SUBSCRIPTION_REFRESH_SUPERSEDED'>,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message)
    this.name = 'SubscriptionFetchError'
  }
}
