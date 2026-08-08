import { db } from '../db/db';
import type { DayVariant, Member, Trip, TripEvent } from '../db/types';

/**
 * 旅ひとつぶんの中身をまるごと1ファイルにしたもの。
 *
 * **サーバーを持たない共有の実体。** これを共有シートで送り合い、
 * 受け取った側が merge.ts で自分の手元とつき合わせる。
 * 開発者のサーバーを一切経由しないので、プライバシーラベルは
 * 「データを収集していません」のままでいられる。
 */
export const SNAPSHOT_FORMAT = 'tabinoshiori.trip';
export const SNAPSHOT_VERSION = 1;

export type Snapshot = {
  format: typeof SNAPSHOT_FORMAT;
  /** 読み込み側が古い形式を拒否できるように必ず見る */
  version: number;
  exportedAt: number;
  exportedBy: string;
  exportedByName: string;
  trip: Trip;
  events: TripEvent[];
  members: Member[];
  variants: DayVariant[];
};

/** 論理削除したものも入れる。消したことが伝わらないと相手の端末で復活する */
export async function buildSnapshot(
  tripId: string,
  exportedBy: string,
  exportedByName: string,
): Promise<Snapshot> {
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error(`旅が見つかりません: ${tripId}`);

  const [events, members, variants] = await Promise.all([
    db.events.where('tripId').equals(tripId).toArray(),
    db.members.where('tripId').equals(tripId).toArray(),
    db.dayVariants.where('tripId').equals(tripId).toArray(),
  ]);

  return {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    exportedAt: Date.now(),
    exportedBy,
    exportedByName,
    trip,
    events,
    members,
    variants,
  };
}

export function serializeSnapshot(snapshot: Snapshot): string {
  return JSON.stringify(snapshot);
}

export class SnapshotParseError extends Error {}

export function parseSnapshot(text: string): Snapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SnapshotParseError('しおりのファイルとして読めませんでした');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new SnapshotParseError('しおりのファイルとして読めませんでした');
  }
  const s = parsed as Partial<Snapshot>;

  if (s.format !== SNAPSHOT_FORMAT) {
    throw new SnapshotParseError('たびのしおりのファイルではないようです');
  }
  if (typeof s.version !== 'number' || s.version > SNAPSHOT_VERSION) {
    throw new SnapshotParseError('新しいバージョンで作られたファイルです。アプリを更新してください');
  }
  if (!s.trip || !Array.isArray(s.events)) {
    throw new SnapshotParseError('ファイルの中身が壊れています');
  }

  return {
    format: SNAPSHOT_FORMAT,
    version: s.version,
    exportedAt: s.exportedAt ?? 0,
    exportedBy: s.exportedBy ?? '',
    exportedByName: s.exportedByName ?? '',
    trip: s.trip,
    events: s.events,
    members: s.members ?? [],
    variants: s.variants ?? [],
  };
}

/* ────────── baseline(3方向マージの共通祖先) ────────── */

/**
 * 「最後に相手とやり取りした時点の中身」。
 * 書き出したとき・取り込んだときの両方で更新する。
 *
 * これが無いと「自分が直した」と「相手が直した」を区別できず、
 * ただの新しい変更まで衝突として扱ってしまう。
 */
export async function saveBaseline(tripId: string, snapshot: Snapshot): Promise<void> {
  await db.baselines.put({
    tripId,
    json: serializeSnapshot(snapshot),
    savedAt: Date.now(),
  });
}

export async function loadBaseline(tripId: string): Promise<Snapshot | null> {
  const row = await db.baselines.get(tripId);
  if (!row) return null;
  try {
    return parseSnapshot(row.json);
  } catch {
    // 壊れていたら「共通祖先なし」として扱う(全部を新しい変更とみなす)
    return null;
  }
}

/** 書き出し用のファイル名。相手のファイル一覧で見分けがつくように日付を入れる */
export function snapshotFileName(trip: Trip): string {
  const safeTitle = trip.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40) || 'trip';
  return `${safeTitle}_${trip.startDate}.tabishiori`;
}

export const SNAPSHOT_MIME = 'application/json';

/** その旅が「変更されたのに、まだ送っていない」か。ヘッダのバッジに使う */
export async function countUnsentChanges(tripId: string): Promise<number> {
  const baseline = await loadBaseline(tripId);
  const events = await db.events.where('tripId').equals(tripId).toArray();
  if (!baseline) return events.length;

  const base = new Map(baseline.events.map((e) => [e.id, e.updatedAt]));
  return events.filter((e) => (base.get(e.id) ?? -1) < e.updatedAt).length;
}
