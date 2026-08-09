import type { DayVariant, MeetupEntry, Member, Trip, TripEvent } from '../db/types';
import type { Snapshot } from './snapshot';

/**
 * 受け取ったしおりを、手元のしおりとつき合わせる。
 *
 * ## 考え方
 *
 * サーバーが無いので、正解は「どちらが新しいか」ではなく
 * **「最後にやり取りした時点(baseline)から、どちら側が動いたか」**で決まる。
 *
 *   自分だけ動いた   → 自分のまま
 *   相手だけ動いた   → 相手を取り込む
 *   両方動いた       → **その日を「案」に分けて両方残す**
 *   どちらも動かない → そのまま
 *
 * 「両方動いた」ときに片方を捨てないのが本アプリの選択。
 * ただし**衝突していないものまで分岐させない**。
 * 「自分が Day1 に足して、相手が Day3 に足した」は衝突ではないので黙って合流させる。
 *
 * 案の粒度が Day なのは、人が見比べるのが「フィールド」ではなく
 * 「その日の過ごし方」だから(docs/ux-design.md §6)。
 *
 * ## 限界(正直に)
 *
 * これは CRDT ではない。同じ日を3回以上すれ違いながら往復すると、
 * 古い側の変更が拾われないことがある。2人〜数人で送り合う前提の割り切り。
 */

export type MergeInput = {
  /** 手元の中身 */
  local: {
    trip: Trip;
    events: TripEvent[];
    members: Member[];
    variants: DayVariant[];
  };
  /** 受け取ったファイル */
  incoming: Snapshot;
  /** 最後にやり取りした時点。初回の取り込みなら null */
  baseline: Snapshot | null;
  /** 新しいレコードを作るための道具(テストできるよう外から渡す) */
  now: number;
  deviceId: string;
  newId: () => string;
  /** 自分の案につける名前 */
  myLabel: string;
};

export type MergePlan = {
  /** そのまま put するレコード */
  upsertEvents: TripEvent[];
  upsertMembers: Member[];
  upsertVariants: DayVariant[];
  /** 本線から案へ移すために書き換えるレコード */
  updateEvents: Array<{ id: string; changes: Partial<TripEvent> }>;
  trip: Trip | null;
  /** 案に分かれた日 */
  conflictedDays: number[];
  /** 取り込みの結果を人に見せるための要約 */
  summary: MergeSummary;
};

export type MergeSummary = {
  added: number;
  updated: number;
  removed: number;
  conflicted: number;
  /** 相手が変えたものの一覧(取り込み後に見せる) */
  changes: Array<{ kind: 'added' | 'updated' | 'removed'; dayIndex: number; name: string }>;
};

const ALIVE = 0;

function byId<T extends { id: string }>(rows: readonly T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.id, r]));
}

/** baseline より後に動いたか。baseline に無ければ「新しく生まれた」= 動いた */
function movedSince(record: { updatedAt: number } | undefined, base: { updatedAt: number } | undefined): boolean {
  if (!record) return false;
  if (!base) return true;
  return record.updatedAt > base.updatedAt;
}

export function planMerge(input: MergeInput): MergePlan {
  const { local, incoming, baseline, now, deviceId, newId, myLabel } = input;

  const localEvents = byId(local.events);
  const remoteEvents = byId(incoming.events);
  const baseEvents = byId(baseline?.events ?? []);

  const summary: MergeSummary = { added: 0, updated: 0, removed: 0, conflicted: 0, changes: [] };
  const upsertEvents: TripEvent[] = [];
  const conflictDays = new Set<number>();

  // ── 1周目: 予定を1件ずつ判定する ──
  for (const id of new Set([...localEvents.keys(), ...remoteEvents.keys()])) {
    const mine = localEvents.get(id);
    const theirs = remoteEvents.get(id);
    const base = baseEvents.get(id);

    const iMoved = movedSince(mine, base);
    const theyMoved = movedSince(theirs, base);

    if (theyMoved && iMoved) {
      /*
       * 集合の時間は**人ごとに混ぜてから**比べる。
       *
       * 3人で使えば全員が同じ日を触るので、ここを普通の変更として扱うと
       * 集合を使うたびに Day が案に分かれてしまう。人ごとの欄は
       * ぶつかりようがない(自分の行しか意味を持たない)ので、
       * union して衝突から外す。
       */
      if (mine && theirs && sameContent(mine, theirs)) {
        const meetup = mergeMeetup(mine, theirs, base);
        if (meetup !== null) {
          upsertEvents.push({ ...mine, meetup });
          summary.updated += 1;
          summary.changes.push({ kind: 'updated', dayIndex: mine.dayIndex, name: mine.name });
        }
        continue;
      }
      conflictDays.add(mine?.dayIndex ?? theirs!.dayIndex);
      continue;
    }

    if (theyMoved && theirs) {
      // 相手のを採るときも、自分が入れた集合の時間は落とさない
      const meetup = mine ? mergeMeetup(mine, theirs, base) : null;
      upsertEvents.push(meetup === null ? theirs : { ...theirs, meetup });
      const kind = theirs.deletedAt !== ALIVE ? 'removed' : mine ? 'updated' : 'added';
      summary[kind] += 1;
      summary.changes.push({ kind, dayIndex: theirs.dayIndex, name: theirs.name });
    }
    // 自分だけ動いた / どちらも動かない → 手元のまま。何もしない
  }

  // ── 2周目: 衝突した日を「案」に分ける ──
  const upsertVariants: DayVariant[] = [];
  const updateEvents: Array<{ id: string; changes: Partial<TripEvent> }> = [];
  const stamp = { updatedAt: now, updatedBy: deviceId, deletedAt: ALIVE };

  for (const dayIndex of conflictDays) {
    // すでに案に分かれている日は、これ以上増やさない(枝が増え続けると読めなくなる)
    const already = local.variants.filter((v) => v.dayIndex === dayIndex && v.deletedAt === ALIVE);
    if (already.length > 0) {
      summary.conflicted += 1;
      continue;
    }

    const mineVariant: DayVariant = {
      id: newId(),
      tripId: local.trip.id,
      dayIndex,
      label: myLabel,
      createdBy: deviceId,
      active: true,
      ...stamp,
    };
    const theirsVariant: DayVariant = {
      id: newId(),
      tripId: local.trip.id,
      dayIndex,
      label: incoming.exportedByName,
      createdBy: incoming.exportedBy,
      active: false,
      ...stamp,
    };
    upsertVariants.push(mineVariant, theirsVariant);

    // 手元のその日の予定を「自分の案」に移す
    for (const e of local.events) {
      if (e.dayIndex === dayIndex && e.deletedAt === ALIVE && e.variantId === null) {
        updateEvents.push({ id: e.id, changes: { variantId: mineVariant.id, ...stamp } });
      }
    }

    // 相手のその日の予定は、**新しい id で**入れる。
    // 同じ id のまま入れると手元のレコードを上書きしてしまい、比べる相手が消える
    for (const e of incoming.events) {
      if (e.dayIndex === dayIndex && e.deletedAt === ALIVE && e.variantId === null) {
        upsertEvents.push({ ...e, id: newId(), variantId: theirsVariant.id, ...stamp });
      }
    }

    summary.conflicted += 1;
  }

  // ── 旅そのもの(表題・日程)は案に分けず、動いたほうを採る ──
  const tripMovedRemote = movedSince(incoming.trip, baseline?.trip);
  const tripMovedLocal = movedSince(local.trip, baseline?.trip);
  const trip = tripMovedRemote && !tripMovedLocal ? incoming.trip : null;

  // ── 参加者は単純に新しいほうを採る(見比べる意味がない) ──
  const localMembers = byId(local.members);
  const baseMembers = byId(baseline?.members ?? []);
  const upsertMembers = incoming.members.filter((m) => {
    const base = baseMembers.get(m.id);
    const mine = localMembers.get(m.id);
    return movedSince(m, base) && (!mine || m.updatedAt > mine.updatedAt);
  });

  return {
    upsertEvents,
    upsertMembers,
    upsertVariants,
    updateEvents,
    trip,
    conflictedDays: [...conflictDays].sort((a, b) => a - b),
    summary,
  };
}

/**
 * 集合の時間を**人ごとに**混ぜる。
 *
 *   片方にしか無い人   → そのまま採る(union)
 *   両方にある人       → その人の欄の新しいほう
 *   両方から消えた人   → baseline にあって双方に無いなら、消えたまま
 *
 * これが「3人で使うと必ず案に分かれる」を防いでいる。
 * 変わらなければ null を返す(何も書かないで済ませるため)。
 */
function mergeMeetup(
  mine: TripEvent,
  theirs: TripEvent,
  base: TripEvent | undefined,
): MeetupEntry[] | null {
  const a = mine.meetup ?? [];
  const b = theirs.meetup ?? [];
  if (a.length === 0 && b.length === 0) return null;

  const merged = new Map<string, MeetupEntry>();
  for (const entry of a) merged.set(entry.memberId, entry);
  for (const entry of b) {
    const existing = merged.get(entry.memberId);
    if (!existing || entry.updatedAt > existing.updatedAt) merged.set(entry.memberId, entry);
  }

  // どちらかが「消した」人は消えたままにする(union だけだと消せなくなる)
  for (const entry of base?.meetup ?? []) {
    const inMine = a.some((m) => m.memberId === entry.memberId);
    const inTheirs = b.some((m) => m.memberId === entry.memberId);
    const kept = merged.get(entry.memberId);
    if ((!inMine || !inTheirs) && kept && kept.updatedAt <= entry.updatedAt) {
      merged.delete(entry.memberId);
    }
  }

  const next = [...merged.values()].sort((x, y) => x.memberId.localeCompare(y.memberId));
  const before = [...a].sort((x, y) => x.memberId.localeCompare(y.memberId));
  return JSON.stringify(next) === JSON.stringify(before) ? null : next;
}

/**
 * 見た目に関わる中身が同じか。updatedAt / updatedBy は比べない。
 * **meetup はここで比べない** ── 人ごとに混ぜるので、差があっても衝突にしない
 */
function sameContent(a: TripEvent, b: TripEvent): boolean {
  return (
    a.name === b.name &&
    a.dayIndex === b.dayIndex &&
    a.startMinutes === b.startMinutes &&
    a.durationMinutes === b.durationMinutes &&
    a.category === b.category &&
    a.note === b.note &&
    a.lat === b.lat &&
    a.lng === b.lng &&
    a.pinned === b.pinned &&
    a.done === b.done &&
    (a.isMeetup ?? false) === (b.isMeetup ?? false) &&
    a.order === b.order &&
    (a.deletedAt === ALIVE) === (b.deletedAt === ALIVE) &&
    JSON.stringify(a.links) === JSON.stringify(b.links) &&
    JSON.stringify(a.booking ?? null) === JSON.stringify(b.booking ?? null)
  );
}
