import type { ProxyFlowIR } from '../../core/ir'
import type { SurgeGeneralEntry } from './model'

export function compileSurgeGeneral(ir: ProxyFlowIR): SurgeGeneralEntry[] {
  const testingStrategies = ir.strategies.filter((strategy) => strategy.kind === 'auto-select' || strategy.kind === 'fallback')
  if (testingStrategies.length === 0 || testingStrategies.some((strategy) => !strategy.healthCheck?.url)) return []
  const urls = new Set(testingStrategies.map((strategy) => strategy.healthCheck!.url!))
  if (urls.size !== 1 || ir.strategies.some((strategy) => strategy.kind === 'select' || strategy.kind === 'fixed')) return []
  return [{ key: 'proxy-test-url', value: [...urls][0] }]
}
