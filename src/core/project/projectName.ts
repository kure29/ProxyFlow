export const PROJECT_NAME_MAX_GRAPHEMES = 20

export type ProjectNameValidation = 'valid' | 'empty' | 'too-long'

export function countProjectNameGraphemes(value: string) {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].length
  }
  return Array.from(value).length
}

export function validateProjectName(value: string): ProjectNameValidation {
  const normalized = value.trim()
  if (!normalized) return 'empty'
  return countProjectNameGraphemes(normalized) > PROJECT_NAME_MAX_GRAPHEMES ? 'too-long' : 'valid'
}

export function normalizeValidProjectName(value: string) {
  return validateProjectName(value) === 'valid' ? value.trim() : null
}
