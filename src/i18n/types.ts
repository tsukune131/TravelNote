import type { ja } from './messages/ja';

/** 既定言語(ja)が文言の形の正。他言語はこの形の部分集合になる。 */
export type Messages = typeof ja;

/**
 * 他言語の形。`ja` は `as const` なので値が文字列リテラル型になっている。
 * ここで `string` に広げないと、英訳が「日本語と同じ文字列でなければならない」ことになる。
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends string ? string : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const LOCALES = ['ja', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ja';

/** `t('timeline.gap')` のように書けるドット記法のキー */
export type MessageKey = DotKeys<Messages>;

type DotKeys<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : DotKeys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];
