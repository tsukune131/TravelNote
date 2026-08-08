import { createContext, useContext } from 'react';
import type { Locale, Translator } from './index';

export type I18n = {
  locale: Locale;
  t: Translator;
  time: (minutesFromMidnight: number) => string;
  duration: (minutes: number) => string;
  date: (date: Date, options?: Intl.DateTimeFormatOptions) => string;
  currency: (amount: number) => string;
};

export const I18nContext = createContext<I18n | null>(null);

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('I18nProvider の外で useI18n が呼ばれました');
  return ctx;
}
