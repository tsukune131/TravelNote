import { useSyncExternalStore } from 'react';
import { FREE } from './entitlement';
import type { ProStatus } from './entitlement';
import { cachedStatus, refreshProStatus } from './purchases';

/**
 * Pro かどうかを、アプリ全体で1つだけ持つ。
 *
 * Provider を足さないのは、これを見るのが**3か所しかない**から
 * (共有シート・購入画面・設定)。そのために木の一番上を触る必要はない。
 *
 * ⚠️ **画面ごとに StoreKit へ聞きに行かせない。** 聞くのは起動時と前面復帰時、
 * それと購入・復元の直後だけ。押すたびに通信すると、圏外で待たされる。
 */

let current: ProStatus = FREE;
const listeners = new Set<() => void>();

function publish(next: ProStatus) {
  current = next;
  for (const listener of listeners) listener();
}

export function getProStatus(): ProStatus {
  return current;
}

export function setProStatus(next: ProStatus): void {
  publish(next);
}

/**
 * 起動時と前面復帰時に呼ぶ。
 * **先に手元の記録で埋めてから**、StoreKit の返事で上書きする ──
 * 起動直後の一瞬だけ「無料」に見える、を避ける。
 */
export async function syncProStatus(): Promise<void> {
  publish(await cachedStatus());
  publish(await refreshProStatus());
}

export function useProStatus(): ProStatus {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getProStatus,
    getProStatus,
  );
}
