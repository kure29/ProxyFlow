import { describe, expect, it } from 'vitest'
import { translate } from '../../i18n'

describe('node preview parser availability terminology', () => {
  it('keeps parser counts distinct from target compatibility counts', () => {
    expect(translate('en-US', 'nodesPreview.summary', { detected: 13, ready: 13, warnings: 0, unsupported: 0 }))
      .toBe('13 detected · 13 parsed · 0 parse warnings · 0 parse unsupported')
    expect(translate('zh-CN', 'nodesPreview.summary', { detected: 13, ready: 13, warnings: 0, unsupported: 0 }))
      .toBe('检测 13 · 解析可用 13 · 解析警告 0 · 解析不支持 0')
    expect(translate('en-US', 'nodesPreview.status.ready')).toBe('Parsed')
    expect(translate('zh-CN', 'nodesPreview.status.ready')).toBe('已解析')
  })
})
