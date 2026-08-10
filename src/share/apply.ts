import { db, getDeviceId, newId } from '../db/db';
import { compareOrder, orderKeyBetween } from '../lib/fractionalIndex';
import { planMerge } from './merge';
import type { MergeSummary } from './merge';
import { buildSnapshot, loadBaseline, parseSnapshot, saveBaseline } from './snapshot';
import type { Snapshot } from './snapshot';
import { markShared } from '../pro/entitlement';

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
      /*
       * **無料期間の起点は「受け取った今」。** ファイルに乗ってきた値は使わない。
       * 送り主の初回共有日を引き継ぐと、1年以上前に共有された旅を受け取った人が
       * **最初から送り返せない** ── 往復が切れる(監査で見つかった)。
       */
      shareWindowFrom: Date.now(),
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

  /*
   * **共有まわりの3項目は、相手の値で上書きさせない。**
   * merge は「相手だけが動いた」とき旅レコードを丸ごと差し替える(merge.ts)。
   * これらは端末ごとの事実なので、持ち越すのは間違い:
   *   imported        … 受け取った側かどうか
   *   sharedAt        … 表示(「◯月◯日に送りました」)
   *   shareWindowFrom … 無料期間の起点。**未設定なら今から**
   *                     (受け取ったこと自体が「送れるようになった」ということ)
   * 一度立っていれば動かさない ── 動かすと A↔B の往復だけで無期限になる。
   */
  await db.trips.update(tripId, {
    imported: existing.imported,
    sharedAt: existing.sharedAt,
    shareWindowFrom: existing.shareWindowFrom ?? Date.now(),
  });

  // 取り込んだ時点の「相手の中身」を共通祖先として覚える
  await saveBaseline(tripId, incoming);

  return { tripId, summary: plan.summary, conflictedDays: plan.conflictedDays };
}

/**
 * 書き出す。**副作用は持たない** ── 中身を組み立てて文字列にするだけ。
 *
 * ⚠️ **かつてはここで `sharedAt` と共通祖先を書き込んでいた。**
 * ところが呼び出し側は、このあと共有シートを出して**閉じられることがある**。
 * その結果、一度も送っていないのに1年の時計が動き、
 * 「未送信の変更」バッジまで消えていた(監査で見つかった)。
 * **本当に送れたあと**に `commitShared()` を呼ぶこと。
 *
 * ⚠️ Pro の判定は呼び出し側で行うこと(`canShare`)。
 */
export async function exportSnapshotText(
  tripId: string,
  myName: string,
): Promise<{ text: string; snapshot: Snapshot }> {
  const deviceId = await getDeviceId();
  const snapshot = await buildSnapshot(tripId, deviceId, myName);
  return { text: JSON.stringify(snapshot), snapshot };
}

/**
 * **送れたと確定したあと**に呼ぶ。
 *
 * - 渡した中身を共通祖先として覚える(次に受け取ったときの比較基準)
 * - 共有を始めた印を立てる(`markShared`。判定はそこにだけ置く)
 */
export async function commitShared(tripId: string, snapshot: Snapshot): Promise<void> {
  await saveBaseline(tripId, snapshot);
  const trip = await db.trips.get(tripId);
  if (!trip) return;
  const patch = markShared(trip, Date.now());
  if (patch) await db.trips.update(tripId, patch);
}
