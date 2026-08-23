import { deduplicateDiagnostics } from '../../core/compiler/diagnostics'
import type { CompileResult, ConfigCompiler } from '../../core/compiler/compilerTypes'
import type { ProxyFlowIR } from '../../core/ir'
import { validateIR } from '../../core/semanticValidation'
import { checkSurgeCompatibility } from './compatibility'
import { createSurgeContext } from './context'
import { planSurgeDns } from './dns'
import { surgeIssue } from './errors'
import { composeSurgeGeneral } from './general'
import { compileSurgeGeneral } from './health'
import { createSurgeProjectionContext, surgeProjectionStats, type SurgeProjectionContext } from './projection'
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
  const projection = createSurgeProjectionContext()
  const compatibility = checkSurgeCompatibility(ir, projection)
  issues.push(...compatibility.issues)
  if (!compatibility.supported || irIssues.some((issue) => issue.severity === 'error')) return failed(issues, generatedAt, projection)

  const context = createSurgeContext(ir, issues, projection)
  compileSurgeStrategies(context)
  const rules = compileSurgeRules(context)
  const general = composeSurgeGeneral([
    compileSurgeGeneral(ir),
    planSurgeDns(ir.dns).general,
  ], issues)
  if (issues.some((issue) => issue.severity === 'error')) return failed(issues, generatedAt, projection)

  const content = serializeSurgeProfile({
    general,
    proxies: context.proxies,
    proxyGroups: context.proxyGroups,
    rules,
  })
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

function failed(
  issues: CompileResult['issues'],
  generatedAt: string,
  projection: SurgeProjectionContext,
): CompileResult {
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
  projection: SurgeProjectionContext,
  issues: CompileResult['issues'],
  proxyCount: number,
  endpointCount: number,
): NonNullable<CompileResult['stats']> {
  const projected = surgeProjectionStats(projection)
  return {
    proxyCount,
    endpointCount,
    candidateCount: projected.candidateCount,
    compatibleEndpointCount: projected.compatibleEndpointCount,
    skippedEndpointCount: projected.skippedEndpointCount,
    blockingIssueCount: issues.filter((issue) => issue.severity === 'error').length,
  }
}

export class SurgeCompiler implements ConfigCompiler {
  readonly target = 'surge' as const

  constructor(private readonly now: () => Date = () => new Date()) {}

  async compile(ir: ProxyFlowIR) {
    return compileSurge(ir, { now: this.now })
  }
}
