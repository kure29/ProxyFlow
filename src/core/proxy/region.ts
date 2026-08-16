import type { RegionCode, RegionHint } from './model'
import { ISO_ALPHA2_CODES, type IsoAlpha2Code } from './regionCodes'

export type RegionDisplayLocale = 'zh-CN' | 'en-US'

export interface RegionCatalogEntry {
  code: IsoAlpha2Code | 'UNKNOWN'
  flag: string
  zh: string
  en: string
  aliases: string[]
}

export const DEFAULT_REGION_CODES = ['HK', 'JP', 'SG', 'US', 'CN'] as const satisfies readonly IsoAlpha2Code[]

const aliasCodes: Record<string, IsoAlpha2Code> = {
  USA: 'US',
  UK: 'GB',
}

const commonAliases: Partial<Record<IsoAlpha2Code, string[]>> = {
  AU: ['Australia', '澳洲'],
  CN: ['China', 'Mainland China', '中国', '中國', '中国大陆', '中國大陸'],
  GB: ['UK', 'Britain', 'Great Britain', '英国', '英國'],
  HK: ['Hong Kong', '香港'],
  KR: ['Korea', 'South Korea', '韩国', '韓國'],
  MO: ['Macao', 'Macau', '澳门', '澳門'],
  RU: ['Russia', 'Russian Federation', '俄罗斯', '俄羅斯'],
  TW: ['Taiwan', '台湾', '臺灣'],
  US: ['USA', 'United States of America', 'America', '美国', '美國'],
}

const displayNames = {
  'zh-CN': createDisplayNames('zh-CN'),
  'en-US': createDisplayNames('en-US'),
}

export const REGION_CATALOG: RegionCatalogEntry[] = [
  ...ISO_ALPHA2_CODES.map((code): RegionCatalogEntry => {
    const zh = displayNames['zh-CN']?.of(code) ?? commonAliases[code]?.find(hasCjk) ?? code
    const en = displayNames['en-US']?.of(code) ?? commonAliases[code]?.find((value) => !hasCjk(value)) ?? code
    return { code, flag: regionFlag(code), zh, en, aliases: unique([code, en, zh, ...(commonAliases[code] ?? [])]) }
  }),
  { code: 'UNKNOWN', flag: '🌐', zh: '未知地区', en: 'Unknown region', aliases: ['Unknown', 'Unknown region', '未知', '未知地区'] },
]

const regionByCode = new Map(REGION_CATALOG.map((entry) => [entry.code, entry]))
const knownCodes = new Set<IsoAlpha2Code>(ISO_ALPHA2_CODES)
const inferenceAliases = REGION_CATALOG
  .filter((entry) => entry.code !== 'UNKNOWN')
  .flatMap((entry) => entry.aliases
    .filter((alias) => alias !== entry.code)
    .map((alias) => ({ alias, code: entry.code })))
  .sort((left, right) => right.alias.length - left.alias.length)

export function detectRegion(name: string): RegionHint {
  const flagCode = firstFlagCode(name)
  if (flagCode) {
    return knownCodes.has(flagCode as IsoAlpha2Code)
      ? { code: flagCode as IsoAlpha2Code, confidence: 0.98, source: 'emoji' }
      : { code: 'UNKNOWN', confidence: 0, source: 'emoji' }
  }

  const codeToken = explicitIsoToken(name)
  if (codeToken) return { code: codeToken, confidence: 0.92, source: 'name' }

  for (const { alias, code } of inferenceAliases) {
    if (aliasMatches(name, alias)) return { code, confidence: 0.84, source: 'name' }
  }
  return { code: 'UNKNOWN', confidence: 0, source: 'unknown' }
}

export function manualRegion(code: RegionCode): RegionHint {
  return { code: canonicalRegionCode(code), confidence: 1, source: 'manual' }
}

export function canonicalRegionCode(code: RegionCode): Exclude<RegionCode, 'UK'> {
  return code === 'UK' ? 'GB' : code
}

export function regionLabelForLocale(code: string, locale: RegionDisplayLocale) {
  const canonical = code === 'UK' ? 'GB' : code
  const entry = regionByCode.get(canonical as RegionCatalogEntry['code'])
  return locale === 'zh-CN' ? entry?.zh ?? code : entry?.en ?? code
}

export function regionFlag(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return '🌐'
  return String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65))
}

export function searchRegions(query: string, locale: RegionDisplayLocale) {
  const normalized = normalize(query)
  if (!normalized) return DEFAULT_REGION_CODES.map((code) => regionByCode.get(code)!)
  const canonicalQuery = aliasCodes[normalized.toUpperCase()] ?? normalized.toUpperCase()
  return REGION_CATALOG
    .map((entry, index) => ({ entry, index, rank: searchRank(entry, normalized, canonicalQuery, locale) }))
    .filter((result) => result.rank < Number.POSITIVE_INFINITY)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ entry }) => entry)
}

export const REGION_OPTIONS = REGION_CATALOG.map(({ code }) => ({ code, label: code }))

function searchRank(entry: RegionCatalogEntry, query: string, canonicalQuery: string, locale: RegionDisplayLocale) {
  if (entry.code === canonicalQuery) return 0
  const aliases = entry.aliases.map(normalize)
  if (aliases.includes(query)) return 1
  const localized = normalize(locale === 'zh-CN' ? entry.zh : entry.en)
  if (localized.startsWith(query)) return 2
  if (normalize(entry.en).startsWith(query)) return 3
  if ([entry.code.toLowerCase(), localized, normalize(entry.en), normalize(entry.zh), ...aliases].some((value) => value.includes(query))) return 4
  return Number.POSITIVE_INFINITY
}

function explicitIsoToken(value: string) {
  const tokens = value.match(/[A-Za-z]{2}/g) ?? []
  for (const token of tokens) {
    const exact = new RegExp(`(?:^|[^A-Za-z0-9])${token}(?=$|[^A-Za-z0-9])`).test(value)
    if (!exact || token !== token.toUpperCase()) continue
    const canonical = aliasCodes[token] ?? token
    if (knownCodes.has(canonical as IsoAlpha2Code)) return canonical as IsoAlpha2Code
  }
  const trimmed = value.trim().toUpperCase()
  const canonical = aliasCodes[trimmed] ?? trimmed
  return knownCodes.has(canonical as IsoAlpha2Code) ? canonical as IsoAlpha2Code : undefined
}

function firstFlagCode(value: string) {
  const match = /([\u{1F1E6}-\u{1F1FF}])([\u{1F1E6}-\u{1F1FF}])/u.exec(value)
  if (!match) return undefined
  return String.fromCharCode(
    match[1].codePointAt(0)! - 0x1f1e6 + 65,
    match[2].codePointAt(0)! - 0x1f1e6 + 65,
  )
}

function aliasMatches(value: string, alias: string) {
  if (hasCjk(alias)) return value.includes(alias)
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, 'i').test(value)
}

function createDisplayNames(locale: RegionDisplayLocale) {
  try { return typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames([locale], { type: 'region' }) : undefined } catch { return undefined }
}

function hasCjk(value: string) {
  return /[\u3400-\u9fff]/u.test(value)
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase()
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}
