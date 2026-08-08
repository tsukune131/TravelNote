import type { CategoryId } from '../lib/category';
import type { LinkLabelId } from '../lib/maps';
import type { PlainDate } from '../lib/plainDate';

/**
 * すべてのレコードが持つ同期用の欄。**あとから足すと全レコードの移行が要る**ので
 * 同期基盤(ROADMAP B-4)が未決定のうちから持たせておく。
 *
 * - `updatedAt` / `updatedBy`: 項目単位の last-write-wins に使う
 * - `deletedAt`: 物理削除しない。消したことも同期しないと、
 *   オフラインの相手の端末で復活してしまう。**0 が「生きている」**
 *   (IndexedDB は null を索引できないので null ではなく 0 を使う)
 */
export type SyncFields = {
  updatedAt: number;
  updatedBy: string;
  deletedAt: number;
};

export type EventLink = {
  url: string;
  /** 自動判定した種別。ユーザーが上書きしたら customLabel が入る */
  label: LinkLabelId;
  customLabel?: string;
};

export type Booking = {
  booked: boolean;
  partySize?: number;
  reference?: string;
};

export type Trip = SyncFields & {
  id: string;
  title: string;
  startDate: PlainDate;
  endDate: PlainDate;
  /** 旅一覧での並び順(fractional index) */
  order: string;
  /**
   * 共有している旅だけが持つ。**未共有の旅は端末外に出さない**
   * (プライバシーポリシーの「共有していない旅は送信しない」の実装上の根拠)
   */
  shareId?: string;
};

/**
 * 予定。
 *
 * `dayIndex` で持つ理由(日付で持たない):
 * 旅の開始日を1日ずらしたときに、予定が全部ついてくる。日程変更は旅行計画で頻繁に起きる。
 * 実際の日付は `dateOfDay(trip.startDate, dayIndex)` で導出する。
 *
 * `startMinutes` を分で持つ理由:
 * リフロー(ここから30分後ろへ)がただの足し算になり、時差も夏時間も関係なくなる。
 * **null は「時刻未定」**で、これを許すことが tabiori に対する差別化のひとつ。
 */
export type TripEvent = SyncFields & {
  id: string;
  tripId: string;
  dayIndex: number;
  /** 0:00 からの分。null = 時刻未定(リストの末尾にまとめる) */
  startMinutes: number | null;
  durationMinutes: number | null;
  category: CategoryId;
  /** ユーザーが手で選んだか。true なら名前を変えても推定し直さない */
  categoryLocked: boolean;
  name: string;
  note?: string;
  lat?: number;
  lng?: number;
  address?: string;
  links: EventLink[];
  booking?: Booking;
  /** リフローの対象外にする(宿のチェックイン時刻など) */
  pinned: boolean;
  done: boolean;
  costYen?: number;
  /** 同じ (tripId, dayIndex) の中での並び順(fractional index) */
  order: string;
};

export type MemberRole = 'owner' | 'editor' | 'viewer';

/**
 * 共有の参加者。**アカウントではない**(App Store 5.1.1(v) を回避するため)。
 * 端末ごとに発行した匿名IDと、参加時に一度聞く表示名だけを持つ。
 */
export type Member = SyncFields & {
  id: string;
  tripId: string;
  deviceId: string;
  displayName: string;
  role: MemberRole;
};

/** 端末固有の設定。同期しない */
export type Setting = {
  key: string;
  value: string;
};
