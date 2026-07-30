import type { Locale, Messages } from '../types'
import { en } from './en'
import { zhCN } from './zh-CN'

export const locales: Record<Locale, Messages> = {
  en,
  'zh-CN': zhCN,
}

/** English is the default; unknown locales fall back to it. */
export function resolveMessages(
  locale: Locale = 'en',
  overrides?: Partial<Messages>,
): Messages {
  return { ...(locales[locale] ?? en), ...(overrides ?? {}) }
}

export { en, zhCN }
