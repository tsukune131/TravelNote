/**
 * 全画面広告を**いま出してよいか**の判定。純粋関数(実行して確かめられるように)。
 *
 * ## 決めたこと(2026-09-24)
 *
 * - 出すのは**区切りのとき**だけ(旅一覧 ⇄ 旅の画面を行き来したとき)。
 *   入力や並べ替えの最中には出さない
 * - 前回から**最短5分**あける
 * - そのうえで「**操作が8回**たまった」か「**使い始めて10分**たった」のどちらか
 * - ⚠️ **旅行中の旅があるあいだは出さない。** 差別化の軸「旅行中に強い」を
 *   守るための線。駅のホームで次の予定を見たい瞬間に広告を挟まない。
 *   旅行中に旅一覧へ戻るのも「次を確かめる」ためなので、画面では区別しない
 * - **入れてから1日は出さない。** 最初の印象を広告で作らない
 *
 * スキップまでの秒数は AdMob 側(広告の種類)で決まり、アプリからは指定できない。
 */

export const MIN_INTERVAL_MS = 5 * 60 * 1000;
export const ACTIONS_TO_TRIGGER = 8;
export const TIME_TO_TRIGGER_MS = 10 * 60 * 1000;
export const NEW_USER_GRACE_MS = 24 * 60 * 60 * 1000;

export type InterstitialState = {
  /** 初めて起動した時刻 */
  firstLaunchAt: number;
  /** 前回出した時刻。まだ出していなければ null */
  lastShownAt: number | null;
  /** 前回出してから(またはこの起動から)数えた操作の回数 */
  actionsSince: number;
  /** 前回出してから(またはこの起動から)の起点 */
  countingSince: number;
};

export function shouldShowInterstitial(
  state: InterstitialState,
  now: number,
  context: { onTripInProgress: boolean },
): boolean {
  if (context.onTripInProgress) return false;
  if (now - state.firstLaunchAt < NEW_USER_GRACE_MS) return false;
  if (state.lastShownAt !== null && now - state.lastShownAt < MIN_INTERVAL_MS) return false;
  return (
    state.actionsSince >= ACTIONS_TO_TRIGGER || now - state.countingSince >= TIME_TO_TRIGGER_MS
  );
}
