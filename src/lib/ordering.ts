import type { TripEvent } from '../db/types';

/**
 * タイムラインの並び。
 *
 * ## 2026-08-09 に作り直した理由
 *
 * それまでは「時刻ありを先に、時刻未定は末尾にまとめる」だった。
 * これは**「時刻は決めなくていい」と言いながら、決めていない予定を
 * 格下として下へ落としていた**。実際に使うと、放り込んだ順に並んでいてほしい
 * ものが勝手に沈むので、計画が組み立てられない。
 *
 * 新しい規則は単純:
 *
 * 1. **並びは `order`(入力順)がすべて。** 勝手に沈めない
 * 2. **時刻を入れたときだけ、その1件を正しい位置へ移す。**
 *    ほかの「時刻あり」との前後関係が合うところに置く
 * 3. 手で並べ替えたら、それが `order` になる
 *
 * つまり「時刻 → 入力順」の優先順位が、**入れた瞬間に一度だけ**効く。
 * 以後は動かない ── 勝手に動くのが困るのだから。
 */

/**
 * `id` の予定に `minutes` の時刻を入れたとき、どこへ置くべきか。
 * 挿入位置の前後の予定を返す(`orderKeyBetween` にそのまま渡せる)。
 *
 * `null` を返したら「動かさなくてよい」。
 */
export function placeForTime(
  events: readonly TripEvent[],
  id: string,
  minutes: number,
): { before: TripEvent | null; after: TripEvent | null } | null {
  const others = events.filter((e) => e.id !== id);
  const timed = others.filter((e) => e.startMinutes !== null);
  // ほかに時刻ありが無いなら、比べる相手がいない。今の位置のままでよい
  if (timed.length === 0) return null;

  // その時刻より後になる最初の「時刻あり」を探す
  const firstLater = timed.find((e) => (e.startMinutes ?? 0) > minutes);

  const target = firstLater
    ? others.indexOf(firstLater) // その手前に入る
    : others.length; // どれよりも遅いので末尾

  const before = target > 0 ? others[target - 1] : null;
  const after = target < others.length ? others[target] : null;

  // すでにそこにいるなら動かさない(order を書き換えると同期の差分が無駄に増える)
  const current = events.findIndex((e) => e.id === id);
  const currentBefore = current > 0 ? events[current - 1] : null;
  if (currentBefore?.id === before?.id) return null;

  return { before, after };
}

/**
 * 現在時刻ラインを何番目の予定の前に出すか。
 * 時刻ありと未定が混ざるので、**時刻のあるものだけ**を見て決める。
 * どの予定よりも後ろなら `events.length`(末尾)。
 */
export function nowLineIndex(events: readonly TripEvent[], now: number): number | null {
  const hasTimed = events.some((e) => e.startMinutes !== null);
  if (!hasTimed) return null;
  const i = events.findIndex((e) => e.startMinutes !== null && e.startMinutes > now);
  return i < 0 ? events.length : i;
}

/**
 * 追加バーの文字列から、先頭の時刻を切り出す。
 *
 * 「9:00 二条城」「09:00　二条城」「9時 二条城」を受ける。
 * **時刻を入れるためだけに詳細シートを開かせない**ための入口
 * ── 実際に使って「時刻入力が面倒」と言われた箇所。
 */
export function parseLeadingTime(input: string): { minutes: number | null; name: string } {
  const text = input.trim();
  const m = text.match(/^(\d{1,2})\s*(?::|：|時)\s*(\d{1,2})?\s*分?\s+?(.*)$/);
  if (!m) return { minutes: null, name: text };

  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  const name = (m[3] ?? '').trim();
  // 時刻として成立しない、あるいは名前が残らないなら、ただの文字列として扱う
  if (h > 23 || min > 59 || name.length === 0) return { minutes: null, name: text };

  return { minutes: h * 60 + min, name };
}
