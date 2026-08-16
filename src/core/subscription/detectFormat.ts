import { decodeBase64Text } from './base64'
import { parseClashSubscription } from './parseClash'
import { containsShareLinks } from './parseShareLinks'
import type { ParseSubscriptionOptions, SubscriptionFormat } from './types'

export interface DetectedSubscriptionFormat {
  format: SubscriptionFormat
  decoded?: string
}

export function detectSubscriptionFormat(input: string, options: ParseSubscriptionOptions): DetectedSubscriptionFormat {
  if (parseClashSubscription(input, options)) return { format: 'clash-yaml' }
  if (containsShareLinks(input)) return { format: 'share-links' }
  const decoded = decodeBase64Text(input)
  if (decoded && containsShareLinks(decoded)) return { format: 'base64', decoded }
  return { format: 'unsupported' }
}
