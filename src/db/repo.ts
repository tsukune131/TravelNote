import Dexie from 'dexie';
import { db, getDeviceId, newId } from './db';
import { setDisplayName } from './settings';
import type { DayVariant, EventLink, Member, PackItem, Trip, TripEvent } from './types';
import { guessCategory } from '../lib/category';
import type { CategoryId } from '../lib/category';
import { compareOrder, orderKeyBetween, orderKeysAfter } from '../lib/fractionalIndex';
import { placeForTime } from '../lib/ordering';
import type { TravelMode } from '../lib/maps';
import { dayCount, today } from '../lib/plainDate';
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

/**
 * 旅の一覧。**作った順ではなく、いま関係がある順に並べる。**
 *
 *   1. 旅行中
 *   2. これから(近い順)
 *   3. 終わった(新しい順)
 *
 * 単純な日付の昇順だと**過去の旅が一番上**に来る。降順だと
 * **来年の旅が旅行中より上**に来る。どちらも開いた瞬間に困る。
 * この並びは、カードに出しているチップ(旅行中 / あと{n}日 / 終了)と一致する。
 *
 * `order`(作った順)は同じ日付どうしの決着にだけ使う。共有で運ばれる値なので
 * 捨てはしない。
 */
export async function listTrips(): Promise<Trip[]> {
  const rows = await db.trips.where('deletedAt').equals(ALIVE).toArray();
  const now = today();
  const bucket = (t: Trip) => (t.endDate < now ? 2 : t.startDate <= now ? 0 : 1);

  return rows.sort((a, b) => {
    const byBucket = bucket(a) - bucket(b);
    if (byBucket !== 0) return byBucket;
    if (a.startDate !== b.startDate) {
      // 終わった旅だけ新しい順。思い出は近いものから見たい
      return bucket(a) === 2
        ? b.startDate.localeCompare(a.startDate)
        : a.startDate.localeCompare(b.startDate);
    }
    return compareOrder(a, b);
  });
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
    sharedAt: null,
    imported: false,
    ...(await stamp()),
  };
  await db.trips.add(trip);
  return trip;
}

export async function updateTrip(id: string, patch: Partial<Omit<Trip, 'id'>>): Promise<void> {
  await db.trips.update(id, { ...patch, ...(await stamp()) });
}

/**
 * 旅に付けるリンク(写真アルバムなど)。
 * 同じ URL は入れ直さない ── 貼り間違えて2回押したときに増やさないため。
 */
export async function addTripLink(id: string, link: EventLink): Promise<void> {
  const trip = await db.trips.get(id);
  if (!trip) return;
  const links = trip.links ?? [];
  if (links.some((l) => l.url === link.url)) return;
  await updateTrip(id, { links: [...links, link] });
}

export async function removeTripLink(id: string, url: string): Promise<void> {
  const trip = await db.trips.get(id);
  if (!trip) return;
  await updateTrip(id, { links: (trip.links ?? []).filter((l) => l.url !== url) });
}

/* ────────── 準備(持ち物・メモ) ────────── */

/**
 * 持ち物リストを書き換える。
 *
 * **読んで・変えて・書くを直列にする。** チェックは続けて何個も付くので、
 * 素で書くと読み込みが重なって先の1件が消える(移動時間の欄で実際に踏んだ)。
 * 印は先に作る ── トランザクションの中で別のテーブル(設定)を読ませない。
 */
async function editPacking(
  id: string,
  change: (items: PackItem[]) => PackItem[],
): Promise<void> {
  const s = await stamp();
  await db.transaction('rw', db.trips, async () => {
    const trip = await db.trips.get(id);
    if (!trip) return;
    await db.trips.update(id, { packing: change(trip.packing ?? []), ...s });
  });
}

/** 同じ名前のものは足さない。テンプレを2回押しても増えないように */
export async function addPackItems(id: string, texts: readonly string[]): Promise<void> {
  await editPacking(id, (items) => {
    const have = new Set(items.map((i) => i.text));
    const add = texts
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !have.has(t))
      .map((text) => ({ id: newId(), text, checked: false }));
    return [...items, ...add];
  });
}

export async function togglePackItem(id: string, itemId: string): Promise<void> {
  await editPacking(id, (items) =>
    items.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i)),
  );
}

export async function removePackItem(id: string, itemId: string): Promise<void> {
  await editPacking(id, (items) => items.filter((i) => i.id !== itemId));
}

/** チェック済みをまとめて片づける。旅が終わったあとの掃除用 */
export async function clearCheckedPackItems(id: string): Promise<void> {
  await editPacking(id, (items) => items.filter((i) => !i.checked));
}

export async function setTripNote(id: string, note: string): Promise<void> {
  await updateTrip(id, { note: note.trim() || undefined });
}

/**
 * 予約済にした予定を、旅ぜんぶから拾って日付順に返す。
 * **空港で「予約番号どこ」を探さないため**(docs/ux-design.md §7.1)。
 */
export async function listBookedEvents(tripId: string): Promise<TripEvent[]> {
  const rows = await db.events.where('tripId').equals(tripId).toArray();
  return rows
    .filter((e) => e.deletedAt === ALIVE && e.booking?.booked === true)
    .sort((a, b) => a.dayIndex - b.dayIndex || compareOrder(a, b));
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
 *
 * その日に「案」がある場合は、採用中(active)の案のぶんだけを返す。
 * ふだんは案が無く、variantId が null のものだけが並ぶ。
 */
export async function listEventsOfDay(tripId: string, dayIndex: number): Promise<TripEvent[]> {
  const rows = await db.events
    .where('[tripId+dayIndex+order]')
    .between([tripId, dayIndex, Dexie.minKey], [tripId, dayIndex, Dexie.maxKey])
    .toArray();
  const alive = rows.filter((e) => e.deletedAt === ALIVE);
  const activeVariantId = await getActiveVariantId(tripId, dayIndex);
  // 並びは order がすべて。時刻で勝手に沈めない(src/lib/ordering.ts)
  return alive.filter((e) => e.variantId === activeVariantId).sort(compareOrder);
}

/* ────────── 案(衝突したときだけ現れる) ────────── */

export async function listVariants(tripId: string, dayIndex: number): Promise<DayVariant[]> {
  const rows = await db.dayVariants
    .where('[tripId+dayIndex]')
    .equals([tripId, dayIndex])
    .toArray();
  const alive = rows.filter((v) => v.deletedAt === ALIVE);
  // 自分の案を必ず左に。並びが毎回変わると、どちらを見ているか分からなくなる
  const me = await getDeviceId();
  return alive.sort((a, b) => Number(b.createdBy === me) - Number(a.createdBy === me));
}

/** 案が無ければ null(= 本線の予定を見る) */
export async function getActiveVariantId(tripId: string, dayIndex: number): Promise<string | null> {
  const variants = await listVariants(tripId, dayIndex);
  if (variants.length === 0) return null;
  return (variants.find((v) => v.active) ?? variants[0]).id;
}

/** 見比べるために表示を切り替える(採用はしない) */
export async function showVariant(tripId: string, dayIndex: number, variantId: string): Promise<void> {
  const variants = await listVariants(tripId, dayIndex);
  const s = await stamp();
  await db.dayVariants.bulkUpdate(
    variants.map((v) => ({ key: v.id, changes: { active: v.id === variantId, ...s } })),
  );
}

/**
 * 案を採用して本線に戻す。採用した案の予定は variantId を外し、
 * ほかの案の予定は論理削除する。これでその日から枝分かれが消える。
 */
export async function adoptVariant(
  tripId: string,
  dayIndex: number,
  variantId: string,
): Promise<void> {
  const variants = await listVariants(tripId, dayIndex);
  const rows = await db.events
    .where('[tripId+dayIndex+order]')
    .between([tripId, dayIndex, Dexie.minKey], [tripId, dayIndex, Dexie.maxKey])
    .toArray();
  const s = await stamp();
  const tombstone = { ...s, deletedAt: s.updatedAt };

  await db.transaction('rw', db.events, db.dayVariants, async () => {
    await db.events.bulkUpdate(
      rows
        .filter((e) => e.deletedAt === ALIVE && e.variantId !== null)
        .map((e) =>
          e.variantId === variantId
            ? { key: e.id, changes: { variantId: null, ...s } }
            : { key: e.id, changes: tombstone },
        ),
    );
    await db.dayVariants.bulkUpdate(variants.map((v) => ({ key: v.id, changes: tombstone })));
  });
}

/**
 * 時刻を入れる/変える。
 *
 * **入れた瞬間に一度だけ**、ほかの「時刻あり」と前後が合う位置へ移す。
 * 以後は動かない ── 勝手に動くのが困るのだから(src/lib/ordering.ts)。
 */
export async function setEventTime(id: string, minutes: number | null): Promise<void> {
  const event = await db.events.get(id);
  if (!event) return;

  if (minutes === null) {
    // 時刻を外しても位置は動かさない。下へ落とすのが不評だった
    await updateEvent(id, { startMinutes: null });
    return;
  }

  const siblings = await listEventsOfDay(event.tripId, event.dayIndex);
  const place = placeForTime(siblings, id, minutes);
  await updateEvent(id, {
    startMinutes: minutes,
    ...(place
      ? { order: orderKeyBetween(place.before?.order ?? null, place.after?.order ?? null) }
      : {}),
  });
}

/**
 * 追加に必要なのは名前だけ(docs/ux-design.md §4.1)。
 * 時刻は未定、カテゴリは名前から推定、位置はその日の末尾。
 */
export async function addEvent(
  tripId: string,
  dayIndex: number,
  name: string,
  startMinutes: number | null = null,
): Promise<TripEvent> {
  const existing = await listEventsOfDay(tripId, dayIndex);
  const last = existing.length > 0 ? maxOrder(existing) : null;
  const event = buildEvent(tripId, dayIndex, name, orderKeyBetween(last, null), await stamp());
  await db.events.add(event);
  // 「9:00 二条城」のように時刻ごと入れられたときは、そのまま正しい位置へ
  if (startMinutes !== null) await setEventTime(event.id, startMinutes);
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
    travelMinutes: null,
    travelMode: null,
    pinned: false,
    done: false,
    order,
    variantId: null,
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

/**
 * 別の日へ移す。移した先の末尾に置く。
 * 移動時間は「次の予定への」ものなので、日をまたいだら意味を失う。落とす。
 */
export async function moveEventToDay(id: string, toDayIndex: number): Promise<void> {
  const event = await db.events.get(id);
  if (!event || event.dayIndex === toDayIndex) return;
  const target = await listEventsOfDay(event.tripId, toDayIndex);
  const last = target.length > 0 ? maxOrder(target) : null;
  await updateEvent(id, {
    dayIndex: toDayIndex,
    order: orderKeyBetween(last, null),
    travelMinutes: null,
    travelMode: null,
  });
}

/**
 * ひとつ上/下へ。
 *
 * ドラッグ&ドロップにしていないのは、**同じ行で横スワイプ(完了・削除)を
 * 使っているため縦ドラッグとジェスチャが衝突する**から。
 * 時刻ありの予定は時刻順に並ぶので、手で並べ替えたいのは実質「時刻未定」だけで、
 * それには上下ボタンで足りる。
 */
export async function nudgeEvent(id: string, direction: -1 | 1): Promise<void> {
  const event = await db.events.get(id);
  if (!event) return;
  const siblings = (await listEventsOfDay(event.tripId, event.dayIndex)).filter(
    (e) => (e.startMinutes === null) === (event.startMinutes === null),
  );
  const i = siblings.findIndex((e) => e.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= siblings.length) return;

  // 入れ替え先の「向こう隣」との間に入る
  const target = siblings[j];
  const beyond = siblings[j + direction] ?? null;
  const [before, after] = direction === 1 ? [target, beyond] : [beyond, target];
  await updateEvent(id, { order: orderKeyBetween(before?.order ?? null, after?.order ?? null) });
}

/** 複製。同じ日の、元の直後に置く */
export async function duplicateEvent(id: string): Promise<TripEvent | null> {
  const event = await db.events.get(id);
  if (!event) return null;
  const siblings = await listEventsOfDay(event.tripId, event.dayIndex);
  const i = siblings.findIndex((e) => e.id === id);
  const next = i >= 0 ? (siblings[i + 1] ?? null) : null;
  const copy: TripEvent = {
    ...event,
    id: newId(),
    done: false,
    order: orderKeyBetween(event.order, next?.order ?? null),
    ...(await stamp()),
  };
  await db.events.add(copy);
  return copy;
}

/** 旅行中に「行った」を潰していく。右スワイプから呼ぶ */
export async function toggleDone(id: string): Promise<void> {
  const event = await db.events.get(id);
  if (!event) return;
  await updateEvent(id, { done: !event.done });
}

/** 次の予定への移動時間。0 や null で「未設定」に戻る */
export async function setTravel(
  id: string,
  minutes: number | null,
  mode: TravelMode | null,
): Promise<void> {
  const cleared = minutes === null || minutes <= 0;
  await updateEvent(id, {
    travelMinutes: cleared ? null : minutes,
    travelMode: cleared ? null : mode,
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

/**
 * 参加者。**並びを固定する。**
 * Dexie が返す順は索引の都合で決まるので、放っておくと表示のたびに人が入れ替わる。
 * 自分を先頭に、あとは加わった順。
 */
export async function listMembers(tripId: string): Promise<Member[]> {
  const rows = await db.members.where('tripId').equals(tripId).toArray();
  const deviceId = await getDeviceId();
  return rows
    .filter((m) => m.deletedAt === ALIVE)
    .sort((a, b) => {
      const mine = (m: Member) => (m.deviceId === deviceId ? 0 : 1);
      return mine(a) - mine(b) || a.updatedAt - b.updatedAt || a.id.localeCompare(b.id);
    });
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

/**
 * 表示名を変える。**すでに登録済みの参加者レコードの名前も直す。**
 *
 * `ensureOwner` は作った時点の名前を写し取るだけなので、これが無いと
 * 設定で名前を変えても**共有画面の「参加している人」は古いまま**になる
 * (実際に踏んだ)。送り出すしおりにも古い名前が入ってしまう。
 *
 * 直すのは**自分の端末IDを持つレコードだけ**。他人の名前は書き換えない。
 */
export async function setMyDisplayName(name: string): Promise<void> {
  const trimmed = name.trim();
  await setDisplayName(trimmed);
  // 空にしたときは、すでに名乗ってある名前まで消さない
  if (trimmed.length === 0) return;

  const deviceId = await getDeviceId();
  const mine = await db.members.where('deviceId').equals(deviceId).toArray();
  if (mine.length === 0) return;

  const s = await stamp();
  await db.members.bulkUpdate(
    mine.map((m) => ({ key: m.id, changes: { displayName: trimmed, ...s } })),
  );
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
