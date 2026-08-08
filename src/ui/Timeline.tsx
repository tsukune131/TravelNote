import { useI18n } from '../i18n/context';
import { CATEGORIES } from '../lib/category';
import { nowMinutes } from '../lib/plainDate';
import { deleteEvent, toggleDone } from '../db/repo';
import { Connector } from './Connector';
import { SeedChips } from './SeedChips';
import { SwipeRow } from './SwipeRow';
import type { MapProvider } from '../lib/maps';
import type { TripEvent } from '../db/types';

/**
 * その日のタイムライン。
 *
 * 左に時刻、縦のレール、レール上にカテゴリのアイコン。
 * **所要時間をレールの長さで表さない** ── 長さで表すと3時間の予定が画面を占領し、
 * 1日の全体像が消える(docs/ux-design.md §3.1)。
 *
 * 時刻ありが先、**時刻未定は末尾にまとめる**。
 * 予定と予定のあいだには Connector が入る ── ここがこの製品の核。
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
}) {
  const { t } = useI18n();

  if (events.length === 0) {
    return (
      <div className="empty">
        <b>{t('timeline.empty', { n: dayIndex + 1 })}</b>
        <p>{isLastDay ? t('timeline.emptyHintLast') : t('timeline.emptyHintFirst')}</p>
        {/* 文章だけでは手が動かない。1タップで骨組みが立つようにする */}
        <SeedChips
          tripId={tripId}
          dayIndex={dayIndex}
          isFirstDay={dayIndex === 0}
          isLastDay={isLastDay}
        />
      </div>
    );
  }

  const timed = events.filter((e) => e.startMinutes !== null);
  const untimed = events.filter((e) => e.startMinutes === null);
  const now = nowMinutes();

  return (
    <>
      {timed.map((event, i) => (
        <div key={event.id}>
          {isToday && crossesNow(timed, i, now) && <NowLine now={now} />}
          <Row
            event={event}
            onOpen={onOpen}
            onOpenMap={onOpenMap}
            onLongPress={onLongPress}
          />
          {timed[i + 1] && (
            <Connector prev={event} next={timed[i + 1]} mapProvider={mapProvider} />
          )}
        </div>
      ))}

      {/* 最後の予定より後ろに現在時刻がある場合 */}
      {isToday && timed.length > 0 && (timed[timed.length - 1].startMinutes ?? 0) <= now && (
        <NowLine now={now} />
      )}

      {untimed.length > 0 && (
        <>
          <div className="unscheduled">{t('timeline.unscheduled')}</div>
          {untimed.map((event) => (
            <Row
              key={event.id}
              event={event}
              onOpen={onOpen}
              onOpenMap={onOpenMap}
              onLongPress={onLongPress}
            />
          ))}
        </>
      )}
    </>
  );
}

/** i 番目の予定の直前に現在時刻ラインが来るか */
function crossesNow(timed: TripEvent[], i: number, now: number): boolean {
  const start = timed[i].startMinutes ?? 0;
  if (start <= now) return false;
  const prev = i > 0 ? (timed[i - 1].startMinutes ?? 0) : -1;
  return prev <= now;
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
  onOpen,
  onOpenMap,
  onLongPress,
}: {
  event: TripEvent;
  onOpen: (event: TripEvent) => void;
  onOpenMap: (event: TripEvent) => void;
  onLongPress: (event: TripEvent) => void;
}) {
  const { t } = useI18n();
  return (
    <SwipeRow
      rightLabel={`✓ ${t(event.done ? 'actions.undone' : 'timeline.done')}`}
      leftLabel={`${t('timeline.delete')} ✕`}
      onSwipeRight={() => void toggleDone(event.id)}
      onSwipeLeft={() => void deleteEvent(event.id)}
      onLongPress={() => onLongPress(event)}
    >
      <EventRow event={event} onOpen={onOpen} onOpenMap={onOpenMap} />
    </SwipeRow>
  );
}

function EventRow({
  event,
  onOpen,
  onOpenMap,
}: {
  event: TripEvent;
  onOpen: (event: TripEvent) => void;
  onOpenMap: (event: TripEvent) => void;
}) {
  const { t, time, duration } = useI18n();
  const category = CATEGORIES[event.category];

  return (
    <div className={`ev${event.done ? ' done' : ''}`}>
      <div className="ev-time">
        {event.startMinutes === null ? (
          <span aria-hidden="true">{t('timeline.noTime')}</span>
        ) : (
          time(event.startMinutes)
        )}
        {event.durationMinutes !== null && <small>{duration(event.durationMinutes)}</small>}
      </div>

      <div className="ev-rail" aria-hidden="true">
        <span className={`pin ${category.family}`}>{category.emoji}</span>
        <span className="rail-line" />
      </div>

      <div className="ev-body">
        <button type="button" className="ev-main" onClick={() => onOpen(event)}>
          <div className="ev-name">
            {event.done && <span aria-hidden="true">✓ </span>}
            {event.name}
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
          🗺
        </button>
      </div>
    </div>
  );
}

function firstLine(text: string): string {
  const line = text.split('\n')[0];
  return line.length > 28 ? `${line.slice(0, 28)}…` : line;
}
