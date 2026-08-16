import type { SingBoxConfig } from './model'

export function serializeSingBoxConfig(config: SingBoxConfig) {
  return `${JSON.stringify(config, null, 2)}\n`
}
