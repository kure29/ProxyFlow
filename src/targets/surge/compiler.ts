import { deduplicateDiagnostics } from '../../core/compiler/diagnostics'
import type { CompileResult, ConfigCompiler } from '../../core/compiler/compilerTypes'
import type { ProxyFlowIR } from '../../core/ir'
import { validateIR } from '../../core/semanticValidation'
import { checkSurgeCompatibility } from './compatibility'
import { createSurgeContext } from './context'
import { surgeIssue } from './errors'
import { compileSurgeRules } from './rules'
import { serializeSurgeProfile } from './serializer'
import { compileSurgeStrategies } from './strategies'

export interface SurgeCompileOptions {
  now?: () => Date
}

export function compileSurge(ir: ProxyFlowIR, options: SurgeCompileOptions = {}): CompileResult {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString()
  const irIssues = validateIR(ir)
  const issues = irIssues.map((issue) => surgeIssue(
    `IR_${issue.code}`, issue.severity, 'ir', issue.message, issue.entity?.id ?? issue.nodeId,
  ))
  const compatibility = checkSurgeCompatibility(ir)
  issues.push(...compatibility.issues)
  if (!compatibility.supported || irIssues.some((issue) => issue.severity === 'error')) return failed(issues, generatedAt)

  const context = createSurgeContext(ir, issues)
  compileSurgeStrategies(context)
  const rules = compileSurgeRules(context)
  if (issues.some((issue) => issue.severity === 'error')) return failed(issues, generatedAt)

  const content = serializeSurgeProfile({
    general: [],
    proxies: context.proxies,
    proxyGroups: context.proxyGroups,
    rules,
  })
  return {
    success: true,
    content,
    issues: deduplicateDiagnostics(issues),
    generatedAt,
    mock: false,
    stats: { proxyCount: context.proxies.length, endpointCount: context.registeredProxyIds.size },
  }
}

function failed(issues: CompileResult['issues'], generatedAt: string): CompileResult {
  return { success: false, content: '', issues: deduplicateDiagnostics(issues), generatedAt, mock: false }
}

export class SurgeCompiler implements ConfigCompiler {
  readonly target = 'surge' as const

  constructor(private readonly now: () => Date = () => new Date()) {}

  async compile(ir: ProxyFlowIR) {
    return compileSurge(ir, { now: this.now })
  }
}
