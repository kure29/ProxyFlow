import type { StrategyIR } from '../ir'

export function detectChainCycles(strategies: StrategyIR[]): string[][] {
  const chains = new Map(strategies.filter((strategy) => strategy.kind === 'chain').map((chain) => [chain.id, chain]))
  const state = new Map<string, 'visiting' | 'visited'>()
  const stack: string[] = []
  const cycles: string[][] = []
  const signatures = new Set<string>()

  const visit = (id: string) => {
    if (state.get(id) === 'visited') return
    if (state.get(id) === 'visiting') {
      const cycle = [...stack.slice(stack.indexOf(id)), id]
      const signature = canonicalCycleSignature(cycle.slice(0, -1))
      if (!signatures.has(signature)) {
        signatures.add(signature)
        cycles.push(cycle)
      }
      return
    }
    state.set(id, 'visiting')
    stack.push(id)
    const chain = chains.get(id)
    for (const hop of chain?.hops ?? []) {
      if (hop.id !== id && chains.has(hop.id)) visit(hop.id)
    }
    stack.pop()
    state.set(id, 'visited')
  }

  for (const id of chains.keys()) visit(id)
  return cycles
}

function canonicalCycleSignature(ids: string[]) {
  if (ids.length === 0) return ''
  const rotations = ids.map((_, index) => [...ids.slice(index), ...ids.slice(0, index)].join('|'))
  return rotations.sort()[0]
}
