import type { CategoryId } from '../lib/category';
import type { LinkLabelId, TravelMode } from '../lib/maps';
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
   * この旅を**はじめて共有した時刻**。null なら一度も共有していない。
   *
   * 課金の判定に使う(docs/pricing.md §3):
   * 一度共有した旅は、**Pro が切れても送り続けられる**。
   * Pro が要るのは「まだ共有していない旅の共有を、新しく始めるとき」だけ。
   * 旅行中に期限が切れて同行者に更新を送れなくなる、という最悪を構造的に防ぐ。
   */
  sharedAt: number | null;

  /**
   * 受け取った旅か。**取り込みと送り返しは無料**なので、
   * 受け取った旅は Pro でなくても送り返せる。
   * これが無いと A→B→A の往復が切れ、共有が片道になる。
   */
  imported: boolean;

  /**
   * 旅そのものに付くリンク。**写真アルバムがこれの本命。**
   *
   * 旅の写真は LINE アルバムや Googleフォトにあって、しおりの中にはない。
   * 旅が終わったあとにしおりを開いても、いちばん見たいものへ行けなかった。
   * URL を1本持つだけなので、写真をこのアプリに取り込むわけではない
   * (端末の容量も、プライバシー申告も動かない)。
   *
   * 古い記録には無いので任意。読むときは `trip.links ?? []`。
   */
  links?: EventLink[];
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
  /**
   * **次の予定への移動**。旅程アプリの価値は「点」ではなく「点と点の間」にある。
   *
   * 座標が無いので距離からは出せない(場所検索APIを叩くとクエリが外部に出て
   * 「データを収集していません」が崩れる)。**手入力**で持つ。
   * 座標が入る日が来たら `estimateTravelMinutes` で初期値を出せるようにしてある。
   */
  travelMinutes: number | null;
  travelMode: TravelMode | null;

  /** リフローの対象外にする(宿のチェックイン時刻など) */
  pinned: boolean;
  done: boolean;
  costYen?: number;
  /** 同じ (tripId, dayIndex) の中での並び順(fractional index) */
  order: string;
  /**
   * 所属する案。**null が本線**(ふだんはこれしかない)。
   * 取り込みでその日が衝突したときだけ、両方の案が枝分かれして値が入る。
   */
  variantId: string | null;
};

/**
 * その日の「案」。
 *
 * 非同期共有(ファイルを送り合う方式)では、A と B が同じ日を別々に直してしまうことがある。
 * そのとき**どちらかを捨てずに両方残して見比べられるようにする**ための入れ物。
 *
 * 粒度が Day なのは、人が見比べるのが「フィールド」ではなく「その日の過ごし方」だから。
 * 衝突していない日には案を作らない(そこまで枝分かれさせると読めなくなる)。
 */
export type DayVariant = SyncFields & {
  id: string;
  tripId: string;
  dayIndex: number;
  /** 「わたしの案」「ともきの案」など。取り込み時に相手の表示名から作る */
  label: string;
  createdBy: string;
  /** 表示中・採用中の案。ひとつの (tripId, dayIndex) で必ず1件だけ true */
  active: boolean;
};

/**
 * 最後にやり取りした時点の中身(3方向マージの共通祖先)。
 *
 * これが無いと「相手が直した」と「自分が直した」を区別できず、
 * 衝突していないただの新しい変更まで衝突として扱ってしまう。
 * 旅ひとつぶんの JSON なので、そのまま持っても数KB。
 */
export type Baseline = {
  tripId: string;
  /** Snapshot をそのまま JSON 文字列にしたもの */
  json: string;
  savedAt: number;
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
