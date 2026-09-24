import type { Trip } from '../db/types';

/**
 * 「たびのしおり Pro」の判定。
 *
 * ## 線引き(2026-09-24 に変更。ROADMAP 現在地)
 *
 * **共有は無料。** 送る・受け取る・送り返す・編集する、はすべて誰でもできる。
 * 以前は「はじめて共有するとき」だけ Pro だったが、共有に課金すると
 * 受け取る友達まで広がらないので外した。Pro の中身は:
 *
 *   広告なし          → **本人の契約**で決まる
 *   天気・タスク割り振り → **旅の作成者が Pro なら、その旅の参加者全員**
 *                        (自分が Pro なら、どの旅でも使える)
 *
 * 旅の数は無料でも制限しない。**解約してもデータはロックしない。**
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

/** 広告を出すか。**本人の契約だけ**で決まる(旅の作成者の契約は効かない) */
export function showsAds(status: ProStatus, now: number): boolean {
  return !isProActive(status, now);
}

/**
 * この旅の作成者は自分か。
 *
 * `ownerDeviceId` が無い旅(この項目より前に作った旅)は、
 * **受け取った旅でなければ自分が作った**とみなす。
 */
export function isTripOwner(trip: Trip, deviceId: string): boolean {
  if (trip.ownerDeviceId !== undefined) return trip.ownerDeviceId === deviceId;
  return !trip.imported;
}

/**
 * この旅で Pro の機能(天気・タスク割り振り)が使えるか。
 *
 * - 自分が Pro なら、どの旅でも使える(払った人から取り上げない)
 * - そうでなくても、**旅の作成者が Pro なら使える**(`trip.ownerPro`)。
 *   1人が払えば旅の全員に効く ── 共有で広がるアプリなので、ここを各自課金にしない
 *
 * ⚠️ `ownerPro` は**作成者の端末だけが書く**(`ownerProPatch`)。
 * 参加者の端末はそれを信じるしかない(サーバーが無いので確かめる手段が無い)。
 */
export function tripFeaturesUnlocked(trip: Trip, status: ProStatus, now: number): boolean {
  return isProActive(status, now) || trip.ownerPro === true;
}

/**
 * 作成者の端末で、旅の `ownerPro` を契約の状態に合わせる。
 * **変わるときだけ**差分を返す ── 起動のたびに書くと、全部の旅が
 * 「未送信の変更あり」になってしまう。
 */
export function ownerProPatch(
  trip: Trip,
  deviceId: string,
  status: ProStatus,
  now: number,
): Partial<Trip> | null {
  if (!isTripOwner(trip, deviceId)) return null;
  const active = isProActive(status, now);
  if ((trip.ownerPro === true) === active) return null;
  return { ownerPro: active };
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
 * Pro が切れても、付けてあったタスクの担当は消さずに見せる。
 */
export function canEditTrip(): true {
  return true;
}

/**
 * 共有を始めた印をつける。**送るのが成功した直後に呼ぶ。**
 * 共有は無料になったので課金には使わない。「◯月◯日に送りました」の表示用。
 * ⚠️ 共有シートを閉じただけのときは呼ばない。
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

/**
 * 日本の定価。**表示にしか使わない。課金する金額は StoreKit が決める。**
 *
 * 一度は「価格の定数を持たない」方針にしたが、戻した。理由:
 * **Sandbox のストアフロントが米国になり、ドル表示から抜け出せなかった**
 * (サンドボックステスターを日本にしても直らなかった)。
 * 審査用スクリーンショットを円で撮るためにここが要る。
 *
 * ただし**無条件には使わない**(src/ui/Paywall.tsx):
 * StoreKit が**円で**返したときはそちらを出し、円以外のときだけこれを出す。
 * 本アプリは**日本のみ配信**なので、本番で円以外が返ることはない ──
 * つまり本番では常に StoreKit の値が出て、価格改定にも自動で追従する。
 *
 * ⚠️ **App Store Connect の価格を変えたら、ここも変える。**
 * 変え忘れると Sandbox の表示だけが古くなる(本番は StoreKit が正すので無事)。
 */
export const PRICE_TEXT_JPY: Record<PlanId, string> = {
  monthly: '¥300',
  yearly: '¥1,800',
};
