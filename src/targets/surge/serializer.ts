import type { SurgePolicyEntry, SurgeProfile } from './model'

export function serializeSurgeProfile(profile: SurgeProfile) {
  return [
    serializeSection('General', profile.general),
    serializeSection('Proxy', profile.proxies.map(serializePolicyEntry)),
    serializeSection('Proxy Group', profile.proxyGroups.map(serializePolicyEntry)),
    serializeSection('Rule', profile.rules),
  ].join('\n\n') + '\n'
}

export function serializePolicyEntry(entry: SurgePolicyEntry) {
  const components = [
    entry.type,
    ...entry.arguments.map(serializeSurgeToken),
    ...(entry.parameters ?? []).map(({ key, value }) => `${key}=${serializeSurgeToken(value)}`),
  ]
  return `${entry.name} = ${components.join(', ')}`
}

export function serializeSurgeRule(type: string, payload: string | undefined, policy: string) {
  return [type, ...(payload === undefined ? [] : [serializeSurgeToken(payload)]), serializeSurgeToken(policy)].join(',')
}

export function serializeSurgeToken(value: string | number | boolean) {
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (!needsQuoting(value)) return value
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

export function isSafeSurgePolicyName(value: string) {
  return Boolean(value)
    && value === value.trim()
    && !/[,=\r\n\u0000-\u001f\u007f"\\]/.test(value)
    && !/^(?:#|;|\/\/)/.test(value)
    && !/\s(?:#|;|\/\/)/.test(value)
}

function serializeSection(name: string, lines: string[]) {
  return `[${name}]${lines.length ? `\n${lines.join('\n')}` : ''}`
}

function needsQuoting(value: string) {
  return value.length === 0
    || value !== value.trim()
    || /[,="\\]/.test(value)
    || /\s(?:#|;|\/\/)/.test(value)
}
