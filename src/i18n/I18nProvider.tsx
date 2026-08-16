import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { MessageKey } from './messages'
import {
  formatDateTime, getCurrentLocale, setCurrentLocale, translate,
  type Locale, type TranslationValues,
} from './runtime'

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, values?: TranslationValues) => string
  formatDateTime: (value: string | Date, options: Intl.DateTimeFormatOptions) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, updateLocale] = useState<Locale>(() => getCurrentLocale())
  useEffect(() => setCurrentLocale(locale), [locale])
  const setLocale = useCallback((next: Locale) => { setCurrentLocale(next); updateLocale(next) }, [])
  const t = useCallback((key: MessageKey, values?: TranslationValues) => translate(locale, key, values), [locale])
  const format = useCallback((value: string | Date, options: Intl.DateTimeFormatOptions) => formatDateTime(value, locale, options), [locale])
  const context = useMemo(() => ({ locale, setLocale, t, formatDateTime: format }), [format, locale, setLocale, t])
  return <I18nContext.Provider value={context}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within I18nProvider')
  return context
}
