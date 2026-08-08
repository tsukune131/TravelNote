import { useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  createTranslator,
  detectLocale,
  formatCurrency,
  formatDate,
  formatDuration,
  formatTimeOfDay,
} from './index';
import type { Locale } from './index';
import { I18nContext } from './context';
import type { I18n } from './context';

/**
 * 表示言語は起動時に一度だけ決める。
 * 将来ユーザーが設定で上書きできるように、locale を props で渡せる形にしてある。
 */
export function I18nProvider({ locale, children }: { locale?: Locale; children: ReactNode }) {
  const value = useMemo<I18n>(() => {
    const resolved = locale ?? detectLocale();
    const t = createTranslator(resolved);
    return {
      locale: resolved,
      t,
      time: (m) => formatTimeOfDay(resolved, m),
      duration: (m) => formatDuration(t, m),
      date: (d, options) => formatDate(resolved, d, options),
      currency: (a) => formatCurrency(resolved, a),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
