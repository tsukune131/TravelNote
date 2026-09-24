import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { useI18n } from '../i18n/context';
import { CATEGORIES } from '../lib/category';
import { nowLineIndex } from '../lib/ordering';
import { nowMinutes } from '../lib/plainDate';
import {
  deleteEvent,
  duplicateEvent,
  moveEvent,
  moveEventToDay,
  setEventTime,
  toggleDone,
} from '../db/repo';
import { Connector } from './Connector';
import { IconCopy, IconDrag, IconLink, IconMap } from './Icon';
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
 *
 * `ideas` のときは「メモ」タブの一覧として描く。日が決まっていないので
 * 時刻・移動・現在時刻ラインは出さない(どれも「その日」があって意味を持つ)。
 */
export function Timeline({
  tripId,
  events,
  dayIndex,
  ideas = false,
  isToday,
  isLastDay,
  mapProvider,
  onOpen,
  onOpenMap,
  onOpenLinks,
  onLongPress,
  onPickCategory,
  onHoverDay,
  onMovedToDay,
}: {
  tripId: string;
  events: TripEvent[];
  dayIndex: number;
  ideas?: boolean;
  isToday: boolean;
  isLastDay: boolean;
  mapProvider: MapProvider | null;
  onOpen: (event: TripEvent) => void;
  onOpenMap: (event: TripEvent) => void;
  onOpenLinks: (event: TripEvent) => void;
  onLongPress: (event: TripEvent) => void;
  onPickCategory: (event: TripEvent) => void;
  /** ドラッグ中に指が乗っている Day タブ。離れたら null */
  onHoverDay: (dayIndex: number | null) => void;
  /** Day タブに落として、別の日へ移したあと */
  onMovedToDay: (event: TripEvent, toDayIndex: number) => void;
}) {
  const { t } = useI18n();
  const listRef = useRef<HTMLDivElement>(null);
  const drag = useDragReorder(events, dayIndex, listRef, onHoverDay, onMovedToDay);

  if (events.length === 0) {
    return ideas ? (
      <div className="empty">
        <b>{t('ideas.empty')}</b>
        <p>{t('ideas.emptyHint')}</p>
      </div>
    ) : (
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
  const nowAt = isToday && !ideas ? nowLineIndex(shown, now) : null;

  return (
    <div ref={listRef} className={drag.active ? 'dragging' : undefined}>
      {shown.map((event, i) => (
        <div
          key={event.id}
          data-row={event.id}
          className={`tl-row${drag.isHeld(event.id) ? ' held' : ''}${
            drag.isHeld(event.id) && drag.overDay !== null ? ' over-tab' : ''
          }`}
          style={drag.styleFor(i, event.id)}
        >
          {/* 掴んでいるあいだは現在時刻ラインを出さない。行と一緒に動いて嘘になる */}
          {nowAt === i && !drag.active && <NowLine now={now} />}
          <Row
            event={event}
            ideas={ideas}
            dragging={drag.isHeld(event.id)}
            onOpen={onOpen}
            onOpenMap={onOpenMap}
            onOpenLinks={onOpenLinks}
            onLongPress={onLongPress}
            onPickCategory={onPickCategory}
            onDragStart={(x, y) => drag.begin(i, x, y)}
            onDragMove={drag.move}
            onDragEnd={drag.end}
          />
          {!ideas && shown[i + 1] && (
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

/** Day タブの帯の端にこれだけ近づいたら、帯を横へ送る(隠れている Day に届かせる) */
const EDGE_PX = 36;
const EDGE_STEP_PX = 14;

type Held = {
  id: string;
  /** 掴んだときの位置 */
  from: number;
  /** いま指を離したら入る位置 */
  to: number;
  /** 指の移動量。掴んだ行はこれだけ動く */
  dx: number;
  dy: number;
  /** よけるほうの行がずれる量(掴んだ行の高さ) */
  shift: number;
  /** 掴んだ時点の各行の中心。指が動くたびに測り直さない(測り直すと自分の transform を拾う) */
  centers: number[];
  startX: number;
  startY: number;
  /** 指が乗っている Day タブ。乗っているあいだは並べ替えを止める */
  overDay: number | null;
  /** 指を離したあと、落ちる先へ滑っている最中 */
  settling: boolean;
};

/**
 * 指の下にある Day タブ(`data-drop-day`)。
 *
 * `elementFromPoint` は使わない ── 指の真下には掴んでいる行そのものがある。
 * タブはドラッグ中も transform しないので、箱を測って当てれば足りる。
 */
function dropDayAt(x: number, y: number): number | null {
  for (const el of document.querySelectorAll<HTMLElement>('[data-drop-day]')) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
      return Number(el.dataset.dropDay);
    }
  }
  return null;
}

/** 指が帯の左右の端にあれば、帯を少し送る。7日を超える旅は右のほうのタブが隠れている */
function nudgeTabStrip(x: number, y: number): void {
  const strip = document.querySelector<HTMLElement>('[data-drop-strip]');
  if (!strip) return;
  const r = strip.getBoundingClientRect();
  if (y < r.top || y > r.bottom) return;
  if (x < r.left + EDGE_PX) strip.scrollLeft -= EDGE_STEP_PX;
  else if (x > r.right - EDGE_PX) strip.scrollLeft += EDGE_STEP_PX;
}

/**
 * 指についてくる並べ替え。**上の Day タブに落とせば、その日へ移る。**
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
 * - Day タブに指が乗ったら、すき間を閉じてタブを光らせる。
 *   落ちる先は「その日の末尾」(長押しの「別の日へ移す」と同じ)
 */
function useDragReorder(
  events: TripEvent[],
  dayIndex: number,
  listRef: React.RefObject<HTMLDivElement | null>,
  onHoverDay: (dayIndex: number | null) => void,
  onMovedToDay: (event: TripEvent, toDayIndex: number) => void,
) {
  const [held, setHeld] = useState<Held | null>(null);
  /** 保存が返ってくるまでのあいだ見せる並び。ここが無いと一瞬だけ元の並びに戻る */
  const [optimistic, setOptimistic] = useState<TripEvent[] | null>(null);
  const commit = useRef<(() => void) | null>(null);
  const hovering = useRef<number | null>(null);

  // 本物が届いたら先取りした並びは捨てる
  useEffect(() => setOptimistic(null), [events]);

  // 滑っている最中に画面を離れても、保存は取りこぼさない
  useEffect(() => () => commit.current?.(), []);

  const shown = optimistic ?? events;

  function hover(day: number | null) {
    if (hovering.current === day) return;
    hovering.current = day;
    onHoverDay(day);
  }

  function begin(index: number, clientX: number, clientY: number) {
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
      dx: 0,
      dy: 0,
      shift: rects[index].height,
      centers: rects.map((r) => r.top + r.height / 2),
      startX: clientX,
      startY: clientY,
      overDay: null,
      settling: false,
    });
  }

  function move(clientX: number, clientY: number) {
    if (!held || held.settling) return;
    nudgeTabStrip(clientX, clientY);
    const found = dropDayAt(clientX, clientY);
    // いま開いている日のタブに戻したときは、ただの並べ替えとして扱う
    const overDay = found === dayIndex ? null : found;
    hover(overDay);

    setHeld((d) => {
      if (!d || d.settling) return d;
      const dx = clientX - d.startX;
      const dy = clientY - d.startY;
      if (overDay !== null) return { ...d, dx, dy, to: d.from, overDay };
      const center = d.centers[d.from] + dy;
      // 自分より上に中心がある行の数 = そこへ入ったときの位置
      let to = 0;
      for (let i = 0; i < d.centers.length; i++) {
        if (i !== d.from && d.centers[i] < center) to++;
      }
      return { ...d, dx, dy, to, overDay: null };
    });
  }

  function end() {
    const d = held;
    hover(null);
    if (!d || d.settling) return;

    if (d.overDay !== null) {
      const moved = shown[d.from];
      const toDay = d.overDay;
      // 行はタブに吸い込まれたことにして、その場で消す
      setOptimistic(shown.filter((e) => e.id !== d.id));
      setHeld(null);
      void moveEventToDay(d.id, toDay).then(() => onMovedToDay(moved, toDay));
      return;
    }

    if (d.to === d.from) {
      setHeld(null);
      return;
    }

    const rest = shown.filter((e) => e.id !== d.id);
    const moved = shown[d.from];
    const before = rest[d.to - 1] ?? null;
    const after = rest[d.to] ?? null;

    // まず落ちる先まで滑らせる
    setHeld({ ...d, dx: 0, dy: d.centers[d.to] - d.centers[d.from], settling: true });

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
    // 横に動くのは掴んだ行だけ。タブへ運ぶときに指から離れないように
    const x = isHeld ? held.dx : 0;
    return {
      transform: `translate(${x}px, ${offsetOf(i)}px)`,
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
    overDay: held?.overDay ?? null,
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

type RowProps = {
  event: TripEvent;
  ideas: boolean;
  dragging: boolean;
  onOpen: (event: TripEvent) => void;
  onOpenMap: (event: TripEvent) => void;
  onOpenLinks: (event: TripEvent) => void;
  onPickCategory: (event: TripEvent) => void;
  onDragStart: (clientX: number, clientY: number) => void;
  onDragMove: (clientX: number, clientY: number) => void;
  onDragEnd: () => void;
};

function Row({
  onLongPress,
  ...props
}: RowProps & { onLongPress: (event: TripEvent) => void }) {
  const { t } = useI18n();
  const { event, dragging } = props;
  return (
    <SwipeRow
      rightLabel={`✓ ${t(event.done ? 'actions.undone' : 'timeline.done')}`}
      leftLabel={`${t('timeline.delete')} ✕`}
      onSwipeRight={() => void toggleDone(event.id)}
      onSwipeLeft={() => void deleteEvent(event.id)}
      onLongPress={() => onLongPress(event)}
      disabled={dragging}
    >
      <EventRow {...props} />
    </SwipeRow>
  );
}

function EventRow({
  event,
  ideas,
  dragging,
  onOpen,
  onOpenMap,
  onOpenLinks,
  onPickCategory,
  onDragStart,
  onDragMove,
  onDragEnd,
}: RowProps) {
  const { t, duration } = useI18n();
  const category = CATEGORIES[event.category];

  return (
    <div className={`ev${ideas ? ' idea' : ''}${event.done ? ' done' : ''}${dragging ? ' drag' : ''}`}>
      {/*
        時刻はここで直接入れる。**シートを開かせない** ──
        「時刻入力が面倒」がいちばん強いフィードバックだった。

        空のとき、iOS の time 入力は何も描かない。左の列が真っ白で
        「ここで時刻を入れられる」が伝わらなかったので、破線のチップを重ねる。

        メモのタブには出さない。日が決まっていないものに時刻は早い
      */}
      {!ideas && (
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
      )}

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
            {event.note && <span>{firstLine(event.note)}</span>}
            {event.pinned && <span className="badge">📌 {t('timeline.pinned')}</span>}
            {event.booking?.booked && <span className="badge book">🎫 {t('event.booked')}</span>}
          </div>
        </button>

        {/*
          地図の左に、よく使う2つを常設する(長押しメニューの奥に隠さない)。
          リンクは付いているときだけ。無い行にまで出すと、名前の幅を削るだけになる
        */}
        {event.links.length > 0 && (
          <button
            type="button"
            className="ev-act"
            onClick={() => onOpenLinks(event)}
            aria-label={`${event.name} — ${t('timeline.openLink')}`}
          >
            <IconLink size={19} />
            {event.links.length > 1 && <span className="ev-count">{event.links.length}</span>}
          </button>
        )}
        <button
          type="button"
          className="ev-act"
          onClick={() => void duplicateEvent(event.id)}
          aria-label={`${event.name} — ${t('timeline.duplicate')}`}
        >
          <IconCopy size={18} />
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
  onStart: (clientX: number, clientY: number) => void;
  onMove: (clientX: number, clientY: number) => void;
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
    onStart(e.clientX, e.clientY);
  }

  function move(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!active.current) return;
    e.stopPropagation();
    onMove(e.clientX, e.clientY);
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
