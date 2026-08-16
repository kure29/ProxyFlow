import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REGION_CODES, detectRegion, ISO_ALPHA2_CODES, REGION_CATALOG, regionFlag, regionLabelForLocale, searchRegions,
} from './index'

describe('region catalog and search', () => {
  it('contains the complete assigned ISO 3166-1 alpha-2 catalog', () => {
    expect(ISO_ALPHA2_CODES).toHaveLength(249)
    expect(new Set(ISO_ALPHA2_CODES).size).toBe(249)
    expect(REGION_CATALOG.filter((entry) => entry.code !== 'UNKNOWN')).toHaveLength(249)
    expect(ISO_ALPHA2_CODES).toEqual(expect.arrayContaining([
      'US', 'CN', 'HK', 'MO', 'TW', 'JP', 'KR', 'SG', 'GB', 'DE', 'FR', 'CA', 'AU', 'IN', 'BR',
    ]))
  })

  it('shows only five configured common suggestions for an empty query', () => {
    expect(DEFAULT_REGION_CODES).toEqual(['HK', 'JP', 'SG', 'US', 'CN'])
    expect(searchRegions('', 'en-US').map((entry) => entry.code)).toEqual(DEFAULT_REGION_CODES)
  })

  it.each([
    ['us', 'US'], ['US', 'US'], ['cn', 'CN'], ['jp', 'JP'], ['hk', 'HK'], ['gb', 'GB'], ['USA', 'US'], ['UK', 'GB'],
    ['United States', 'US'], ['美国', 'US'], ['China', 'CN'], ['中国', 'CN'], ['Hong Kong', 'HK'], ['香港', 'HK'], ['Japan', 'JP'], ['日本', 'JP'],
    ['Macao', 'MO'], ['澳门', 'MO'],
  ])('ranks %s as %s across the complete catalog', (query, expected) => {
    expect(searchRegions(query, query.match(/[\u3400-\u9fff]/u) ? 'zh-CN' : 'en-US')[0]?.code).toBe(expected)
  })

  it('uses locale display names and generated flags', () => {
    expect(regionLabelForLocale('CN', 'zh-CN')).toBe('中国')
    expect(regionLabelForLocale('US', 'en-US')).toBe('United States')
    expect(regionLabelForLocale('UK', 'en-US')).toBe('United Kingdom')
    expect(regionFlag('US')).toBe('🇺🇸')
    expect(regionFlag('CN')).toBe('🇨🇳')
  })
})

describe('region inference', () => {
  it.each([
    ['🇭🇰 香港 01', 'HK'], ['🇨🇳 China 01', 'CN'], ['🇲🇴 Macau 01', 'MO'], ['🇹🇼 Taiwan 01', 'TW'],
    ['🇯🇵 Tokyo 01', 'JP'], ['🇰🇷 Seoul 01', 'KR'], ['🇸🇬 Singapore 01', 'SG'], ['🇬🇧 London 01', 'GB'],
    ['🇩🇪 Frankfurt 01', 'DE'], ['🇫🇷 Paris 01', 'FR'], ['🇨🇦 Toronto 01', 'CA'], ['🇦🇺 Sydney 01', 'AU'],
    ['🇮🇳 Mumbai 01', 'IN'], ['🇧🇷 Sao Paulo 01', 'BR'], ['🇺🇸 New York 01', 'US'],
    ['Hong Kong IPLC', 'HK'], ['香港 IEPL', 'HK'], ['HK-02', 'HK'], ['Singapore Premium', 'SG'],
    ['United Kingdom 01', 'GB'], ['UK Premium', 'GB'], ['USA Premium', 'US'],
  ])('detects %s as %s', (name, code) => {
    expect(detectRegion(name).code).toBe(code)
  })

  it.each(['SUSHI Premium', 'BUSINESS', 'JPop Radio', 'usage remaining', 'unknown premium', 'Made in Japan']) (
    'does not infer unsafe ISO substrings from %s',
    (name) => expect(detectRegion(name).code).not.toBe('US'),
  )

  it('does not treat natural lowercase words as ISO tokens', () => {
    expect(detectRegion('Made in Europe').code).toBe('UNKNOWN')
    expect(detectRegion('Australia Premium').code).toBe('AU')
  })

  it('gives an explicit flag priority over conflicting text', () => {
    expect(detectRegion('🇯🇵 Hong Kong relay').code).toBe('JP')
    expect(detectRegion('🇨🇳 Hong Kong relay').code).toBe('CN')
  })
})
