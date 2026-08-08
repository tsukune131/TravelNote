import { db, getDeviceId, newId } from '../db/db';
import { planMerge } from './merge';
import type { MergeSummary } from './merge';
import { buildSnapshot, loadBaseline, parseSnapshot, saveBaseline } from './snapshot';
import type { Snapshot } from './snapshot';

/**
 * 受け取ったファイルを取り込む。merge.ts の判定結果を DB に書くだけの層。
 * 判定そのものは純粋関数にしてあるので、ここを通さずに検証できる。
 */
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

  // 知らない旅なら、まるごと受け入れるだけ。つき合わせる相手がいない
  if (!existing) {
    await db.transaction('rw', db.trips, db.events, db.members, db.dayVariants, async () => {
      await db.trips.put(incoming.trip);
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
 */
export async function exportSnapshotText(
  tripId: string,
  myName: string,
): Promise<{ text: string; snapshot: Snapshot }> {
  const deviceId = await getDeviceId();
  const snapshot = await buildSnapshot(tripId, deviceId, myName);
  await saveBaseline(tripId, snapshot);
  return { text: JSON.stringify(snapshot), snapshot };
}
