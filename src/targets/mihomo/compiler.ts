import { validateIR } from '../../core/semanticValidation'
import { deduplicateDiagnostics } from '../../core/compiler/diagnostics'
import type { ProxyFlowIR } from '../../core/ir'
import type { CompileResult, ConfigCompiler } from '../../core/compiler/compilerTypes'
import { compileMihomoChains } from './chain'
import { checkMihomoCompatibility } from './compatibility'
import { createMihomoContext } from './context'
import { MIHOMO_DEFAULTS } from './defaults'
import { compileMihomoDns } from './dns'
import { mihomoIssue } from './errors'
import type { MihomoConfig } from './model'
import { compileMihomoProviders } from './providers'
import { compileMihomoRules } from './rules'
import { serializeMihomoConfig } from './serializer'
import { compileMihomoStrategies } from './strategies'

export interface MihomoCompileOptions {
  now?: () => Date
}

export function compileMihomo(ir: ProxyFlowIR, options: MihomoCompileOptions = {}): CompileResult {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString()
  const irIssues = validateIR(ir)
  const issues = irIssues.map((issue) => mihomoIssue(
    `IR_${issue.code}`,
    issue.severity,
    'ir',
    issue.message,
    issue.entity?.id ?? issue.nodeId,
  ))
  const compatibility = checkMihomoCompatibility(ir)
  issues.push(...compatibility.issues)
  if (issues.some((issue) => issue.severity === 'error')) return { success: false, content: '', issues: deduplicateDiagnostics(issues), generatedAt, mock: false }

  const context = createMihomoContext(ir, issues)
  compileMihomoProviders(context)
  compileMihomoStrategies(context)
  compileMihomoChains(context)
  const rules = compileMihomoRules(context)

  if (issues.some((issue) => issue.severity === 'error')) return { success: false, content: '', issues: deduplicateDiagnostics(issues), generatedAt, mock: false }

  const config: MihomoConfig = {
    'mixed-port': MIHOMO_DEFAULTS.mixedPort,
    'allow-lan': false,
    mode: 'rule',
    'log-level': 'info',
    ...(context.proxies.size > 0 ? { proxies: [...context.proxies.values()] } : {}),
    ...(context.providers.size > 0 ? { 'proxy-providers': Object.fromEntries(context.providers) } : {}),
    ...(context.groups.length > 0 ? { 'proxy-groups': context.groups } : {}),
    ...(context.ruleProviders.size > 0 ? { 'rule-providers': Object.fromEntries(context.ruleProviders) } : {}),
    rules,
    ...(ir.dns ? { dns: compileMihomoDns(ir.dns) } : {}),
  }
  return { success: true, content: serializeMihomoConfig(config), issues: deduplicateDiagnostics(issues), generatedAt, mock: false }
}

export class MihomoCompiler implements ConfigCompiler {
  readonly target = 'mihomo' as const

  constructor(private readonly now: () => Date = () => new Date()) {}

  async compile(ir: ProxyFlowIR) {
    return compileMihomo(ir, { now: this.now })
  }
}
