import { db, getDeviceId, newId } from '../db/db';
import { compareOrder, orderKeyBetween } from '../lib/fractionalIndex';
import { planMerge } from './merge';
import type { MergeSummary } from './merge';
import { buildSnapshot, loadBaseline, parseSnapshot, saveBaseline } from './snapshot';
import type { Snapshot } from './snapshot';

/**
 * 受け取ったファイルを取り込む。merge.ts の判定結果を DB に書くだけの層。
 * 判定そのものは純粋関数にしてあるので、ここを通さずに検証できる。
 */

const ALIVE = 0;

/** 手元の旅一覧のいちばん後ろの並び順。受け取った旅はその後ろに置く */
async function lastTripOrder(): Promise<string | null> {
  const rows = await db.trips.where('deletedAt').equals(ALIVE).toArray();
  if (rows.length === 0) return null;
  return rows.sort(compareOrder)[rows.length - 1].order;
}
export async function importSnapshotText(
  text: string,
  myLabel: string,
): Promise<{ tripId: string; summary: MergeSummary; conflictedDays: number[] }> {
  const incoming = parseSnapshot(text);
  return importSnapshot(incoming, myLabel);
}

export async function importSnapshot(
  incoming: Snapshot,
  myLabel: string,
): Promise<{ tripId: string; summary: MergeSummary; conflictedDays: number[] }> {
  const tripId = incoming.trip.id;
  const deviceId = await getDeviceId();
  const existing = await db.trips.get(tripId);

  /*
   * 手元で消した旅を、もう一度受け取った。
   *
   * **取り込みは「これを手元に持つ」という明示の意思表示**なので、
   * 手元の墓標より優先して丸ごと入れ直す。
   *
   * つき合わせに回すと直らない: 削除は全レコードの updatedAt を進めるので
   * 「自分だけが動いた」と判定され、墓標が勝つ。しかも旅の画面は
   * deletedAt を見ずに開けるため、**取り込めたように見えて一覧にだけ出ない**
   * (実際に踏んだ)。
   */
  const deletedHere = existing !== undefined && existing.deletedAt !== ALIVE;

  // 知らない旅・消した旅なら、まるごと受け入れるだけ。つき合わせる相手がいない
  if (!existing || deletedHere) {
    const received: Snapshot['trip'] = {
      ...incoming.trip,
      // 受け取った旅は imported。送り返しは無料でできる(docs/pricing.md §3)
      imported: true,
      sharedAt: incoming.trip.sharedAt ?? incoming.exportedAt,
      // **受け取ったものは生きている。**送り主側の墓標も、手元の墓標も持ち越さない
      deletedAt: ALIVE,
      /*
       * 並び順は**受け取った側で振り直す。**
       * order は端末ごとに採番する fractional index なので、送り主の "V" と
       * こちらの1つ目の "V" が普通にぶつかる。ぶつかると一覧の並びが定まらない。
       */
      order: orderKeyBetween(await lastTripOrder(), null),
    };
    await db.transaction('rw', db.trips, db.events, db.members, db.dayVariants, async () => {
      await db.trips.put(received);
      await db.events.bulkPut(incoming.events);
      await db.members.bulkPut(incoming.members);
      await db.dayVariants.bulkPut(incoming.variants);
    });
    await saveBaseline(tripId, incoming);
    return {
      tripId,
      summary: {
        added: incoming.events.length,
        updated: 0,
        removed: 0,
        conflicted: 0,
        changes: [],
      },
      conflictedDays: [],
    };
  }

  const [events, members, variants, baseline] = await Promise.all([
    db.events.where('tripId').equals(tripId).toArray(),
    db.members.where('tripId').equals(tripId).toArray(),
    db.dayVariants.where('tripId').equals(tripId).toArray(),
    loadBaseline(tripId),
  ]);

  const plan = planMerge({
    local: { trip: existing, events, members, variants },
    incoming,
    baseline,
    now: Date.now(),
    deviceId,
    newId,
    myLabel,
  });

  await db.transaction('rw', db.trips, db.events, db.members, db.dayVariants, async () => {
    if (plan.trip) await db.trips.put(plan.trip);
    if (plan.upsertEvents.length > 0) await db.events.bulkPut(plan.upsertEvents);
    if (plan.upsertMembers.length > 0) await db.members.bulkPut(plan.upsertMembers);
    if (plan.upsertVariants.length > 0) await db.dayVariants.bulkPut(plan.upsertVariants);
    if (plan.updateEvents.length > 0) {
      await db.events.bulkUpdate(plan.updateEvents.map((u) => ({ key: u.id, changes: u.changes })));
    }
  });

  // 取り込んだ時点の「相手の中身」を共通祖先として覚える
  await saveBaseline(tripId, incoming);

  return { tripId, summary: plan.summary, conflictedDays: plan.conflictedDays };
}

/**
 * 書き出す。**書き出した時点の中身も共通祖先として覚える** —
 * 「これを相手に渡した」という宣言であり、次に受け取ったときの比較基準になる。
 *
 * あわせて `sharedAt` を立てる。一度共有した旅は、
 * **Pro が切れても送り続けられる**(docs/pricing.md §5)。
 *
 * ⚠️ Pro の判定は呼び出し側で行うこと(`canShare`)。
 * ここは「送れると決まったあと」の処理。
 */
export async function exportSnapshotText(
  tripId: string,
  myName: string,
): Promise<{ text: string; snapshot: Snapshot }> {
  const deviceId = await getDeviceId();
  const trip = await db.trips.get(tripId);
  if (trip && trip.sharedAt === null) {
    await db.trips.update(tripId, { sharedAt: Date.now() });
  }
  const snapshot = await buildSnapshot(tripId, deviceId, myName);
  await saveBaseline(tripId, snapshot);
  return { text: JSON.stringify(snapshot), snapshot };
}
