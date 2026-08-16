import type { ProxySetRef, TransformId } from './references'
import type { RegionCode, SupportedProxyProtocol } from '../proxy'

interface TransformBase {
  id: TransformId
  name: string
}

export type FilterCriterionIR =
  | { mode: 'keyword'; operation: 'include' | 'exclude'; keyword: string }
  | { mode: 'region'; operation: 'include' | 'exclude'; regions: RegionCode[] }
  | { mode: 'regex'; operation: 'include' | 'exclude'; pattern: string; ignoreCase: boolean }

export interface FilterTransformIR extends TransformBase {
  kind: 'filter'
  input: ProxySetRef
  criterion?: FilterCriterionIR
  /** Legacy V0.6 fields remain readable for persisted projects. */
  include: string[]
  exclude: string[]
  includeRegex?: string
  excludeRegex?: string
  includeRegions?: RegionCode[]
  excludeRegions?: RegionCode[]
  includeProtocols?: SupportedProxyProtocol[]
  excludeProtocols?: SupportedProxyProtocol[]
}

export interface RenameTransformIR extends TransformBase {
  kind: 'rename'
  input: ProxySetRef
  mode?: 'simple' | 'regex'
  pattern?: string
  replacement?: string
  ignoreCase?: boolean
  global?: boolean
}

export interface SortTransformIR extends TransformBase {
  kind: 'sort'
  input: ProxySetRef
  by?: 'name' | 'region' | 'protocol' | 'latency'
  direction?: 'ascending' | 'descending'
}

export interface DeduplicateTransformIR extends TransformBase {
  kind: 'deduplicate'
  input: ProxySetRef
  by?: 'identity'
}

export interface MergeTransformIR extends TransformBase {
  kind: 'merge'
  inputs: ProxySetRef[]
}

export interface LimitTransformIR extends TransformBase {
  kind: 'limit'
  input: ProxySetRef
  max?: number
}

export type TransformIR =
  | FilterTransformIR
  | RenameTransformIR
  | SortTransformIR
  | DeduplicateTransformIR
  | MergeTransformIR
  | LimitTransformIR
