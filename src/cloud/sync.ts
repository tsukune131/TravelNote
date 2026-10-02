import type { Transaction } from 'dexie';
import { App as CapApp } from '@capacitor/app';
import { db, getSetting, setSetting } from '../db/db';
import type { DayVariant, Member, Trip, TripEvent } from '../db/types';
import { orderKeyBetween } from '../lib/fractionalIndex';
import { CloudSync, cloudAvailable } from './native';
import type { CloudLocation, OutgoingRecord, RecordType } from './native';

/**
 * Dexie と iCloud(CloudKit)をつなぐ層。設計は ROADMAP E-1 の引用ブロックが正。
 *
 * - **画面は今までどおり Dexie だけを読み書きする。** ここは Dexie の書き込みを
 *   横で見ていて(hook)、**変わった欄だけ**をネイティブに渡す
 * - 受け取った変更は Dexie に入れる。そのときの書き込みは送り返さない(`REMOTE`)
 * - 欄の値は JSON 文字列にして運ぶ(ネイティブは中身を見ない)
 */

type TableName = 'trips' | 'events' | 'members' | 'dayVariants';
type Row = Trip | TripEvent | Member | DayVariant;

const TYPE_OF: Record<TableName, RecordType> = {
  trips: 'Trip',
  events: 'Event',
  members: 'Member',
  dayVariants: 'DayVariant',
};
const TABLE_OF: Record<RecordType, TableName> = {
  Trip: 'trips',
  Event: 'events',
  Member: 'members',
  DayVariant: 'dayVariants',
};

/**
 * 端末だけの欄。**同期しない。**
 * 旅の `deletedAt` もここ ── 旅を消すのは欄ではなくゾーンの削除で伝える
 * (作成者が消しても、参加者の端末には写しを残す決まりなので)。
 */
const LOCAL_FIELDS: Record<TableName, ReadonlySet<string>> = {
  trips: new Set(['id', 'order', 'imported', 'sharedAt', 'shareWindowUntil', 'cloud', 'sharedEndedAt', 'deletedAt']),
  events: new Set(['id']),
  members: new Set(['id']),
  dayVariants: new Set(['id']),
};

/**
 * **同期する欄の一覧。CloudKit のスキーマと1対1。**
 *
 * ⚠️ 型(src/db/types.ts)に欄を足したら、ここにも足すこと。足さないと、
 * 開発環境では動くのに**本番でだけ**その欄を含む記録が送れない
 * (本番は見たことのない欄を受け付けない)。手順:
 *   1. ここに足す → 2. デバッグビルドを1回起動(`seedSchema` が開発環境に欄を作る)
 *   3. CloudKit コンソールで Deploy Schema Changes → 4. リリース
 * 一覧に無い欄を送ろうとしたら、開発中にコンソールへエラーを出す(`recordOf`)。
 */
export const SCHEMA: Record<RecordType, readonly string[]> = {
  Trip: ['title', 'startDate', 'endDate', 'updatedAt', 'updatedBy', 'ownerDeviceId', 'ownerPro', 'place', 'placeChanges', 'links', 'packing', 'note'],
  Event: [
    'tripId', 'dayIndex', 'startMinutes', 'durationMinutes', 'category', 'categoryLocked', 'name', 'note',
    'lat', 'lng', 'address', 'links', 'booking', 'travelMinutes', 'travelMode', 'pinned', 'done', 'costYen',
    'order', 'assigneeIds', 'variantId', 'updatedAt', 'updatedBy', 'deletedAt', 'ideaGroup',
  ],
  Member: ['tripId', 'deviceId', 'displayName', 'role', 'icon', 'updatedAt', 'updatedBy', 'deletedAt'],
  DayVariant: ['tripId', 'dayIndex', 'label', 'createdBy', 'active', 'updatedAt', 'updatedBy', 'deletedAt'],
};

/**
 * null に意味がある欄(「時刻未定」など)。**これ以外の null は欄が無いことにする**
 * (`note?: string` に null が入ると、`?? ''` は効くが `!== undefined` が崩れる)。
 */
const NULLABLE = new Set(['startMinutes', 'durationMinutes', 'travelMinutes', 'travelMode', 'variantId', 'sharedAt']);

/** 受け取った変更を入れるトランザクションの印。ここで書いたものは送り返さない */
const REMOTE = new WeakSet<Transaction>();

let accountReady = false;
let started = false;

/* ────────── 送る ────────── */

/** トランザクションごとの「変わった欄」。'all' は新しく作られた */
const pending = new WeakMap<Transaction, Map<string, { table: TableName; id: string; fields: Set<string> | 'all' }>>();

function topLevel(field: string): string {
  const dot = field.indexOf('.');
  return dot === -1 ? field : field.slice(0, dot);
}

function note(trans: Transaction, table: TableName, id: string, fields: string[] | 'all') {
  if (REMOTE.has(trans)) return;
  let buffer = pending.get(trans);
  if (!buffer) {
    const created = new Map<string, { table: TableName; id: string; fields: Set<string> | 'all' }>();
    buffer = created;
    pending.set(trans, buffer);
    // 書き込みが確定してから送る(取り消されたトランザクションは送らない)
    trans.on('complete', () => void flush([...created.values()]));
  }
  const key = `${table}:${id}`;
  const entry = buffer.get(key);
  if (fields === 'all' || entry?.fields === 'all') {
    buffer.set(key, { table, id, fields: 'all' });
  } else {
    const set = entry?.fields instanceof Set ? entry.fields : new Set<string>();
    for (const f of fields) set.add(topLevel(f));
    buffer.set(key, { table, id, fields: set });
  }
}

function installHooks() {
  for (const table of Object.keys(TYPE_OF) as TableName[]) {
    const t = db.table(table);
    t.hook('creating', function (_key, obj: Row, trans) {
      note(trans, table, obj.id, 'all');
    });
    t.hook('updating', function (mods: object, key, _obj, trans) {
      note(trans, table, String(key), Object.keys(mods));
    });
  }
}

function encode(value: unknown): string {
  return JSON.stringify(value === undefined ? null : value);
}

function recordOf(table: TableName, row: Row, at: CloudLocation, fields: Set<string> | 'all'): OutgoingRecord | null {
  const local = LOCAL_FIELDS[table];
  const keys = fields === 'all' ? Object.keys(row) : [...fields];
  const out: Record<string, string> = {};
  const known = SCHEMA[TYPE_OF[table]];
  for (const k of keys) {
    if (local.has(k)) continue;
    if (!known.includes(k)) console.error(`[cloud] ${TYPE_OF[table]}.${k} は SCHEMA に無い欄です(本番では送れません)`);
    out[k] = encode((row as Record<string, unknown>)[k]);
  }
  if (Object.keys(out).length === 0) return null;
  return { ...at, recordType: TYPE_OF[table], recordName: row.id, fields: out };
}

async function flush(changes: { table: TableName; id: string; fields: Set<string> | 'all' }[]) {
  // iCloud にまだつながっていなくても、すでに iCloud にある旅の変更はネイティブに預ける
  // (ネイティブが貯めておき、つながったら送る)。捨てると直した欄が二度と届かない
  if (changes.length === 0) return;
  const items: OutgoingRecord[] = [];
  const adopt = new Set<string>();
  for (const c of changes) {
    const row = (await db.table(c.table).get(c.id)) as Row | undefined;
    if (!row) continue;
    const tripId = c.table === 'trips' ? row.id : (row as TripEvent).tripId;
    const trip = c.table === 'trips' ? (row as Trip) : await db.trips.get(tripId);
    if (!trip) continue;
    if (trip.deletedAt !== 0) {
      // 旅を消した: 作成者はゾーンごと、参加者は共有から抜ける
      if (c.table === 'trips' && trip.cloud && (c.fields === 'all' || c.fields.has('deletedAt'))) {
        await CloudSync.deleteZone(trip.cloud);
      }
      continue;
    }
    if (!trip.cloud) {
      // まだ iCloud に無い旅。丸ごと上げる(この変更もそこに含まれる)。
      // サインインしていなければ、サインインしたときに refreshAccount が拾う
      if (accountReady) adopt.add(trip.id);
      continue;
    }
    const record = recordOf(c.table, row, trip.cloud, c.fields);
    if (record) items.push(record);
  }
  if (items.length > 0) await CloudSync.enqueue({ items });
  for (const tripId of adopt) await adoptTrip(tripId);
}

/**
 * 旅を自分の iCloud(private)に上げる。中身を全部送る。
 * 同期より前に作った旅・新しく作った旅・**共有が終わって写しになった旅**がここを通る。
 */
async function adoptTrip(tripId: string) {
  const location: CloudLocation = { scope: 'private', owner: '', zone: `trip-${tripId}` };
  const done = await db.transaction('rw', db.trips, async (tx) => {
    REMOTE.add(tx);
    const trip = await db.trips.get(tripId);
    if (!trip || trip.deletedAt !== 0 || trip.cloud) return null;
    await db.trips.update(tripId, { cloud: location });
    return { ...trip, cloud: location };
  });
  if (!done) return;

  const items: OutgoingRecord[] = [];
  const push = (table: TableName, row: Row) => {
    const r = recordOf(table, row, location, 'all');
    if (r) items.push(r);
  };
  push('trips', done);
  for (const e of await db.events.where('tripId').equals(tripId).toArray()) push('events', e);
  for (const m of await db.members.where('tripId').equals(tripId).toArray()) push('members', m);
  for (const v of await db.dayVariants.where('tripId').equals(tripId).toArray()) push('dayVariants', v);
  await CloudSync.enqueue({ items });
}

/* ────────── 受け取る ────────── */

function decode(fields: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(fields)) {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      continue;
    }
    // null の欄は「無い」にする(update に undefined を渡すと欄が消える)
    out[k] = value === null && !NULLABLE.has(k) ? undefined : value;
  }
  return out;
}

const sameLocation = (a: CloudLocation | undefined, b: CloudLocation) =>
  !!a && a.scope === b.scope && a.owner === b.owner && a.zone === b.zone;

let pulling: Promise<void> = Promise.resolve();

/** 受け取ったぶんを Dexie に入れる。同時に2本走らないよう直列にする */
export function pull(): Promise<void> {
  pulling = pulling.then(pullOnce, pullOnce);
  return pulling;
}

async function pullOnce() {
  const { items } = await CloudSync.pull();
  if (items.length === 0) return;
  const endedShares: string[] = [];

  await db.transaction('rw', db.trips, db.events, db.members, db.dayVariants, async (tx) => {
    REMOTE.add(tx);
    for (const item of items) {
      if (item.kind === 'zoneDeleted') {
        const trip = (await db.trips.toArray()).find((t) => sameLocation(t.cloud, item));
        if (!trip) continue;
        if (item.scope === 'shared') {
          // 作成者が共有をやめた・消した。写しとして残し、自分の旅として上げ直す
          await db.trips.update(trip.id, { cloud: undefined, sharedEndedAt: Date.now() });
          endedShares.push(trip.id);
        } else {
          // 自分の別の端末で消した
          await softDeleteTrip(trip.id);
        }
        continue;
      }
      if (!item.recordType || !item.recordName || !item.fields) continue;
      await applyRecord(item.recordType, item.recordName, decode(item.fields), item);
    }
  });

  await CloudSync.ack({ upTo: items[items.length - 1].seq });
  for (const tripId of endedShares) await adoptTrip(tripId);
}

async function applyRecord(type: RecordType, id: string, fields: Record<string, unknown>, at: CloudLocation) {
  const table = TABLE_OF[type];
  if (!table) return;
  const existing = (await db.table(table).get(id)) as Row | undefined;

  if (table === 'trips') {
    const location: CloudLocation = { scope: at.scope, owner: at.owner, zone: at.zone };
    if (existing) {
      await db.trips.update(id, { ...fields, cloud: location });
      return;
    }
    const trips = await db.trips.where('deletedAt').equals(0).toArray();
    const last = trips.map((t) => t.order).sort().pop() ?? null;
    await db.trips.add({
      title: '',
      startDate: '1970-01-01',
      endDate: '1970-01-01',
      updatedAt: 0,
      updatedBy: '',
      ...(fields as Partial<Trip>),
      id,
      order: orderKeyBetween(last, null),
      sharedAt: null,
      imported: at.scope === 'shared',
      deletedAt: 0,
      cloud: location,
    } as Trip);
    return;
  }

  if (existing) {
    await db.table(table).update(id, fields);
  } else {
    await db.table(table).add({ deletedAt: 0, ...fields, id });
  }
}

async function softDeleteTrip(tripId: string) {
  const now = Date.now();
  const tombstone = { deletedAt: now, updatedAt: now };
  await db.trips.update(tripId, tombstone);
  for (const table of ['events', 'members'] as const) {
    const ids = await db.table(table).where('tripId').equals(tripId).primaryKeys();
    await db.table(table).bulkUpdate(ids.map((key) => ({ key, changes: tombstone })));
  }
}

/* ────────── 共有 ────────── */

/**
 * 旅の共有画面(iOS 標準)を出す。共有できるのは**自分の旅だけ**
 * (受け取った旅の招待は作成者が出す)。
 */
export async function shareTrip(trip: Trip, message: string): Promise<'presented' | 'unavailable' | 'notOwner'> {
  if (!cloudAvailable() || !accountReady) return 'unavailable';
  if (!trip.cloud) await adoptTrip(trip.id);
  const fresh = await db.trips.get(trip.id);
  if (!fresh?.cloud) return 'unavailable';
  if (fresh.cloud.scope !== 'private') return 'notOwner';
  await CloudSync.share({ zone: fresh.cloud.zone, title: fresh.title, message });
  return 'presented';
}

/** 共有の管理画面(参加者・共有オプション・停止)。まだ共有していなければ 'noShare' */
export async function manageTripShare(trip: Trip): Promise<'presented' | 'noShare' | 'unavailable'> {
  if (!cloudAvailable() || !accountReady || trip.cloud?.scope !== 'private') return 'unavailable';
  try {
    await CloudSync.manageShare({ zone: trip.cloud.zone, title: trip.title });
    return 'presented';
  } catch (err) {
    if ((err as { code?: string }).code === 'noShare') return 'noShare';
    throw err;
  }
}

/** 文の中から iCloud の招待リンクを1本取り出す。無ければ null */
export function findShareLink(text: string): string | null {
  const m = /https:\/\/www\.icloud\.com\/share\/[^\s<>"「」『』【】()（）、。]+/i.exec(text);
  return m ? m[0] : null;
}

export type JoinResult =
  | { kind: 'joined'; tripId: string | null }
  | { kind: 'mine'; tripId: string | null }
  | { kind: 'unavailable' };

/**
 * 招待リンクから参加する。参加した旅が届いていれば、その id を返す
 * (届くのが遅れたら null。旅一覧には少しあとで出る)。
 */
export async function joinByLink(url: string): Promise<JoinResult> {
  if (!cloudAvailable()) return { kind: 'unavailable' };
  await refreshAccount();
  if (!accountReady) return { kind: 'unavailable' };
  const r = await CloudSync.acceptLink({ url });
  await pull();
  const at: CloudLocation = { scope: r.isOwner ? 'private' : 'shared', owner: r.owner, zone: r.zone };
  const trip = (await db.trips.toArray()).find((t) => t.deletedAt === 0 && sameLocation(t.cloud, at));
  return { kind: r.isOwner ? 'mine' : 'joined', tripId: trip?.id ?? null };
}

/* ────────── 起動 ────────── */

let resetHandled = false;

async function refreshAccount() {
  const { account, reset } = await CloudSync.status();
  if (reset && !resetHandled) {
    /*
     * 開発用ビルドと TestFlight を入れ替えた。前の環境のゾーンはこちらに無いので、
     * 旅を全部「まだ iCloud に無い」に戻して上げ直す。受け取った旅も自分の旅として残す
     * (前の環境の共有には、こちらからは参加できない)。
     */
    resetHandled = true;
    await db.transaction('rw', db.trips, async (tx) => {
      REMOTE.add(tx);
      const trips = await db.trips.toArray();
      for (const trip of trips) if (trip.cloud) await db.trips.update(trip.id, { cloud: undefined });
    });
    accountReady = false;
  }
  const was = accountReady;
  accountReady = account === 'available';
  if (accountReady && !was) {
    // iCloud に無い旅を上げる(はじめて同期する・サインインし直した)
    const trips = await db.trips.where('deletedAt').equals(0).toArray();
    for (const trip of trips) if (!trip.cloud) await adoptTrip(trip.id);
  }
}

/** 前面にいるあいだの取りこぼしを防ぐ。プッシュが来なくても戻ったときに必ず取る */
async function catchUp() {
  await refreshAccount();
  if (!accountReady) return;
  await CloudSync.syncNow();
  await pull();
}

export function isCloudReady(): boolean {
  return accountReady;
}

/**
 * 同期を始める。**アプリの起動時に1回。** Dexie の hook はここで付くので、
 * これより前の書き込みは送られない(その旅は `adoptTrip` が丸ごと拾う)。
 */
export async function startCloudSync(): Promise<void> {
  if (started || !cloudAvailable()) return;
  started = true;
  installHooks();
  await CloudSync.addListener('changes', () => void pull());
  await CloudSync.addListener('account', () => void refreshAccount());
  void CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void catchUp();
  });
  await refreshAccount();
  await pull();
  void CloudSync.syncNow().then(pull);
  void seedSchemaOnce();
}

/** デバッグビルド(開発環境)で、欄の一覧が変わったときだけ全部の欄を作る */
async function seedSchemaOnce() {
  if (!accountReady) return;
  const { environment } = await CloudSync.status();
  if (environment !== 'development') return;
  const signature = JSON.stringify(SCHEMA);
  if ((await getSetting('cloud.schemaSeeded')) === signature) return;
  try {
    await CloudSync.seedSchema({ types: SCHEMA });
    await setSetting('cloud.schemaSeeded', signature);
  } catch (err) {
    console.error('[cloud] seedSchema failed', err);
  }
}
