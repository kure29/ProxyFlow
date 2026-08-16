import type { ChainStrategyIR } from '../../core/ir'
import type { SingBoxCompileContext, SingBoxStrategyTemplate } from './context'
import { singBoxIssue } from './errors'
import type { SingBoxOutbound } from './model'

export function compileSingBoxChains(context: SingBoxCompileContext) {
  for (const chain of context.ir.strategies.filter((strategy): strategy is ChainStrategyIR => strategy.kind === 'chain')) {
    lowerSingBoxChain(chain, context)
  }
}

export function lowerSingBoxChain(chain: ChainStrategyIR, context: SingBoxCompileContext) {
  if (chain.hops.length < 2) return
  if (new Set(chain.hops.map((hop) => hop.id)).size !== chain.hops.length) {
    context.issues.push(singBoxIssue(
      'SINGBOX_CHAIN_CYCLE', 'error', 'chain', `Chain “${chain.name}” 包含重复 hop，拒绝 lowering。`, chain.id,
    ))
    return
  }
  const templates = chain.hops.map((hop) => context.strategyTemplates.get(hop.id))
  if (templates.some((template) => !template || template.memberTags.some((tag) => !isDialCapable(context.outbounds.get(tag))))) {
    context.issues.push(singBoxIssue(
      'SINGBOX_CHAIN_REQUIRES_RESOLVED_OUTBOUND', 'error', 'chain',
      `Chain “${chain.name}” 的 hop 必须直接包含已解析 proxy outbound。`, chain.id,
    ))
    return
  }

  const chainTag = context.strategyTags.get(chain.id)!
  let dialerTag = templates[0]!.tag
  let compiledTemplate: SingBoxStrategyTemplate | undefined

  for (let index = 1; index < templates.length; index += 1) {
    const template = templates[index]!
    const isLast = index === templates.length - 1
    const derivedMembers = template.memberTags.map((memberTag) => {
      const outbound = context.outbounds.get(memberTag)!
      const tag = template.kind === 'fixed' && isLast
        ? chainTag
        : context.names.allocate(`${chain.name} · Hop ${index + 1} · ${memberTag}`, `${chain.id}-${index}-${memberTag}`)
      context.outbounds.set(tag, withDetour(outbound, tag, dialerTag))
      return tag
    })

    if (template.kind === 'fixed') {
      dialerTag = derivedMembers[0]
      compiledTemplate = { kind: 'fixed', tag: dialerTag, memberTags: derivedMembers }
      continue
    }

    const groupTag = isLast ? chainTag : context.names.allocate(`${chain.name} · Hop ${index + 1}`, `${chain.id}-hop-${index + 1}`)
    const original = context.outbounds.get(template.tag)
    if (template.kind === 'urltest' && original?.type === 'urltest') context.outbounds.set(groupTag, {
      ...original, tag: groupTag, outbounds: derivedMembers,
    })
    else context.outbounds.set(groupTag, { type: 'selector', tag: groupTag, outbounds: derivedMembers, default: derivedMembers[0] })
    dialerTag = groupTag
    compiledTemplate = { ...template, tag: groupTag, memberTags: derivedMembers }
  }

  if (compiledTemplate) context.strategyTemplates.set(chain.id, compiledTemplate)
}

function isDialCapable(outbound: SingBoxOutbound | undefined) {
  return Boolean(outbound && ['socks', 'http', 'shadowsocks', 'trojan', 'vmess', 'vless'].includes(outbound.type))
}

function withDetour(outbound: SingBoxOutbound, tag: string, detour: string): SingBoxOutbound {
  if (!['socks', 'http', 'shadowsocks', 'trojan', 'vmess', 'vless'].includes(outbound.type)) return outbound
  const dialOutbound = outbound as Extract<SingBoxOutbound, { type: 'socks' | 'http' | 'shadowsocks' | 'trojan' | 'vmess' | 'vless' }>
  const { domain_resolver: _domainResolver, ...base } = dialOutbound
  return { ...base, tag, detour } as SingBoxOutbound
}
