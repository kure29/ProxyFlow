import type { ProxySetRef, TransformId } from './references'

interface TransformBase {
  id: TransformId
  name: string
}

export interface FilterTransformIR extends TransformBase {
  kind: 'filter'
  input: ProxySetRef
  include: string[]
  exclude: string[]
}

export interface RenameTransformIR extends TransformBase {
  kind: 'rename'
  input: ProxySetRef
  pattern?: string
  replacement?: string
}

export interface SortTransformIR extends TransformBase {
  kind: 'sort'
  input: ProxySetRef
  by?: 'name' | 'latency'
  direction?: 'ascending' | 'descending'
}

export interface DeduplicateTransformIR extends TransformBase {
  kind: 'deduplicate'
  input: ProxySetRef
  by?: 'name' | 'server'
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
