export interface WebSelectOption {
  value: string
  label: string
  disabled?: boolean
}

export function firstEnabledIndex(options: readonly WebSelectOption[]) {
  return options.findIndex((option) => !option.disabled)
}

export function lastEnabledIndex(options: readonly WebSelectOption[]) {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index].disabled) return index
  }
  return -1
}

export function moveEnabledIndex(options: readonly WebSelectOption[], current: number, direction: 1 | -1) {
  if (!options.length) return -1
  let next = current
  for (let attempts = 0; attempts < options.length; attempts += 1) {
    next = (next + direction + options.length) % options.length
    if (!options[next].disabled) return next
  }
  return current
}
