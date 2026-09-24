import { IDEAS_DAY } from '../db/types';
import type { Translator } from '../i18n';

/**
 * 「Day 3」/「メモ」。
 * `dayIndex + 1` をそのまま出すと、メモのタブが「Day 0」になる。
 */
export function dayLabel(t: Translator, dayIndex: number): string {
  return dayIndex === IDEAS_DAY ? t('ideas.tab') : t('trip.dayTab', { n: dayIndex + 1 });
}
