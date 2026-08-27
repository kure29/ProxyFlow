import { parseDocument } from 'yaml'
import { getTargetCapabilities, type PrimaryTarget } from '../capabilities'
import { normalizeCustomMatcher, type TrafficMatcherIR } from '../ir'
import type {
  CustomRuleSource, CustomRuleSourceFormat, ServiceMatcherDefinition,
} from '../../types/services'

export type CustomRuleSourceRequestedFormat = 'auto' | CustomRuleSourceFormat

export interface CustomRuleSourceInput {
  id: string
  name: string
  inputKind: 'file' | 'url'
  content: string
  requestedFormat?: CustomRuleSourceRequestedFormat
  fileName?: string
  url?: string
  icon?: string
  enabled?: boolean
}

export interface CustomRuleSourceIssue {
  code: string
  severity: 'warning' | 'error'
  message: string
  line?: number
}

export type CustomRuleSourceParseResult =
  | { ok: true; source: CustomRuleSource; issues: CustomRuleSourceIssue[] }
  | { ok: false; issues: CustomRuleSourceIssue[] }

type RuleLineDialect = 'policy-bearing' | 'policy-less'

interface ExtractedRuleLines {
  lines: ExtractedRuleLine[]
  dialect: RuleLineDialect
}

interface ExtractedRuleLine {
  value: string
  line: number
}

const MAX_SOURCE_BYTES = 1_000_000
const MAX_RULES = 10_000

export function detectCustomRuleSourceFormat(content: string, fileName?: string): CustomRuleSourceFormat {
  const extension = fileName?.toLowerCase().match(/\.([^.]+)$/)?.[1]
  if (extension === 'yaml' || extension === 'yml') return 'mihomo-yaml'
  const head = content.trimStart().slice(0, 200)
  if (/^(?:---\s*)?\[(?:Rule|General|Proxy|Proxy Group)\]\s*$/im.test(head)) return 'surge-list'
  if (/^(?:---\s*)?(?:payload|rules)\s*:/i.test(head) || head.startsWith('[') || head.startsWith('{')) return 'mihomo-yaml'
  return 'surge-list'
}

export function parseCustomRuleSource(input: CustomRuleSourceInput): CustomRuleSourceParseResult {
  const issues: CustomRuleSourceIssue[] = []
  const name = input.name.trim()
  if (!name) issues.push(error('RULE_SOURCE_NAME_REQUIRED', 'Rule source name is required.'))
  if (!input.id.trim()) issues.push(error('RULE_SOURCE_ID_REQUIRED', 'Rule source ID is required.'))
  if (!input.content.trim()) issues.push(error('RULE_SOURCE_EMPTY', 'Rule source is empty.'))
  if (new TextEncoder().encode(input.content).byteLength > MAX_SOURCE_BYTES) {
    issues.push(error('RULE_SOURCE_TOO_LARGE', 'Rule source exceeds the 1 MB first-phase limit.'))
  }
  if (input.inputKind === 'url' && !isSafeSourceUrl(input.url)) {
    issues.push(error('RULE_SOURCE_URL_INVALID', 'Rule source URL must use http or https and must not include credentials.'))
  }
  if (issues.some((issue) => issue.severity === 'error')) return { ok: false, issues }

  const detected = detectCustomRuleSourceFormat(input.content, input.fileName ?? input.url)
  const format = input.requestedFormat && input.requestedFormat !== 'auto' ? input.requestedFormat : detected
  if (input.requestedFormat && input.requestedFormat !== 'auto' && input.requestedFormat !== detected) {
    issues.push({ code: 'RULE_SOURCE_FORMAT_OVERRIDE', severity: 'warning', message: `Detected ${detected}; parsed as the selected ${format} format.` })
  }

  const extracted = format === 'mihomo-yaml'
    ? extractMihomoRuleLines(input.content, issues)
    : extractSurgeRuleLines(input.content)
  if (!extracted) return { ok: false, issues }
  const { lines, dialect } = extracted
  if (lines.length > MAX_RULES) issues.push(error('RULE_SOURCE_TOO_MANY_RULES', `Rule source exceeds the ${MAX_RULES} rule first-phase limit.`))

  const matchers: ServiceMatcherDefinition[] = []
  for (const extractedLine of lines) {
    const normalized = normalizeRuleLine(extractedLine.value, extractedLine.line, dialect, issues)
    if (normalized) matchers.push(normalized)
  }
  if (matchers.length === 0) issues.push(error('RULE_SOURCE_NO_SUPPORTED_RULES', 'Rule source contains no supported rules.'))
  if (issues.some((issue) => issue.severity === 'error')) return { ok: false, issues }

  return {
    ok: true,
    source: {
      id: input.id.trim(), name, inputKind: input.inputKind, format,
      ...(input.fileName ? { fileName: input.fileName } : {}),
      ...(input.url ? { url: input.url.trim() } : {}),
      ...(input.icon ? { icon: input.icon } : {}),
      enabled: input.enabled ?? true,
      matchers,
    },
    issues,
  }
}

export function validateCustomRuleSourceForTarget(source: CustomRuleSource, target: PrimaryTarget): CustomRuleSourceIssue[] {
  if (!source.enabled) return [error('RULE_SOURCE_DISABLED', 'Enable the rule source before compiling it.')]
  if (source.matchers.length === 0) return [error('RULE_SOURCE_NO_SUPPORTED_RULES', 'Rule source contains no normalized rules.')]
  const capabilities = getTargetCapabilities(target).routingMatchers
  return source.matchers.flatMap((matcher, index) => {
    const capability = capabilities[matcher.kind]
    return capability.status === 'unsupported'
      ? [error(capability.reason ?? 'RULE_SOURCE_MATCHER_UNSUPPORTED', `${matcher.kind} on rule ${index + 1} cannot be lowered to ${target}.`, index + 1)]
      : []
  })
}

export function ruleSourceMatchersToIR(source: CustomRuleSource): TrafficMatcherIR[] | undefined {
  const matchers: TrafficMatcherIR[] = []
  for (const matcher of source.matchers) {
    const result = matcher.kind === 'port'
      ? normalizeCustomMatcher('port', undefined, matcher.port)
      : normalizeCustomMatcher(matcher.kind, matcher.value)
    if (!result.ok || result.matcher.kind === 'rule-set') return undefined
    matchers.push(result.matcher)
  }
  return matchers
}

function extractMihomoRuleLines(content: string, issues: CustomRuleSourceIssue[]): ExtractedRuleLines | undefined {
  try {
    const document = parseDocument(content)
    if (document.errors.length > 0) {
      issues.push(error('RULE_SOURCE_YAML_INVALID', 'The Mihomo YAML could not be parsed.'))
      return undefined
    }
    const parsed = document.toJS() as unknown
    const isArray = Array.isArray(parsed)
    const hasPayload = isRecord(parsed) && Object.prototype.hasOwnProperty.call(parsed, 'payload')
    const hasRules = isRecord(parsed) && Object.prototype.hasOwnProperty.call(parsed, 'rules')
    if (hasPayload && hasRules) {
      issues.push(error('RULE_SOURCE_YAML_SHAPE_INVALID', 'Mihomo YAML must contain either a payload or rules array, not both.'))
      return undefined
    }
    const candidate: unknown[] | undefined = isArray ? parsed
      : hasPayload && isRecord(parsed) && Array.isArray(parsed.payload) ? parsed.payload
        : hasRules && isRecord(parsed) && Array.isArray(parsed.rules) ? parsed.rules
          : undefined
    if (!candidate) {
      issues.push(error('RULE_SOURCE_YAML_SHAPE_INVALID', 'Mihomo YAML must be an array or contain a payload/rules array.'))
      return undefined
    }
    if (!candidate.every((value) => typeof value === 'string')) {
      issues.push(error('RULE_SOURCE_YAML_ENTRY_INVALID', 'Every Mihomo rule entry must be a string.'))
      return undefined
    }
    const candidateNode = isArray ? document.contents : findYamlMapValueNode(document.contents, hasPayload ? 'payload' : 'rules')
    const candidateItems = isYamlSequence(candidateNode) ? candidateNode.items : undefined
    if (!candidateItems || candidateItems.length !== candidate.length) {
      issues.push(error('RULE_SOURCE_YAML_SHAPE_INVALID', 'Mihomo YAML rule entries could not be located safely.'))
      return undefined
    }
    return {
      lines: (candidate as string[]).map((value, index) => ({
        value,
        line: yamlNodeLine(candidateItems[index], content, index + 1),
      })),
      dialect: hasRules ? 'policy-bearing' : 'policy-less',
    }
  } catch {
    issues.push(error('RULE_SOURCE_YAML_INVALID', 'The Mihomo YAML could not be parsed.'))
    return undefined
  }
}

function extractSurgeRuleLines(content: string): ExtractedRuleLines {
  const rawLines = content.split(/\r?\n/)
  const hasSections = rawLines.some((line) => /^\s*\[[^\]]+\]\s*$/.test(line))
  if (!hasSections) return {
    lines: rawLines.flatMap((line, index) => {
      const value = line.trim()
      return isRuleContentLine(value) ? [{ value, line: index + 1 }] : []
    }),
    dialect: 'policy-less' as const,
  }

  let section = ''
  let sawRuleSection = false
  const lines: ExtractedRuleLine[] = []
  for (const [index, rawLine] of rawLines.entries()) {
    const line = rawLine.trim()
    const header = line.match(/^\[([^\]]+)\]$/)?.[1]
    if (header) {
      section = header.trim().toLowerCase()
      sawRuleSection ||= section === 'rule'
      continue
    }
    if (section === 'rule' && isRuleContentLine(line)) lines.push({ value: line, line: index + 1 })
  }
  return { lines: sawRuleSection ? lines : [], dialect: 'policy-bearing' as const }
}

function normalizeRuleLine(raw: string, line: number, dialect: RuleLineDialect, issues: CustomRuleSourceIssue[]): ServiceMatcherDefinition | undefined {
  const value = raw.trim().replace(/^['"]|['"]$/g, '')
  if (!value || value.startsWith('#') || value.startsWith(';')) return undefined
  const fields = value.split(',').map((field) => field.trim())
  if (fields.length > 3) {
    issues.push(error('RULE_SOURCE_OPTIONS_UNSUPPORTED', 'Rule options cannot be lowered without changing semantics.', line))
    return undefined
  }
  const type = fields.length > 1 ? fields[0].toUpperCase() : inferRuleType(fields[0])
  const payload = fields.length > 1 ? fields[1] : normalizeUntypedPayload(fields[0])
  if (fields.length === 3) {
    if (dialect === 'policy-less') {
      issues.push(error('RULE_SOURCE_OPTIONS_UNSUPPORTED', 'This rule contains an unsupported option/modifier in a policy-less source.', line))
      return undefined
    }
    issues.push({
      code: 'RULE_SOURCE_POLICY_OVERRIDDEN', severity: 'warning', line,
      message: 'The source policy is replaced by the target selected in ProxyFlow.',
    })
  }
  const kind = type === 'DOMAIN' ? 'domain'
    : type === 'DOMAIN-SUFFIX' ? 'domain-suffix'
      : type === 'DOMAIN-KEYWORD' ? 'domain-keyword'
        : type === 'IP-CIDR' ? 'ip-cidr'
          : type === 'IP-CIDR6' ? 'ip-cidr6'
            : type === 'DST-PORT' || type === 'PORT' ? 'port'
              : undefined
  if (!kind) {
    issues.push(error('RULE_SOURCE_MATCHER_UNSUPPORTED', `Rule type “${fields[0]}” is not supported in the first phase.`, line))
    return undefined
  }
  const result = kind === 'port'
    ? normalizeCustomMatcher(kind, undefined, payload)
    : normalizeCustomMatcher(kind, payload)
  if (!result.ok) {
    issues.push(error(result.code, `Rule ${line} contains an invalid ${kind} value.`, line))
    return undefined
  }
  return result.matcher.kind === 'port'
    ? { kind: 'port', port: result.matcher.port }
    : result.matcher.kind === 'domain' || result.matcher.kind === 'domain-suffix' || result.matcher.kind === 'domain-keyword'
      || result.matcher.kind === 'ip-cidr' || result.matcher.kind === 'ip-cidr6'
      ? { kind: result.matcher.kind, value: result.matcher.value }
      : undefined
}

function isRuleContentLine(line: string) {
  return Boolean(line) && !line.startsWith('#') && !line.startsWith(';') && !/^\[.*\]$/.test(line)
}

function findYamlMapValueNode(root: unknown, key: string): unknown {
  if (!isRecord(root) || !Array.isArray(root.items)) return undefined
  const pair = root.items.find((item) => isRecord(item) && isRecord(item.key) && item.key.value === key)
  return isRecord(pair) ? pair.value : undefined
}

function isYamlSequence(value: unknown): value is { items: unknown[] } {
  return isRecord(value) && Array.isArray(value.items)
}

function yamlNodeLine(node: unknown, content: string, fallback: number) {
  if (!isRecord(node) || !Array.isArray(node.range) || typeof node.range[0] !== 'number') return fallback
  return content.slice(0, node.range[0]).split(/\r?\n/).length
}

function inferRuleType(value: string) {
  const payload = normalizeUntypedPayload(value)
  if (payload.includes('/')) return payload.includes(':') ? 'IP-CIDR6' : 'IP-CIDR'
  return value.startsWith('.') || value.startsWith('*.') || value.startsWith('+.') ? 'DOMAIN-SUFFIX' : 'DOMAIN'
}

function normalizeUntypedPayload(value: string) {
  return value.replace(/^\+?\*?\./, '')
}

function isSafeSourceUrl(value?: string) {
  if (!value) return false
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
  } catch { return false }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function error(code: string, message: string, line?: number): CustomRuleSourceIssue {
  return { code, severity: 'error', message, ...(line ? { line } : {}) }
}
