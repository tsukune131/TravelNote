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
 *   一度共有した旅を再送する      → 無料(解約後も)。**ただし初回共有から1年**
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

/**
 * 一度共有した旅を、Pro なしで送り続けられる期間。**初回共有から1年。**
 *
 * ## なぜ無期限をやめたか
 *
 * 無期限だと**一円も払わずに使い放題にできた**。誰かから1つ受け取れば
 * その旅は `imported` で送り放題になるので、**名前と日付と予定を入れ替えて
 * 「共有用の器」として永久に使い回せる**。払った人が1回だけ払って
 * 同じことをするのも同様。サーバーもアカウントも持たない以上、
 * 「別の旅に作り変えたか」を確実に見分ける手段が無い。
 *
 * ## なぜ1年か(90日ではなく)
 *
 * **海外旅行や連休の旅は3〜6か月前から計画する。** 90日にすると、
 * 1月に共有 → 7月の旅行、という組で4月の送り返しが止まる ──
 * **正当な使い方なのに、旅の準備中に締め出される。**
 * 1年あれば単独の旅の一生はまず収まり、器の使い回しには課金が要るようになる。
 *
 * ⚠️ **誤って止めるほうが、取り損ねるより高くつく。** 失うのは¥300、
 * 失われるのは旅先での信頼。短くするなら、この非対称を思い出すこと。
 */
export const FREE_RESHARE_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * この旅を書き出して送れるか。
 *
 * 起点は **`shareWindowFrom`(この端末が送れるようになった時刻)**であって、
 * `sharedAt`(世界で最初に共有された時刻)ではない ──
 * `sharedAt` を起点にすると、**1年以上前の旅を受け取った人が最初から
 * 送り返せず、往復が切れる**(監査で見つかった)。詳細は `db/types.ts`。
 *
 * `?? sharedAt` は、この項目が無い頃に作られた旅のための保険。
 */
export function canShare(trip: Trip, status: ProStatus, now: number): ShareBlock {
  if (isProActive(status, now)) return { allowed: true };

  const from = trip.shareWindowFrom ?? trip.sharedAt;
  if (from === null || from === undefined) return { allowed: false, reason: 'needs-pro' };
  if (now <= from + FREE_RESHARE_WINDOW_MS) return { allowed: true };
  return { allowed: false, reason: 'window-expired' };
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
  return { sharedAt: now, shareWindowFrom: trip.shareWindowFrom ?? now };
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
