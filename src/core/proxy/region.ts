import type { RegionCode, RegionHint } from './model'

const REGION_PATTERNS: Array<{ code: Exclude<RegionCode, 'UNKNOWN'>; emoji: string[]; names: RegExp[] }> = [
  { code: 'HK', emoji: ['🇭🇰'], names: [/香港/i, /\bHK\b/i, /hong\s*kong/i] },
  { code: 'US', emoji: ['🇺🇸'], names: [/美国/i, /\bUS(?:A)?\b/i, /united\s*states/i] },
  { code: 'JP', emoji: ['🇯🇵'], names: [/日本/i, /\bJP\b/i, /japan/i] },
  { code: 'SG', emoji: ['🇸🇬'], names: [/新加坡/i, /\bSG\b/i, /singapore/i] },
  { code: 'TW', emoji: ['🇹🇼'], names: [/台湾|臺灣/i, /\bTW\b/i, /taiwan/i] },
  { code: 'KR', emoji: ['🇰🇷'], names: [/韩国|韓國/i, /\bKR\b/i, /korea/i] },
  { code: 'UK', emoji: ['🇬🇧'], names: [/英国|英國/i, /\bUK\b/i, /united\s*kingdom/i] },
  { code: 'DE', emoji: ['🇩🇪'], names: [/德国|德國/i, /\bDE\b/i, /germany/i] },
  { code: 'FR', emoji: ['🇫🇷'], names: [/法国|法國/i, /\bFR\b/i, /france/i] },
  { code: 'CA', emoji: ['🇨🇦'], names: [/加拿大/i, /\bCA\b/i, /canada/i] },
  { code: 'AU', emoji: ['🇦🇺'], names: [/澳大利亚|澳洲/i, /\bAU\b/i, /australia/i] },
]

export function detectRegion(name: string): RegionHint {
  for (const region of REGION_PATTERNS) {
    if (region.emoji.some((emoji) => name.includes(emoji))) return { code: region.code, confidence: 0.98, source: 'emoji' }
  }
  for (const region of REGION_PATTERNS) {
    if (region.names.some((pattern) => pattern.test(name))) return { code: region.code, confidence: 0.78, source: 'name' }
  }
  return { code: 'UNKNOWN', confidence: 0, source: 'unknown' }
}

export function manualRegion(code: RegionCode): RegionHint {
  return { code, confidence: 1, source: 'manual' }
}

export const REGION_OPTIONS: Array<{ code: RegionCode; label: string }> = [
  { code: 'HK', label: '香港' }, { code: 'US', label: '美国' }, { code: 'JP', label: '日本' },
  { code: 'SG', label: '新加坡' }, { code: 'TW', label: '台湾' }, { code: 'KR', label: '韩国' },
  { code: 'UK', label: '英国' }, { code: 'DE', label: '德国' }, { code: 'FR', label: '法国' },
  { code: 'CA', label: '加拿大' }, { code: 'AU', label: '澳大利亚' }, { code: 'UNKNOWN', label: '未知' },
]
