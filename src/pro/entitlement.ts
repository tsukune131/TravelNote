import type { Trip } from '../db/types';

/**
 * 「たびのしおり Pro」の判定。
 *
 * ## 線引き(docs/pricing.md §3)
 *
 * **無料は個人利用のすべて。Pro が要るのは「共有を始めるとき」だけ。**
 *
 *   取り込む(受け取る)          → 無料。ここを有料にすると共有が死ぬ
 *   取り込んだ旅を送り返す        → 無料。ここを有料にすると往復が切れる
 *   自分の旅をはじめて共有する    → **Pro**(唯一の課金点)
 *   一度共有した旅を再送する      → 無料(解約後も)
 *
 * 旅の数は無料でも制限しない。ひとり旅の人からは取らない。
 *
 * ## ここに置く理由
 *
 * StoreKit も DB も触らない純粋関数にしてある。
 * 課金まわりは実機でしか試せない部分が多いので、
 * **判定だけは手元で実行して確かめられる**ようにしておく。
 */

export type ProStatus = {
  active: boolean;
  /** 期限(ms)。`active` が true でも、これを過ぎていれば失効として扱う */
  expiresAt?: number;
};

export const FREE: ProStatus = { active: false };

export function isProActive(status: ProStatus, now: number): boolean {
  if (!status.active) return false;
  if (status.expiresAt !== undefined && status.expiresAt <= now) return false;
  return true;
}

/** 共有できない理由。UI はこれを見て何を出すか決める */
export type ShareBlock =
  | { allowed: true }
  | { allowed: false; reason: 'needs-pro' };

/**
 * この旅を書き出して送れるか。
 *
 * 無料で送れるのは:
 * - 受け取った旅(`imported`)── 送り返しは無料
 * - すでに共有を始めた旅(`sharedAt` あり)── 一度開いた扉は閉めない
 */
export function canShare(trip: Trip, status: ProStatus, now: number): ShareBlock {
  if (trip.imported) return { allowed: true };
  if (trip.sharedAt !== null) return { allowed: true };
  if (isProActive(status, now)) return { allowed: true };
  return { allowed: false, reason: 'needs-pro' };
}

/** 取り込みは**常に無料**。この関数が false を返すことはない(意図の明示として置く) */
export function canImport(): true {
  return true;
}

/**
 * 旅の作成・編集・削除に制限はない。
 * 無料プランでも旅をいくつでも持てる(docs/pricing.md §2)。
 */
export function canCreateTrip(): true {
  return true;
}

/**
 * 解約でデータをロックしないことの明示。
 * **どんな状態でも既存の旅は編集できる。** ここを true 以外にしてはいけない。
 */
export function canEditTrip(): true {
  return true;
}

/**
 * 共有を始めた印をつける。書き出しが成功した直後に呼ぶ。
 * 一度立てたら**下ろさない**(解約しても送り続けられるようにするため)。
 */
export function markShared(trip: Trip, now: number): Partial<Trip> | null {
  if (trip.sharedAt !== null) return null;
  return { sharedAt: now };
}

/* ────────── 購入画面に出す内容(3.1.2 の必須表示) ────────── */

export type PlanId = 'monthly' | 'yearly';

export const PRODUCT_IDS: Record<PlanId, string> = {
  monthly: 'com.tsukune.travelnote.pro.monthly',
  yearly: 'com.tsukune.travelnote.pro.yearly',
};

/*
 * **参考価格の定数はここに置かない。**
 *
 * 以前 REFERENCE_PRICE_JPY を持っていたが、消した。表示に使える数字が
 * コードの中にあると、いつか誰かがそれを画面に出す。地域や価格改定でずれた
 * 瞬間に「価格の明示」(3.1.2)が嘘になる。
 * **価格は StoreKit から取った整形済み文字列だけを出す**(src/pro/purchases.ts)。
 * 月¥300 / 年¥1,800 という値は docs/pricing.md と ROADMAP にある。
 */
