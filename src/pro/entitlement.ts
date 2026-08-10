import { toDate } from '../lib/plainDate';
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
 *   一度共有した旅を再送する      → 無料(解約後も)。**旅の終了日+60日まで**
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
  | { allowed: false; reason: 'needs-pro' | 'window-expired' };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 旅が終わってから、Pro なしで送れる猶予。**旅の記録を送り合う期間。**
 * 帰ってから写真やメモを足して送り直す、までは無料で通したい。
 */
export const GRACE_AFTER_TRIP_MS = 60 * DAY_MS;

/**
 * 送れるようになってから、最低限保証する期間。
 *
 * ⚠️ **これが無いと、終わった旅を共有した瞬間に期限切れになる。**
 * 去年の旅を記録として送る使い方は普通にあるし、Pro を買った直後に
 * 「送れません」と出るのは事故にしか見えない。
 */
export const MIN_SHARE_WINDOW_MS = 90 * DAY_MS;

/**
 * 1つの旅から取り出せる無料期間の上限。
 *
 * ⚠️ **これが無いと、遠い未来の日付で器を作れる。** ¥300で1か月だけ入り、
 * 2099年の旅として共有してから解約すれば、その旅は2099年まで送れてしまう。
 * 解約した人も無料の人なので縛り自体はかかっているが、**縛りが70年ある**。
 *
 * 日付の入力そのものは制限しない ── 2099年の旅を作るのは自由。
 * **取り出せる無料期間だけ**を切る。3年あれば実際の計画には十分で、
 * それより先を計画している人はまず契約中。
 */
export const MAX_SHARE_WINDOW_MS = 3 * 365 * DAY_MS;

/**
 * この旅を Pro なしで送れる期限を決める。**送れるようになった瞬間に1度だけ呼ぶ。**
 *
 * 基準は**旅の終了日**であって、受け取った日ではない ──
 * 「受け取ってから1年」にしていたときは、**器を作り変えて来年の旅に使えた**。
 * 終了日を基準にすれば、その器は「その旅のためのもの」に閉じる。
 *
 * 決めたあとに日付を編集しても**期限は動かない**(呼び直さない)。
 * だから日付そのものを編集不可にする必要がない ── 1泊延ばす・宿が取れずに
 * 1週間ずらす、は計画中の日常で、そこを止める代償のほうが大きい。
 */
export function shareWindowUntilFor(trip: Trip, now: number): number {
  const afterTrip = toDate(trip.endDate).getTime() + GRACE_AFTER_TRIP_MS;
  const wanted = Math.max(afterTrip, now + MIN_SHARE_WINDOW_MS);
  return Math.min(wanted, now + MAX_SHARE_WINDOW_MS);
}

/**
 * この旅を書き出して送れるか。
 *
 * 見るのは **`shareWindowUntil`(この端末で送れる期限)**。
 * 送れるようになった瞬間に凍結した絶対時刻なので、あとから旅の日付を
 * 動かしても伸びない ── 器の使い回しを塞ぐのはここ。
 *
 * `sharedAt` へのフォールバックは、この項目が無い頃に作られた旅のための保険。
 */
export function canShare(trip: Trip, status: ProStatus, now: number): ShareBlock {
  if (isProActive(status, now)) return { allowed: true };

  if (trip.shareWindowUntil !== undefined) {
    return now <= trip.shareWindowUntil
      ? { allowed: true }
      : { allowed: false, reason: 'window-expired' };
  }

  // 旧データ: 期限を持っていない。共有済みなら、その場で決め直して判定する
  if (trip.sharedAt === null) return { allowed: false, reason: 'needs-pro' };
  return now <= shareWindowUntilFor(trip, trip.sharedAt)
    ? { allowed: true }
    : { allowed: false, reason: 'window-expired' };
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
 * 共有を始めた印をつける。**送るのが成功した直後に呼ぶ。**
 *
 * ⚠️ **共有シートを閉じただけのときは呼ばない。** 以前は書き出しの時点で
 * 立てていたので、**一度も送っていないのに1年の時計が動き出していた**
 * (監査で見つかった)。判定を2か所に分けないよう、印を作るのはここだけ。
 *
 * 一度立てたら**下ろさない**(解約しても送り続けられるようにするため)。
 */
export function markShared(trip: Trip, now: number): Partial<Trip> | null {
  if (trip.sharedAt !== null) return null;
  return {
    sharedAt: now,
    shareWindowUntil: trip.shareWindowUntil ?? shareWindowUntilFor(trip, now),
  };
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
