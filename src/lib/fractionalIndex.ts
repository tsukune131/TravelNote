/**
 * 並び順のキー(fractional indexing)。
 *
 * なぜ配列インデックスではないか:
 * 同行者と同時編集するため、2人が同時に並べ替えると配列の添字は必ず壊れる。
 * 「隣り合う2つのキーの間に、必ず新しいキーを作れる」文字列を持たせておけば、
 * 並べ替えは**その1件の order を書き換えるだけ**の操作になり、衝突しない。
 *
 * キーは base62 の文字列で、辞書順がそのまま表示順。
 * 不変条件: 末尾が '0' にならないこと(それを許すと「その手前」を作れなくなる)。
 */
const BASE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function digit(char: string): number {
  const i = BASE.indexOf(char);
  if (i < 0) throw new Error(`order key に使えない文字です: ${JSON.stringify(char)}`);
  return i;
}

function assertKey(key: string, label: string): void {
  if (key.endsWith('0')) {
    throw new Error(`${label} の order key が '0' で終わっています(不変条件違反): ${key}`);
  }
  for (const char of key) digit(char);
}

/**
 * a < 結果 < b となるキーを作る。b が null なら「a より後ろ」。
 * a は空文字を許す(= 先頭より前)。
 */
function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) {
    throw new Error(`order key の前後が逆です: ${JSON.stringify(a)} >= ${JSON.stringify(b)}`);
  }

  if (b !== null) {
    // 共通の接頭辞はそのまま残し、残りで midpoint を取る
    let n = 0;
    while ((a[n] ?? '0') === b[n]) n += 1;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));

    const da = a.length > 0 ? digit(a[0]) : 0;
    const db = digit(b[0]);
    if (db - da > 1) return BASE[Math.round((da + db) / 2)];

    // 桁が隣り合っているので、1桁下へ降りる
    if (b.length > 1) return b.slice(0, 1);
    return BASE[da] + midpoint(a.slice(1), null);
  }

  const da = a.length > 0 ? digit(a[0]) : 0;
  if (da === BASE.length - 1) return BASE[da] + midpoint(a.slice(1), null);
  return BASE[Math.round((da + BASE.length) / 2)];
}

/**
 * 並びの中の隣り合う2件の order を渡すと、その間に入るキーを返す。
 * 端に入れるときは、無い側に null を渡す。
 *
 *   先頭に入れる: orderKeyBetween(null, first.order)
 *   末尾に足す:   orderKeyBetween(last.order, null)
 *   1件目:        orderKeyBetween(null, null)
 */
export function orderKeyBetween(before: string | null, after: string | null): string {
  if (before !== null) assertKey(before, 'before');
  if (after !== null) assertKey(after, 'after');
  return midpoint(before ?? '', after);
}

/** 空のリストに最初の1件を置くときのキー */
export function firstOrderKey(): string {
  return orderKeyBetween(null, null);
}

/**
 * n件を一度に末尾へ足すときのキー列。
 * 「10件まとめて放り込む」導線(docs/ux-design.md §4.1)で使う。
 */
export function orderKeysAfter(last: string | null, count: number): string[] {
  const keys: string[] = [];
  let cursor = last;
  for (let i = 0; i < count; i += 1) {
    cursor = orderKeyBetween(cursor, null);
    keys.push(cursor);
  }
  return keys;
}

export function compareOrder(a: { order: string }, b: { order: string }): number {
  return a.order < b.order ? -1 : a.order > b.order ? 1 : 0;
}
