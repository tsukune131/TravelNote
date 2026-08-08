import { ja } from './messages/ja';
import { en } from './messages/en';
import { DEFAULT_LOCALE, LOCALES } from './types';
import type { Locale, MessageKey } from './types';

export type { Locale, MessageKey } from './types';
export { LOCALES, DEFAULT_LOCALE } from './types';

const BUNDLES: Record<Locale, unknown> = { ja, en };

/**
 * 端末の言語から表示言語を決める。未対応言語は既定(ja)に落ちる。
 * 将来ユーザーが設定で上書きできるようにするため、解決結果は差し替え可能にしてある。
 */
export function resolveLocale(candidates: readonly string[]): Locale {
  for (const tag of candidates) {
    const base = tag.toLowerCase().split('-')[0];
    const hit = LOCALES.find((l) => l === base);
    if (hit) return hit;
  }
  return DEFAULT_LOCALE;
}

export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  return resolveLocale(navigator.languages ?? [navigator.language]);
}

function lookup(bundle: unknown, key: string): string | undefined {
  let node: unknown = bundle;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** `{name}` を values で差し替える。値がなければプレースホルダを残す(欠落に気づけるように) */
function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

export function createTranslator(locale: Locale) {
  return function t(key: MessageKey, values?: Record<string, string | number>): string {
    const hit = lookup(BUNDLES[locale], key) ?? lookup(ja, key);
    // キーが無いのは実装漏れ。落とさずキーをそのまま出して気づけるようにする
    return hit === undefined ? key : interpolate(hit, values);
  };
}

export type Translator = ReturnType<typeof createTranslator>;

/* ────────── 書式(自前フォーマットを書かず Intl に寄せる) ────────── */

/** 0:00 からの分 → その言語の時刻表記(ja: 9:00 / en: 9:00 AM) */
export function formatTimeOfDay(locale: Locale, minutesFromMidnight: number): string {
  const d = new Date(2000, 0, 1, 0, minutesFromMidnight);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d);
}

/**
 * 所要時間。`Intl.DurationFormat` は iOS 15 では使えないので、
 * 単位の並び方そのものを messages 側に持たせて言語ごとに切り替える。
 */
export function formatDuration(t: Translator, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return t('duration.hm', { h, m });
  if (h > 0) return t('duration.h', { h });
  return t('duration.m', { m });
}

export function formatDate(
  locale: Locale,
  date: Date,
  options: Intl.DateTimeFormatOptions = { month: 'numeric', day: 'numeric', weekday: 'short' },
): string {
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatCurrency(locale: Locale, amount: number, currency = 'JPY'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}
