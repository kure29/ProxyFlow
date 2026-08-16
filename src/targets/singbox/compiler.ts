import type { CompileResult, ConfigCompiler } from '../../core/compiler/compilerTypes'
import { deduplicateDiagnostics } from '../../core/compiler/diagnostics'
import type { ProxyFlowIR } from '../../core/ir'
import { validateIR } from '../../core/semanticValidation'
import { compileSingBoxChains } from './chain'
import { checkSingBoxCompatibility } from './compatibility'
import { createSingBoxContext } from './context'
import { compileSingBoxDns } from './dns'
import { singBoxIssue } from './errors'
import type { SingBoxConfig } from './model'
import { compileSingBoxProxyOutbounds } from './outbounds'
import { compileSingBoxRouting } from './rules'
import { serializeSingBoxConfig } from './serializer'
import { compileSingBoxStrategies } from './strategies'

export interface SingBoxCompileOptions {
  now?: () => Date
}

export function compileSingBox(ir: ProxyFlowIR, options: SingBoxCompileOptions = {}): CompileResult {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString()
  const irIssues = validateIR(ir)
  const issues = irIssues.map((issue) => singBoxIssue(
    `IR_${issue.code}`, issue.severity, 'ir', issue.message, issue.entity?.id ?? issue.nodeId,
  ))
  const compatibility = checkSingBoxCompatibility(ir)
  issues.push(...compatibility.issues)
  if (!compatibility.supported || irIssues.some((issue) => issue.severity === 'error')) return failed(issues, generatedAt)

  const context = createSingBoxContext(ir, issues)
  const dns = compileSingBoxDns(ir.dns, context)
  compileSingBoxProxyOutbounds(context)
  compileSingBoxStrategies(context)
  compileSingBoxChains(context)
  const routing = compileSingBoxRouting(context)
  if (issues.some((issue) => issue.severity === 'error')) return failed(issues, generatedAt)

  const config: SingBoxConfig = {
    log: { level: 'info' },
    ...(dns ? { dns } : {}),
    outbounds: [...context.outbounds.values()],
    route: {
      rules: routing.rules,
      ...(context.ruleSets.size > 0 ? { rule_set: [...context.ruleSets.values()] } : {}),
      final: routing.final,
      ...(context.dnsTag ? { default_domain_resolver: context.dnsTag } : {}),
    },
  }
  return { success: true, content: serializeSingBoxConfig(config), issues: deduplicateDiagnostics(issues), generatedAt, mock: false }
}

function failed(issues: CompileResult['issues'], generatedAt: string): CompileResult {
  return { success: false, content: '', issues: deduplicateDiagnostics(issues), generatedAt, mock: false }
}

export class SingBoxCompiler implements ConfigCompiler {
  readonly target = 'sing-box' as const

  constructor(private readonly now: () => Date = () => new Date()) {}

  async compile(ir: ProxyFlowIR) {
    return compileSingBox(ir, { now: this.now })
  }
}
