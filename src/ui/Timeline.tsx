import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useI18n } from '../i18n/context';
import { CATEGORIES } from '../lib/category';
import { nowLineIndex } from '../lib/ordering';
import { departureTime, nowMinutes } from '../lib/plainDate';
import { useLiveQuery } from 'dexie-react-hooks';
import { deleteEvent, listMembers, moveEvent, setEventTime, toggleDone } from '../db/repo';
import { Connector } from './Connector';
import { IconDrag, IconMap } from './Icon';
import { SeedChips } from './SeedChips';
import { SwipeRow } from './SwipeRow';
import type { MapProvider } from '../lib/maps';
import type { TripEvent } from '../db/types';

/**
 * その日のタイムライン。
 *
 * **並びは order がすべて。時刻で勝手に沈めない**(src/lib/ordering.ts)。
 * 「時刻未定」の区切りは廃止した ── 決めていない予定を下へ落とすのは、
 * 「時刻は決めなくていい」という設計と矛盾していた。
 *
 * 所要時間をレールの長さで表さないのは変わらず(1日の全体像が消えるため)。
 */
export function Timeline({
  tripId,
  events,
  dayIndex,
  isToday,
  isLastDay,
  mapProvider,
  onOpen,
  onOpenMap,
  onLongPress,
  onPickCategory,
}: {
  tripId: string;
  events: TripEvent[];
  dayIndex: number;
  isToday: boolean;
  isLastDay: boolean;
  mapProvider: MapProvider | null;
  onOpen: (event: TripEvent) => void;
  onOpenMap: (event: TripEvent) => void;
  onLongPress: (event: TripEvent) => void;
  onPickCategory: (event: TripEvent) => void;
}) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const drag = useDragReorder(events, listRef);

  if (events.length === 0) {
    return (
      <div className="empty">
        <b>{t('timeline.empty', { n: dayIndex + 1 })}</b>
        <p>{isLastDay ? t('timeline.emptyHintLast') : t('timeline.emptyHintFirst')}</p>
        <SeedChips
          tripId={tripId}
          dayIndex={dayIndex}
          isFirstDay={dayIndex === 0}
          isLastDay={isLastDay}
        />
      </div>
    );
  }

  const shown = drag.shown;
  const now = nowMinutes();
  const nowAt = isToday ? nowLineIndex(shown, now) : null;

  return (
    <div ref={listRef} className={drag.active ? 'dragging' : undefined}>
      {shown.map((event, i) => (
        <div
          key={event.id}
          data-row={event.id}
          className={`tl-row${drag.isHeld(event.id) ? ' held' : ''}`}
          style={drag.styleFor(i, event.id)}
        >
          {/* 掴んでいるあいだは現在時刻ラインを出さない。行と一緒に動いて嘘になる */}
          {nowAt === i && !drag.active && <NowLine now={now} />}
          <Row
            event={event}
            dragging={drag.isHeld(event.id)}
            onOpen={onOpen}
            onOpenMap={onOpenMap}
            onLongPress={onLongPress}
            onPickCategory={onPickCategory}
            onDragStart={(clientY) => drag.begin(i, clientY)}
            onDragMove={drag.move}
            onDragEnd={drag.end}
          />
          {shown[i + 1] && (
            <Connector prev={event} next={shown[i + 1]} mapProvider={mapProvider} />
          )}
        </div>
      ))}
      {nowAt === shown.length && !drag.active && <NowLine now={now} />}
    </div>
  );
}

/** 落ち着くまでの時間。掴んでいた行が落ちる先まで滑る長さ */
const SETTLE_MS = 190;

type Held = {
  id: string;
  /** 掴んだときの位置 */
  from: number;
  /** いま指を離したら入る位置 */
  to: number;
  /** 指の移動量。掴んだ行はこれだけ動く */
  dy: number;
  /** よけるほうの行がずれる量(掴んだ行の高さ) */
  shift: number;
  /** 掴んだ時点の各行の中心。指が動くたびに測り直さない(測り直すと自分の transform を拾う) */
  centers: number[];
  startY: number;
  /** 指を離したあと、落ちる先へ滑っている最中 */
  settling: boolean;
};

/**
 * 指についてくる並べ替え。
 *
 * 以前は掴んでも**何も動かず**、指を離してはじめて並びが変わっていた。
 * どこへ入るのか分からないので「移動がわかりにくい」になっていた。
 *
 * ここでやっていること:
 * - 掴んだ行は指と1:1で動く(transition なし。遅れると重く感じる)
 * - よける行は同じ量だけ滑ってすき間を空ける(transition あり)。
 *   落ちる先が**すき間そのもの**で分かるので、別の指示線は要らない
 * - 位置の計算は**掴んだ瞬間に測った中心**だけを使う。動いている最中に
 *   測り直すと、自分でかけた transform を読んでしまって暴れる
 * - 指を離したら、まず落ちる先まで滑らせて、それから保存する。
 *   先に保存すると再描画で行が入れ替わり、滑っている途中で瞬間移動する
 */
function useDragReorder(events: TripEvent[], listRef: React.RefObject<HTMLDivElement | null>) {
  const [held, setHeld] = useState<Held | null>(null);
  /** 保存が返ってくるまでのあいだ見せる並び。ここが無いと一瞬だけ元の並びに戻る */
  const [optimistic, setOptimistic] = useState<TripEvent[] | null>(null);
  const commit = useRef<(() => void) | null>(null);

  // 本物が届いたら先取りした並びは捨てる
  useEffect(() => setOptimistic(null), [events]);

  // 滑っている最中に画面を離れても、保存は取りこぼさない
  useEffect(() => () => commit.current?.(), []);

  const shown = optimistic ?? events;

  function begin(index: number, clientY: number) {
    const root = listRef.current;
    if (!root) return;
    const boxes = shown.map((e) =>
      root.querySelector(`[data-row="${e.id}"]`)?.getBoundingClientRect(),
    );
    if (boxes.some((b) => b === undefined)) return;
    const rects = boxes as DOMRect[];
    setHeld({
      id: shown[index].id,
      from: index,
      to: index,
      dy: 0,
      shift: rects[index].height,
      centers: rects.map((r) => r.top + r.height / 2),
      startY: clientY,
      settling: false,
    });
  }

  function move(clientY: number) {
    setHeld((d) => {
      if (!d || d.settling) return d;
      const dy = clientY - d.startY;
      const center = d.centers[d.from] + dy;
      // 自分より上に中心がある行の数 = そこへ入ったときの位置
      let to = 0;
      for (let i = 0; i < d.centers.length; i++) {
        if (i !== d.from && d.centers[i] < center) to++;
      }
      return { ...d, dy, to };
    });
  }

  function end() {
    const d = held;
    if (!d || d.settling) return;
    if (d.to === d.from) {
      setHeld(null);
      return;
    }

    const rest = shown.filter((e) => e.id !== d.id);
    const moved = shown[d.from];
    const before = rest[d.to - 1] ?? null;
    const after = rest[d.to] ?? null;

    // まず落ちる先まで滑らせる
    setHeld({ ...d, dy: d.centers[d.to] - d.centers[d.from], settling: true });

    commit.current = () => {
      commit.current = null;
      rest.splice(d.to, 0, moved);
      setOptimistic(rest);
      setHeld(null);
      void moveEvent(d.id, moved.dayIndex, before, after);
    };
    window.setTimeout(() => commit.current?.(), SETTLE_MS);
  }

  /** よける行がどれだけずれるか */
  function offsetOf(i: number): number {
    if (!held) return 0;
    if (i === held.from) return held.dy;
    if (held.to > held.from && i > held.from && i <= held.to) return -held.shift;
    if (held.to < held.from && i >= held.to && i < held.from) return held.shift;
    return 0;
  }

  function styleFor(i: number, id: string): CSSProperties | undefined {
    if (!held) return undefined;
    const isHeld = held.id === id;
    return {
      transform: `translateY(${offsetOf(i)}px)`,
      // 掴んだ行は指に遅れず、よける行だけ滑らせる
      transition:
        isHeld && !held.settling
          ? 'none'
          : `transform ${isHeld ? SETTLE_MS : 180}ms cubic-bezier(.2,.8,.3,1)`,
    };
  }

  return {
    shown,
    active: held !== null,
    isHeld: (id: string) => held?.id === id && !held.settling,
    begin,
    move,
    end,
    styleFor,
  };
}

function NowLine({ now }: { now: number }) {
  const { t, time } = useI18n();
  return (
    <div className="nowline" aria-label={t('timeline.now', { time: time(now) })}>
      <span className="t">{time(now)}</span>
      <span className="l" />
    </div>
  );
}

function Row({
  event,
  dragging,
  onOpen,
  onOpenMap,
  onLongPress,
  onPickCategory,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  event: TripEvent;
  dragging: boolean;
  onOpen: (event: TripEvent) => void;
  onOpenMap: (event: TripEvent) => void;
  onLongPress: (event: TripEvent) => void;
  onPickCategory: (event: TripEvent) => void;
  onDragStart: (clientY: number) => void;
  onDragMove: (clientY: number) => void;
  onDragEnd: () => void;
}) {
  const { t } = useI18n();
  return (
    <SwipeRow
      rightLabel={`✓ ${t(event.done ? 'actions.undone' : 'timeline.done')}`}
      leftLabel={`${t('timeline.delete')} ✕`}
      onSwipeRight={() => void toggleDone(event.id)}
      onSwipeLeft={() => void deleteEvent(event.id)}
      onLongPress={() => onLongPress(event)}
      disabled={dragging}
    >
      <EventRow
        event={event}
        dragging={dragging}
        onOpen={onOpen}
        onOpenMap={onOpenMap}
        onPickCategory={onPickCategory}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
      />
    </SwipeRow>
  );
}

function EventRow({
  event,
  dragging,
  onOpen,
  onOpenMap,
  onPickCategory,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  event: TripEvent;
  dragging: boolean;
  onOpen: (event: TripEvent) => void;
  onOpenMap: (event: TripEvent) => void;
  onPickCategory: (event: TripEvent) => void;
  onDragStart: (clientY: number) => void;
  onDragMove: (clientY: number) => void;
  onDragEnd: () => void;
}) {
  const { t, duration } = useI18n();
  const category = CATEGORIES[event.category];

  return (
    <div className={`ev${event.done ? ' done' : ''}${dragging ? ' drag' : ''}`}>
      {/*
        時刻はここで直接入れる。**シートを開かせない** ──
        「時刻入力が面倒」がいちばん強いフィードバックだった。

        空のとき、iOS の time 入力は何も描かない。左の列が真っ白で
        「ここで時刻を入れられる」が伝わらなかったので、破線のチップを重ねる。
      */}
      <div className="ev-time">
        <span className="timeslot">
          <input
            type="time"
            className="timefield"
            value={event.startMinutes === null ? '' : toTimeValue(event.startMinutes)}
            onChange={(e) =>
              void setEventTime(
                event.id,
                e.target.value === '' ? null : fromTimeValue(e.target.value),
              )
            }
            aria-label={`${event.name} — ${t('event.time')}`}
          />
          {event.startMinutes === null && (
            <span className="timeghost" aria-hidden="true">
              <span>{t('timeline.setTime')}</span>
            </span>
          )}
        </span>
        {event.durationMinutes !== null && <small>{duration(event.durationMinutes)}</small>}
      </div>

      <div className="ev-rail">
        {/* アイコンをタップしてカテゴリ変更。シートの奥に隠さない */}
        <button
          type="button"
          className={`pin ${category.family}`}
          onClick={() => onPickCategory(event)}
          aria-label={`${event.name} — ${t('event.category')}`}
        >
          {category.emoji}
        </button>
        <span className="rail-line" aria-hidden="true" />
      </div>

      <div className="ev-body">
        <button type="button" className="ev-main" onClick={() => onOpen(event)}>
          <div className="ev-name">
            {event.done && <span className="donemark" aria-hidden="true">✓</span>}
            <span className="ev-label">{event.name}</span>
          </div>
          <div className="ev-sub">
            {/*
              集合は畳んで1行。人ごとの行を旅程に並べると、1日の全体像が消える。
              出すのは**いちばん早く出る人**の時刻 ── 全員が間に合う出発時刻で、
              集合を決めた人がまず知りたい数字がこれ。
            */}
            {event.isMeetup && <MeetupBadge event={event} />}
            {event.note && <span>{firstLine(event.note)}</span>}
            {event.pinned && <span className="badge">📌 {t('timeline.pinned')}</span>}
            {event.booking?.booked && <span className="badge book">🎫 {t('event.booked')}</span>}
            {event.links.length > 0 && <span className="badge">🔗 {event.links.length}</span>}
          </div>
        </button>

        {/* 旅行中の最頻操作なので、地図だけは常設して1タップで届かせる */}
        <button
          type="button"
          className="ev-map"
          onClick={() => onOpenMap(event)}
          aria-label={`${event.name} — ${t('timeline.openMap')}`}
        >
          <IconMap size={20} />
        </button>

        <DragHandle
          name={event.name}
          onStart={onDragStart}
          onMove={onDragMove}
          onEnd={onDragEnd}
        />
      </div>
    </div>
  );
}

/**
 * 並べ替えのつまみ。
 *
 * **専用のつまみからしかドラッグを始めない**ので、行の横スワイプ(完了・削除)と
 * ジェスチャが衝突しない。以前ドラッグを見送った理由がこれで解ける。
 */
function DragHandle({
  name,
  onStart,
  onMove,
  onEnd,
}: {
  name: string;
  onStart: (clientY: number) => void;
  onMove: (clientY: number) => void;
  onEnd: () => void;
}) {
  const { t } = useI18n();
  const active = useRef(false);

  function down(e: ReactPointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    // つまみで捕まえる。以後 pointermove はこのボタンに届くので、
    // 指がどこへ行ってもレールを外さない
    e.currentTarget.setPointerCapture(e.pointerId);
    active.current = true;
    onStart(e.clientY);
  }

  function move(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!active.current) return;
    e.stopPropagation();
    onMove(e.clientY);
  }

  function up(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!active.current) return;
    active.current = false;
    e.stopPropagation();
    onEnd();
  }

  return (
    <button
      type="button"
      className="ev-drag"
      aria-label={`${name} — ${t('actions.reorder')}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={(e) => e.stopPropagation()}
    >
      <IconDrag size={18} />
    </button>
  );
}

/**
 * 集合の要約。**何人で集まるか**と、いちばん早く出る人の時刻。
 *
 * 人数は「時間を入れた人の数」ではなく**同行者の数**。
 * 入力済みの数を出すと、まだ入れていない人がいるときに人数が減って見える。
 */
function MeetupBadge({ event }: { event: TripEvent }) {
  const { t, time } = useI18n();
  // 集合の予定は1日に1〜2件しかないので、ここで引いても安い(props を通さない)
  const members = useLiveQuery(() => listMembers(event.tripId), [event.tripId]);
  const longest = (event.meetup ?? []).reduce((max, e) => Math.max(max, e.minutes), 0);
  const leaveAt = departureTime(event.startMinutes, longest > 0 ? longest : undefined);

  return (
    <span className="badge meet">
      👥 {t('meetup.count', { n: members?.length ?? 0 })}
      {leaveAt !== null && ` ・ ${t('meetup.earliest', { time: time(leaveAt) })}`}
    </span>
  );
}

function toTimeValue(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function fromTimeValue(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function firstLine(text: string): string {
  const line = text.split('\n')[0];
  return line.length > 24 ? `${line.slice(0, 24)}…` : line;
}
