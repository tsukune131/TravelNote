import type { TripEvent } from '../db/types';
import type { TravelMode } from './maps';

/**
 * 予定と予定の「あいだ」を計算する。
 *
 * **旅程アプリの価値の核はここ。** 点(予定)は他のアプリにもあるが、
 * 「次に間に合うか」「ここに何か入れられるか」を出すものは少ない。
 *
 * 純粋関数なので DB もブラウザも無しで検証できる。
 */

/** これ以上あいていたら「空き」として見せる。docs/ux-design.md §3.1 */
export const FREE_TIME_THRESHOLD = 120;

export type Connector = {
  /** 手入力された移動。未設定なら null */
  travel: { minutes: number; mode: TravelMode } | null;
  /** 前の予定の終わり → 次の予定の始まり。どちらかが時刻未定なら null */
  gapMinutes: number | null;
  /** 移動を引いたあとの余り。2時間以上のときだけ「空き」として出す */
  freeMinutes: number | null;
  /** 移動時間が空きを食いつぶしている */
  tooTight: boolean;
  /** 何かしら描くものがあるか */
  visible: boolean;
};

export const EMPTY_CONNECTOR: Connector = {
  travel: null,
  gapMinutes: null,
  freeMinutes: null,
  tooTight: false,
  visible: false,
};

/** その予定が終わる時刻(0:00 からの分)。所要時間が無ければ開始と同じ */
export function endOf(event: TripEvent): number | null {
  if (event.startMinutes === null) return null;
  return event.startMinutes + (event.durationMinutes ?? 0);
}

export function connectorBetween(prev: TripEvent, next: TripEvent): Connector {
  const travel =
    prev.travelMinutes !== null && prev.travelMinutes > 0
      ? { minutes: prev.travelMinutes, mode: prev.travelMode ?? 'transit' }
      : null;

  const from = endOf(prev);
  const to = next.startMinutes;

  // どちらかが時刻未定なら、間隔は計算できない。移動時間だけ出す
  if (from === null || to === null) {
    return { travel, gapMinutes: null, freeMinutes: null, tooTight: false, visible: travel !== null };
  }

  const gapMinutes = to - from;
  const slack = gapMinutes - (travel?.minutes ?? 0);
  const tooTight = travel !== null && slack < 0;
  const freeMinutes = slack >= FREE_TIME_THRESHOLD ? slack : null;

  return {
    travel,
    gapMinutes,
    freeMinutes,
    tooTight,
    visible: travel !== null || freeMinutes !== null,
  };
}

/**
 * リフロー(ここから後ろへずらす)で何件動くかを、実行前に数える。
 * 「30分ずらす」を押す前に何が起きるか見せるため。
 */
export function reflowPreview(
  events: readonly TripEvent[],
  fromEventId: string,
): { willMove: number; pinnedSkipped: number; untimedSkipped: number } {
  const start = events.findIndex((e) => e.id === fromEventId);
  if (start < 0) return { willMove: 0, pinnedSkipped: 0, untimedSkipped: 0 };

  let willMove = 0;
  let pinnedSkipped = 0;
  let untimedSkipped = 0;
  for (const e of events.slice(start)) {
    if (e.startMinutes === null) untimedSkipped += 1;
    else if (e.pinned) pinnedSkipped += 1;
    else willMove += 1;
  }
  return { willMove, pinnedSkipped, untimedSkipped };
}
