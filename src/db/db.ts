import Dexie from 'dexie';
import type { EntityTable } from 'dexie';
import type { Member, Setting, Trip, TripEvent } from './types';

/**
 * 端末内のデータベース(IndexedDB)。
 *
 * **オフラインファーストの土台。** 読み書きはすべてここに対して行い、
 * UI はサーバ応答を待たない。同期(ROADMAP B-4)は、このテーブルと
 * リモートの差分を突き合わせる層として後から乗せる。
 * 旅先に電波はない ── tabiori はオフラインでは閲覧しかできず、そこが空いている席。
 */
export class TabiDB extends Dexie {
  trips!: EntityTable<Trip, 'id'>;
  events!: EntityTable<TripEvent, 'id'>;
  members!: EntityTable<Member, 'id'>;
  settings!: EntityTable<Setting, 'key'>;

  constructor() {
    super('tabinoshiori');

    // [tripId+dayIndex+order] の複合索引で、その日の予定を「並び順のまま」取り出せる。
    // deletedAt は 0 が生存。IndexedDB は null を索引できないので null を使わない。
    this.version(1).stores({
      trips: 'id, order, startDate, endDate, updatedAt, deletedAt',
      events: 'id, tripId, [tripId+dayIndex+order], [tripId+updatedAt], updatedAt, deletedAt',
      members: 'id, tripId, deviceId',
      settings: 'key',
    });
  }
}

export const db = new TabiDB();

/* ────────── 端末ID ────────── */

const DEVICE_ID_KEY = 'deviceId';

export function newId(): string {
  // crypto.randomUUID は iOS 15.4 未満に無い。deployment target は 15.0
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

let cachedDeviceId: string | null = null;

/**
 * 端末ごとの匿名ID。**アカウントではない。**
 * 共有の参加者を見分けるためだけに使い、氏名やメールアドレスは持たない
 * (App Store 5.1.1(v) のアカウント削除要件を発生させないため)。
 */
export async function getDeviceId(): Promise<string> {
  if (cachedDeviceId !== null) return cachedDeviceId;
  const row = await db.settings.get(DEVICE_ID_KEY);
  if (row) {
    cachedDeviceId = row.value;
    return row.value;
  }
  const id = newId();
  await db.settings.put({ key: DEVICE_ID_KEY, value: id });
  cachedDeviceId = id;
  return id;
}

export async function getSetting(key: string): Promise<string | undefined> {
  return (await db.settings.get(key))?.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}
