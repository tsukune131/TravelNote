/**
 * 旅程の日付は「その土地の壁掛けカレンダー上の日付」であって、瞬間ではない。
 * `Date` を UTC 前提で往復させると、時差のある旅行先で1日ずれる。
 * そのため日付は 'YYYY-MM-DD' の文字列で持ち、表示のときだけ Date に起こす。
 *
 * 同じ理由で、予定の時刻は 0:00 からの「分」で持つ(→ db/types.ts)。
 * リフロー(30分後ろへずらす)がただの足し算になり、夏時間も時差も関係なくなる。
 */
export type PlainDate = string; // 'YYYY-MM-DD'

const PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isPlainDate(value: string): boolean {
  if (!PATTERN.test(value)) return false;
  const d = toDate(value);
  return toPlainDate(d) === value; // 2026-02-30 のような存在しない日を弾く
}

/** 端末のローカル時間としての Date に起こす(表示・曜日計算用) */
export function toDate(date: PlainDate): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toPlainDate(date: Date): PlainDate {
  const y = String(date.getFullYear()).padStart(4, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function today(now: Date = new Date()): PlainDate {
  return toPlainDate(now);
}

export function addDays(date: PlainDate, days: number): PlainDate {
  const d = toDate(date);
  d.setDate(d.getDate() + days);
  return toPlainDate(d);
}

/** b - a を日数で。同日なら 0 */
export function diffDays(a: PlainDate, b: PlainDate): number {
  const ms = toDate(b).getTime() - toDate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** 旅の開始日と Day 番号(0始まり)から実際の日付を出す */
export function dateOfDay(startDate: PlainDate, dayIndex: number): PlainDate {
  return addDays(startDate, dayIndex);
}

/** 旅の日数(開始日と終了日を含む) */
export function dayCount(startDate: PlainDate, endDate: PlainDate): number {
  return diffDays(startDate, endDate) + 1;
}

/** その日付が旅の何日目か。範囲外なら null */
export function dayIndexOf(startDate: PlainDate, endDate: PlainDate, date: PlainDate): number | null {
  const i = diffDays(startDate, date);
  return i >= 0 && i < dayCount(startDate, endDate) ? i : null;
}

/* ────────── 時刻(0:00 からの分) ────────── */

export const MINUTES_PER_DAY = 24 * 60;

export function nowMinutes(now: Date = new Date()): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** 24時をまたいでも壊れないように丸める(深夜の予定は翌0時台として扱う) */
export function clampMinutes(minutes: number): number {
  if (minutes < 0) return 0;
  if (minutes > MINUTES_PER_DAY - 1) return MINUTES_PER_DAY - 1;
  return Math.round(minutes);
}
