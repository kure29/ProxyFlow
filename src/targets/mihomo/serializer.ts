import { stringify } from 'yaml'
import type { MihomoConfig } from './model'

export function serializeMihomoConfig(config: MihomoConfig) {
  return stringify(config, {
    lineWidth: 0,
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
  })
}
