/** JSON-safe values accepted by the endpoint opaque-preservation boundary. */
export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
export interface JsonObject {
  readonly [key: string]: JsonValue
}

/** Provenance for the currently supported same-target preservation path. */
export interface OpaqueProxyOrigin {
  kind: 'target'
  target: 'mihomo'
  format: 'clash-yaml' | 'clash-json'
}

/** Optional unknown endpoint fields carried alongside modeled proxy semantics. */
export interface OpaqueProxyPreservation {
  readonly origin: OpaqueProxyOrigin
  readonly fields: JsonObject
}

export function isOpaqueProxyPreservation(value: unknown): value is OpaqueProxyPreservation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as { origin?: unknown; fields?: unknown }
  if (!candidate.origin || typeof candidate.origin !== 'object' || Array.isArray(candidate.origin)) return false
  const origin = candidate.origin as Record<string, unknown>
  return origin.kind === 'target'
    && origin.target === 'mihomo'
    && (origin.format === 'clash-yaml' || origin.format === 'clash-json')
    && cloneJsonObject(candidate.fields) !== undefined
}

/**
 * Clone an arbitrary value into the restricted JSON-safe shape used by the
 * preservation boundary. Undefined, functions, non-finite numbers, and
 * prototype-bearing objects are intentionally not preserved.
 */
export function cloneJsonObject(value: unknown): JsonObject | undefined {
  if (!isPlainObject(value)) return undefined
  const cloned = cloneJsonValue(value)
  return isPlainObject(cloned) ? cloned as JsonObject : undefined
}

export function cloneJsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (Array.isArray(value)) {
    const cloned = value.map((item) => cloneJsonValue(item))
    return cloned.every((item): item is JsonValue => item !== undefined) ? cloned : undefined
  }
  if (!isPlainObject(value)) return undefined
  const entries = Object.entries(value).flatMap(([key, item]) => {
    const cloned = cloneJsonValue(item)
    return cloned === undefined ? [] : [[key, cloned] as const]
  })
  return Object.fromEntries(entries)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
