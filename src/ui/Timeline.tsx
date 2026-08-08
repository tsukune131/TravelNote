import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useI18n } from '../i18n/context';
import { CATEGORIES } from '../lib/category';
import { nowLineIndex } from '../lib/ordering';
import { nowMinutes } from '../lib/plainDate';
import { deleteEvent, moveEvent, setEventTime, toggleDone } from '../db/repo';
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
  const [dragId, setDragId] = useState<string | null>(null);

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

  const now = nowMinutes();
  const nowAt = isToday ? nowLineIndex(events, now) : null;

  return (
    <div ref={listRef} className={dragId ? 'dragging' : undefined}>
      {events.map((event, i) => (
        <div key={event.id} data-row={event.id}>
          {nowAt === i && <NowLine now={now} />}
          <Row
            event={event}
            dragging={dragId === event.id}
            onOpen={onOpen}
            onOpenMap={onOpenMap}
            onLongPress={onLongPress}
            onPickCategory={onPickCategory}
            onDragStart={() => setDragId(event.id)}
            onDragEnd={(clientY) => {
              setDragId(null);
              void dropAt(events, event, clientY, listRef.current);
            }}
          />
          {events[i + 1] && (
            <Connector prev={event} next={events[i + 1]} mapProvider={mapProvider} />
          )}
        </div>
      ))}
      {nowAt === events.length && <NowLine now={now} />}
    </div>
  );
}

/** 指を離した位置から、どの予定の間に落とすかを決めて order を書き換える */
async function dropAt(
  events: TripEvent[],
  moved: TripEvent,
  clientY: number,
  root: HTMLElement | null,
): Promise<void> {
  if (!root) return;
  const rows = events.map((e) => ({
    event: e,
    rect: root.querySelector(`[data-row="${e.id}"]`)?.getBoundingClientRect(),
  }));

  // 落とした位置より上にある行のうち、いちばん下のもの
  let before: TripEvent | null = null;
  let after: TripEvent | null = null;
  for (const { event, rect } of rows) {
    if (!rect || event.id === moved.id) continue;
    const middle = rect.top + rect.height / 2;
    if (clientY > middle) before = event;
    else if (after === null) after = event;
  }
  if (before?.id === moved.id) return;

  const current = events.findIndex((e) => e.id === moved.id);
  const currentBefore = current > 0 ? events[current - 1] : null;
  if ((currentBefore?.id ?? null) === (before?.id ?? null)) return; // 動いていない

  await moveEvent(moved.id, moved.dayIndex, before, after);
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
  onDragEnd,
}: {
  event: TripEvent;
  dragging: boolean;
  onOpen: (event: TripEvent) => void;
  onOpenMap: (event: TripEvent) => void;
  onLongPress: (event: TripEvent) => void;
  onPickCategory: (event: TripEvent) => void;
  onDragStart: () => void;
  onDragEnd: (clientY: number) => void;
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
  onDragEnd,
}: {
  event: TripEvent;
  dragging: boolean;
  onOpen: (event: TripEvent) => void;
  onOpenMap: (event: TripEvent) => void;
  onPickCategory: (event: TripEvent) => void;
  onDragStart: () => void;
  onDragEnd: (clientY: number) => void;
}) {
  const { t, duration } = useI18n();
  const category = CATEGORIES[event.category];

  return (
    <div className={`ev${event.done ? ' done' : ''}${dragging ? ' drag' : ''}`}>
      {/*
        時刻はここで直接入れる。**シートを開かせない** ──
        「時刻入力が面倒」がいちばん強いフィードバックだった。
        空のときは --:-- が出て、それ自体が「押せる」ことを伝える。
      */}
      <div className="ev-time">
        <input
          type="time"
          className="timefield"
          value={event.startMinutes === null ? '' : toTimeValue(event.startMinutes)}
          onChange={(e) =>
            void setEventTime(event.id, e.target.value === '' ? null : fromTimeValue(e.target.value))
          }
          aria-label={`${event.name} — ${t('event.time')}`}
        />
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

        <DragHandle name={event.name} onStart={onDragStart} onEnd={onDragEnd} />
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
  onEnd,
}: {
  name: string;
  onStart: () => void;
  onEnd: (clientY: number) => void;
}) {
  const { t } = useI18n();
  const active = useRef(false);

  function down(e: ReactPointerEvent<HTMLButtonElement>) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    active.current = true;
    onStart();
  }

  function up(e: ReactPointerEvent<HTMLButtonElement>) {
    if (!active.current) return;
    active.current = false;
    e.stopPropagation();
    onEnd(e.clientY);
  }

  return (
    <button
      type="button"
      className="ev-drag"
      aria-label={`${name} — ${t('actions.reorder')}`}
      onPointerDown={down}
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
