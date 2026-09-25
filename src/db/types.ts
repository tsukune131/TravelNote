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

/**
 * 持ち物。旅ひとつに対して1本の一覧を持つ。
 *
 * 予定と違って日付にも並び順にも縛られないので、独立したテーブルにはしない
 * (旅に付いてくるほうが、共有のときも丸ごと運べて扱いが揃う)。
 */
export type PackItem = {
  id: string;
  text: string;
  checked: boolean;
};

export type TripPlace = {
  name: string;
  lat: number;
  lng: number;
  /** IANA のタイムゾーン名(`Asia/Tokyo`)。引けなかったときは無い */
  timeZone?: string;
};

/** 「Day N(0 始まり)から、天気の場所はここ」。次の切り替えまで続く(weather/places.ts) */
export type TripPlaceChange = {
  fromDay: number;
  place: TripPlace;
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
   * 旧方針(共有に課金していた頃)の「Pro なしで送れる期限」。
   * **2026-09-24 に共有を無料にしたので、もう読まない。** 古い記録に残っているだけ。
   */
  shareWindowUntil?: number;

  /**
   * 旅を作った端末。**Pro の機能を旅の全員に効かせる**ために、
   * 誰の契約を見るかをここで決める(`src/pro/entitlement.ts`)。
   * この項目より前に作った旅には無い(受け取った旅でなければ自分が作者とみなす)。
   */
  ownerDeviceId?: string;

  /**
   * **作成者が Pro か。** 作成者の端末だけが書き、共有で参加者に届く。
   * true なら、参加者も天気とタスク割り振りを使える。
   */
  ownerPro?: boolean;

  /**
   * 旅先。**天気予報を出すためだけ**に持つ(1か所)。
   * 座標とタイムゾーンは端末の地名検索(Apple)で引く。予報の日付を
   * 旅先の暦で合わせるのにタイムゾーンが要る。
   */
  place?: TripPlace;

  /**
   * 旅の途中で天気の場所が変わる日。`place` が Day 1 からで、
   * ここに「Day N から◯◯」を並べる。次に切り替える日まで続く。
   * 解釈は `src/weather/places.ts` だけに置く。
   */
  placeChanges?: TripPlaceChange[];

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

  /**
   * 持ち物リスト(準備画面)。
   *
   * ⚠️ **共有では細かくマージしない。** 旅そのものは案に分けない決まりなので、
   * 両方が同じ旅を直したときは手元が残る(src/share/merge.ts)。
   * つまり**二人が同時にチェックを付けると、片方のチェックは届かない。**
   * 予定と同じ粒度でマージするには records に分ける必要があり、
   * 持ち物のために構造を増やす価値はないと判断した。
   */
  packing?: PackItem[];

  /** 旅全体のメモ(集合場所・連絡先など)。予定に紐づかないもの */
  note?: string;
};

/**
 * 「メモ & ToDo」タブの予定が持つ dayIndex。**日を決めていないアイデアの置き場。**
 *
 * 別のテーブルにしないのは、Day へドラッグで振り分けたときに
 * **dayIndex を書き換えるだけで済む**から(名前・リンク・メモがそのまま付いていく)。
 * 共有のマージも Day 単位の仕組みがそのまま効く(ぶつかればこのタブにも案が立つ)。
 *
 * ⚠️ これより前の版のアプリは -1 の Day を描かない。その版でしおりを受け取ると、
 * メモの予定は見えないまま持ち運ばれる(消えはしない)。
 */
export const IDEAS_DAY = -1;

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
  /** 0 始まりの Day。**`IDEAS_DAY`(-1)はまだ日を決めていない「メモ」タブ** */
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
   * 担当するメンバー(`Member.id`)。**メモタブのタスク割り振り**(Pro)。
   * 「Aさん: 食事 / Bさん: 観光」。古い記録には無いので `?? []` で読む。
   * ⚠️ Pro が切れても消さない・隠さない(データをロックしない)。
   */
  assigneeIds?: string[];
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
 * メンバーのアイコン。**写真は小さく縮めて旅と一緒に運ぶ**(128px の JPEG。数KB)。
 * プリセットは絵文字と色の組(`src/lib/avatar.ts`)。
 */
export type MemberIcon = { kind: 'preset'; id: string } | { kind: 'photo'; dataUrl: string };

/**
 * 旅のメンバー。**アカウントではない**(App Store 5.1.1(v) を回避するため)。
 *
 * - 共有の参加者: 端末ごとの匿名IDと、表示名だけを持つ
 * - **手で足した人**(スマホを持たない子ども・祖父母など): `deviceId` が空文字。
 *   タスクを割り振るために名前とアイコンだけ持つ
 */
export type Member = SyncFields & {
  id: string;
  tripId: string;
  /** 手で足した人は空文字(索引できるよう null にしない) */
  deviceId: string;
  displayName: string;
  role: MemberRole;
  icon?: MemberIcon;
};

/**
 * 共有シートから受け取った、まだどの旅にも入れていないもの。
 *
 * **旅に属さない。端末に属する。** 共有した時点では旅が1つも無いこともある
 * (「来年ここ行きたい」で店を放り込む使い方は普通にある)。
 * だから旅を作ったあとに配置する形になる。
 *
 * **しおりのファイルには乗せない。** まだ誰のものでもない下書きなので。
 */
export type InboxItem = {
  id: string;
  url: string;
  /** 共有元のページ題名。Safari が渡してこないこともあるので空を許す */
  title: string;
  createdAt: number;
};

/** 端末固有の設定。同期しない */
export type Setting = {
  key: string;
  value: string;
};
