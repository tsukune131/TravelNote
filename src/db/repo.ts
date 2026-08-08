import Dexie from 'dexie';
import { db, getDeviceId, newId } from './db';
import type { Member, Trip, TripEvent } from './types';
import { guessCategory } from '../lib/category';
import type { CategoryId } from '../lib/category';
import { compareOrder, orderKeyBetween, orderKeysAfter } from '../lib/fractionalIndex';
import { dayCount } from '../lib/plainDate';
import type { PlainDate } from '../lib/plainDate';

/**
 * データ操作の入口。**画面から Dexie を直接触らない。**
 * 同期用の欄(updatedAt / updatedBy / deletedAt)と並び順の不変条件を
 * ここ一箇所で守らせるため。
 */

const ALIVE = 0;

async function stamp(): Promise<{ updatedAt: number; updatedBy: string; deletedAt: number }> {
  return { updatedAt: Date.now(), updatedBy: await getDeviceId(), deletedAt: ALIVE };
}

/* ────────── 旅 ────────── */

export async function listTrips(): Promise<Trip[]> {
  const rows = await db.trips.where('deletedAt').equals(ALIVE).toArray();
  return rows.sort(compareOrder);
}

export async function getTrip(id: string): Promise<Trip | undefined> {
  const trip = await db.trips.get(id);
  return trip && trip.deletedAt === ALIVE ? trip : undefined;
}

export async function createTrip(input: {
  title: string;
  startDate: PlainDate;
  endDate: PlainDate;
}): Promise<Trip> {
  const trips = await listTrips();
  const last = trips.length > 0 ? trips[trips.length - 1].order : null;
  const trip: Trip = {
    id: newId(),
    title: input.title,
    startDate: input.startDate,
    endDate: input.endDate,
    order: orderKeyBetween(last, null),
    ...(await stamp()),
  };
  await db.trips.add(trip);
  return trip;
}

export async function updateTrip(id: string, patch: Partial<Omit<Trip, 'id'>>): Promise<void> {
  await db.trips.update(id, { ...patch, ...(await stamp()) });
}

/**
 * 論理削除。物理削除すると、オフラインだった相手の端末から復活してしまう。
 * 旅を消したら、その中の予定と参加者もまとめて消したことにする。
 */
export async function deleteTrip(id: string): Promise<void> {
  const s = await stamp();
  const tombstone = { ...s, deletedAt: s.updatedAt };
  await db.transaction('rw', db.trips, db.events, db.members, async () => {
    await db.trips.update(id, tombstone);
    const eventIds = await db.events.where('tripId').equals(id).primaryKeys();
    await db.events.bulkUpdate(eventIds.map((key) => ({ key, changes: tombstone })));
    const memberIds = await db.members.where('tripId').equals(id).primaryKeys();
    await db.members.bulkUpdate(memberIds.map((key) => ({ key, changes: tombstone })));
  });
}

/* ────────── 予定 ────────── */

/**
 * その日の予定を、表示順のまま返す。
 * 時刻ありが先(時刻の昇順)、時刻未定は末尾。同じ時刻どうしは order で決める。
 */
export async function listEventsOfDay(tripId: string, dayIndex: number): Promise<TripEvent[]> {
  const rows = await db.events
    .where('[tripId+dayIndex+order]')
    .between([tripId, dayIndex, Dexie.minKey], [tripId, dayIndex, Dexie.maxKey])
    .toArray();
  return rows.filter((e) => e.deletedAt === ALIVE).sort(compareTimeline);
}

export function compareTimeline(a: TripEvent, b: TripEvent): number {
  if (a.startMinutes === null && b.startMinutes !== null) return 1;
  if (a.startMinutes !== null && b.startMinutes === null) return -1;
  if (a.startMinutes !== null && b.startMinutes !== null && a.startMinutes !== b.startMinutes) {
    return a.startMinutes - b.startMinutes;
  }
  return compareOrder(a, b);
}

/**
 * 追加に必要なのは名前だけ(docs/ux-design.md §4.1)。
 * 時刻は未定、カテゴリは名前から推定、位置はその日の末尾。
 */
export async function addEvent(
  tripId: string,
  dayIndex: number,
  name: string,
): Promise<TripEvent> {
  const existing = await listEventsOfDay(tripId, dayIndex);
  const last = existing.length > 0 ? maxOrder(existing) : null;
  const event = buildEvent(tripId, dayIndex, name, orderKeyBetween(last, null), await stamp());
  await db.events.add(event);
  return event;
}

/** 「10件まとめて放り込む」導線。1件ずつ add するより索引の更新が少なくて済む */
export async function addEvents(
  tripId: string,
  dayIndex: number,
  names: readonly string[],
): Promise<TripEvent[]> {
  const existing = await listEventsOfDay(tripId, dayIndex);
  const keys = orderKeysAfter(existing.length > 0 ? maxOrder(existing) : null, names.length);
  const s = await stamp();
  const events = names.map((name, i) => buildEvent(tripId, dayIndex, name, keys[i], s));
  await db.events.bulkAdd(events);
  return events;
}

function maxOrder(events: readonly TripEvent[]): string {
  return events.reduce((max, e) => (e.order > max ? e.order : max), events[0].order);
}

function buildEvent(
  tripId: string,
  dayIndex: number,
  name: string,
  order: string,
  s: { updatedAt: number; updatedBy: string; deletedAt: number },
): TripEvent {
  return {
    id: newId(),
    tripId,
    dayIndex,
    startMinutes: null,
    durationMinutes: null,
    category: guessCategory(name),
    categoryLocked: false,
    name: name.trim(),
    links: [],
    pinned: false,
    done: false,
    order,
    ...s,
  };
}

export async function updateEvent(
  id: string,
  patch: Partial<Omit<TripEvent, 'id' | 'tripId'>>,
): Promise<void> {
  await db.events.update(id, { ...patch, ...(await stamp()) });
}

/** 名前を変えたら、手で選んでいないかぎりカテゴリも推定し直す */
export async function renameEvent(id: string, name: string): Promise<void> {
  const event = await db.events.get(id);
  if (!event) return;
  const patch: Partial<TripEvent> = { name: name.trim() };
  if (!event.categoryLocked) patch.category = guessCategory(name);
  await updateEvent(id, patch);
}

/** ユーザーが手で選んだカテゴリは、以後の推定で上書きしない */
export async function setEventCategory(id: string, category: CategoryId): Promise<void> {
  await updateEvent(id, { category, categoryLocked: true });
}

export async function deleteEvent(id: string): Promise<void> {
  const s = await stamp();
  await db.events.update(id, { ...s, deletedAt: s.updatedAt });
}

/**
 * 並べ替え / 別の日へ移動。**動かす1件の order だけを書き換える。**
 * 前後の隣人を渡すので、同時編集で他の人が別の場所を触っていても衝突しない。
 */
export async function moveEvent(
  id: string,
  toDayIndex: number,
  before: TripEvent | null,
  after: TripEvent | null,
): Promise<void> {
  await updateEvent(id, {
    dayIndex: toDayIndex,
    order: orderKeyBetween(before?.order ?? null, after?.order ?? null),
  });
}

/* ────────── リフロー(旅程は必ず押す) ────────── */

export type ReflowResult = {
  /** 元に戻すための、変更前の (id, startMinutes) */
  undo: ReadonlyArray<{ id: string; startMinutes: number }>;
  movedCount: number;
  pinnedSkipped: number;
};

/**
 * `fromEventId` 以降の「時刻が入っている予定」をまとめて `deltaMinutes` ずらす。
 * 📌 固定(pinned)の予定と、時刻未定の予定は動かさない。
 *
 * 旅行中にいちばん使う操作(docs/ux-design.md §3.4)。競合に相当機能が見当たらない。
 */
export async function reflowFrom(
  tripId: string,
  dayIndex: number,
  fromEventId: string,
  deltaMinutes: number,
): Promise<ReflowResult> {
  const events = await listEventsOfDay(tripId, dayIndex);
  const start = events.findIndex((e) => e.id === fromEventId);
  if (start < 0) return { undo: [], movedCount: 0, pinnedSkipped: 0 };

  const undo: Array<{ id: string; startMinutes: number }> = [];
  let pinnedSkipped = 0;
  const s = await stamp();

  const changes = events.slice(start).flatMap((e) => {
    if (e.startMinutes === null) return [];
    if (e.pinned) {
      pinnedSkipped += 1;
      return [];
    }
    undo.push({ id: e.id, startMinutes: e.startMinutes });
    // 日をまたがせない。ずらしすぎたら 23:59 で止める
    const next = Math.min(23 * 60 + 59, Math.max(0, e.startMinutes + deltaMinutes));
    return [{ key: e.id, changes: { startMinutes: next, ...s } }];
  });

  if (changes.length > 0) await db.events.bulkUpdate(changes);
  return { undo, movedCount: changes.length, pinnedSkipped };
}

export async function applyUndo(undo: ReflowResult['undo']): Promise<void> {
  if (undo.length === 0) return;
  const s = await stamp();
  await db.events.bulkUpdate(
    undo.map((u) => ({ key: u.id, changes: { startMinutes: u.startMinutes, ...s } })),
  );
}

/* ────────── 参加者 ────────── */

export async function listMembers(tripId: string): Promise<Member[]> {
  const rows = await db.members.where('tripId').equals(tripId).toArray();
  return rows.filter((m) => m.deletedAt === ALIVE);
}

/** 旅を作った端末を作成者として登録する。アカウント登録は求めない */
export async function ensureOwner(tripId: string, displayName: string): Promise<Member> {
  const deviceId = await getDeviceId();
  const existing = (await listMembers(tripId)).find((m) => m.deviceId === deviceId);
  if (existing) return existing;
  const member: Member = {
    id: newId(),
    tripId,
    deviceId,
    displayName,
    role: 'owner',
    ...(await stamp()),
  };
  await db.members.add(member);
  return member;
}

/* ────────── 起動時の着地点 ────────── */

/**
 * 進行中の旅があれば、その旅の「今日」を返す。
 * 旅行中に「一覧 → 旅を選ぶ → 今日を探す」を毎回やらせないため
 * (docs/ux-design.md §2.2)。
 */
export async function findLandingPoint(
  todayDate: PlainDate,
): Promise<{ tripId: string; dayIndex: number } | null> {
  const trips = await listTrips();

  const ongoing = trips.find((t) => t.startDate <= todayDate && todayDate <= t.endDate);
  if (ongoing) {
    const i = daysBetweenInclusive(ongoing.startDate, todayDate);
    return { tripId: ongoing.id, dayIndex: i };
  }

  // 直前に迫っている旅(7日以内)は Day 1 を開く
  const upcoming = trips
    .filter((t) => t.startDate > todayDate)
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0];
  if (upcoming && daysBetweenInclusive(todayDate, upcoming.startDate) <= 7) {
    return { tripId: upcoming.id, dayIndex: 0 };
  }

  return null;
}

function daysBetweenInclusive(from: PlainDate, to: PlainDate): number {
  return dayCount(from, to) - 1;
}
