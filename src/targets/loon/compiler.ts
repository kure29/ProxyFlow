import { deduplicateDiagnostics } from '../../core/compiler/diagnostics'
import type { CompileResult, ConfigCompiler } from '../../core/compiler/compilerTypes'
import type { ProxyFlowIR } from '../../core/ir'
import { validateIR } from '../../core/semanticValidation'
import { checkLoonCompatibility } from './compatibility'
import { createLoonContext } from './context'
import { planLoonDns } from './dns'
import { loonIssue } from './errors'
import { compileLoonRouting } from './routing'
import { serializeLoonProfile } from './serializer'
import { compileLoonStrategies } from './strategies'
import { createLoonProjectionContext, loonProjectionStats, type LoonProjectionContext } from './projection'

export interface LoonCompileOptions {
  now?: () => Date
}

export function compileLoon(ir: ProxyFlowIR, options: LoonCompileOptions = {}): CompileResult {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString()
  const irIssues = validateIR(ir)
  const issues = irIssues.map((issue) => loonIssue(
    `IR_${issue.code}`, issue.severity, 'ir', issue.message, issue.entity?.id ?? issue.nodeId,
  ))
  const projection = createLoonProjectionContext()
  const compatibility = checkLoonCompatibility(ir, projection)
  issues.push(...compatibility.issues)
  if (!compatibility.supported || irIssues.some((issue) => issue.severity === 'error')) return failed(issues, generatedAt, projection)

  const context = createLoonContext(ir, issues, projection)
  compileLoonStrategies(context)
  const routing = compileLoonRouting(context)
  const dns = planLoonDns(ir.dns)
  issues.push(...dns.issues)
  if (issues.some((issue) => issue.severity === 'error')) return failed(issues, generatedAt, projection)

  let content: string
  try {
    content = serializeLoonProfile({
      general: dns.general,
      proxies: context.proxies,
      proxyGroups: context.proxyGroups,
      rules: routing.rules,
      remoteRules: routing.remoteRules,
    })
  } catch (error) {
    issues.push(loonIssue(
      'LOON_SERIALIZER_UNSAFE_VALUE', 'error', 'serialization',
      error instanceof Error ? error.message : 'Loon serializer rejected an unsafe value.', 'serializer',
    ))
    return failed(issues, generatedAt, projection)
  }

  const finalIssues = deduplicateDiagnostics(issues)
  return {
    success: true,
    content,
    issues: finalIssues,
    generatedAt,
    mock: false,
    stats: compileStats(projection, finalIssues, context.proxies.length, context.registeredProxyIds.size),
  }
}

function failed(issues: CompileResult['issues'], generatedAt: string, projection: LoonProjectionContext): CompileResult {
  const finalIssues = deduplicateDiagnostics(issues)
  return {
    success: false,
    content: '',
    issues: finalIssues,
    generatedAt,
    mock: false,
    stats: compileStats(projection, finalIssues, 0, 0),
  }
}

function compileStats(
  projection: LoonProjectionContext,
  issues: CompileResult['issues'],
  proxyCount: number,
  endpointCount: number,
): NonNullable<CompileResult['stats']> {
  const projected = loonProjectionStats(projection)
  return {
    proxyCount,
    endpointCount,
    candidateCount: projected.candidateCount,
    compatibleEndpointCount: projected.compatibleEndpointCount,
    skippedEndpointCount: projected.skippedEndpointCount,
    blockingIssueCount: issues.filter((issue) => issue.severity === 'error').length,
  }
}

export class LoonCompiler implements ConfigCompiler {
  readonly target = 'loon' as const

  constructor(private readonly now: () => Date = () => new Date()) {}

  async compile(ir: ProxyFlowIR) {
    return compileLoon(ir, { now: this.now })
  }
}
