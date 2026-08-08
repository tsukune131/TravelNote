import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/context';
import { categoryLabelKey } from '../i18n/keys';
import { db } from '../db/db';
import { addEvent, listEventsOfDay } from '../db/repo';
import { getMapProvider, setMapProvider } from '../db/settings';
import { guessCategory } from '../lib/category';
import { dateOfDay, dayCount, toDate, today } from '../lib/plainDate';
import { openMap } from '../lib/openExternal';
import type { MapProvider } from '../lib/maps';
import type { TripEvent } from '../db/types';
import type { ReflowResult } from '../db/repo';
import { Timeline } from './Timeline';
import { EventSheet } from './EventSheet';
import { EventActions, UndoBar } from './EventActions';
import { TripForm } from './TripForm';
import { MapProviderPrompt } from './Settings';

export function TripScreen({
  tripId,
  dayIndex,
  onChangeDay,
  onBack,
}: {
  tripId: string;
  dayIndex: number;
  onChangeDay: (next: number) => void;
  onBack: () => void;
}) {
  const { t, date } = useI18n();
  const trip = useLiveQuery(() => db.trips.get(tripId), [tripId]);
  const events = useLiveQuery(() => listEventsOfDay(tripId, dayIndex), [tripId, dayIndex]);

  const [draft, setDraft] = useState('');
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [actionEventId, setActionEventId] = useState<string | null>(null);
  const [editingTrip, setEditingTrip] = useState(false);
  const [pendingMapFor, setPendingMapFor] = useState<TripEvent | null>(null);
  const [mapProvider, setMapProviderState] = useState<MapProvider | null>(null);
  const [undo, setUndo] = useState<{ result: ReflowResult; delta: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openEvent = events?.find((e) => e.id === openEventId) ?? null;
  const actionEvent = events?.find((e) => e.id === actionEventId) ?? null;

  useEffect(() => {
    void getMapProvider().then(setMapProviderState);
  }, []);

  // 「元に戻す」は数秒で消える。押さなければそのまま確定
  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(() => setUndo(null), 6000);
    return () => window.clearTimeout(id);
  }, [undo]);

  // 旅の日数が縮んで、開いていた Day が範囲外になったときの保険
  const total = trip ? dayCount(trip.startDate, trip.endDate) : 1;
  useEffect(() => {
    if (trip && dayIndex >= total) onChangeDay(total - 1);
  }, [trip, dayIndex, total, onChangeDay]);

  if (!trip) return <div className="screen" />;

  const todayDate = today();
  const dayDate = dateOfDay(trip.startDate, dayIndex);

  async function handleOpenMap(event: TripEvent) {
    const provider = await getMapProvider();
    if (!provider) {
      // 初回だけ聞く。以後は設定から変えられる
      setPendingMapFor(event);
      return;
    }
    openMap(provider, { name: event.name, lat: event.lat, lng: event.lng });
  }

  function pickedMapProvider(provider: MapProvider) {
    void setMapProvider(provider);
    setMapProviderState(provider);
  }

  async function submitDraft() {
    const name = draft.trim();
    if (name.length === 0) return;
    await addEvent(tripId, dayIndex, name);
    setDraft('');
    // 連続追加。計画段階で行きたい場所をまとめて放り込めることが大事
    inputRef.current?.focus();
  }

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-row">
          <button type="button" className="iconbtn" onClick={onBack} aria-label={t('common.back')}>
            ‹
          </button>
          <h1>{trip.title}</h1>
          <button
            type="button"
            className="iconbtn plain"
            onClick={() => setEditingTrip(true)}
            aria-label={t('trip.menu')}
          >
            ⋯
          </button>
        </div>
      </header>

      <div className="daytabs" role="tablist" aria-label={t('trip.dayTab', { n: total })}>
        {Array.from({ length: total }, (_, i) => {
          const d = dateOfDay(trip.startDate, i);
          return (
            <button
              key={i}
              type="button"
              role="tab"
              className="daytab"
              aria-selected={i === dayIndex}
              onClick={() => onChangeDay(i)}
            >
              <b>{t('trip.dayTab', { n: i + 1 })}</b>
              <small>{date(toDate(d))}</small>
            </button>
          );
        })}
      </div>

      <div className="scroller">
        <div className="pad">
          {events && (
            <Timeline
              events={events}
              dayIndex={dayIndex}
              isToday={dayDate === todayDate}
              isLastDay={dayIndex === total - 1}
              mapProvider={mapProvider}
              onOpen={(e) => setOpenEventId(e.id)}
              onOpenMap={(e) => void handleOpenMap(e)}
              onLongPress={(e) => setActionEventId(e.id)}
            />
          )}
        </div>
      </div>

      <div className="addbar">
        <input
          ref={inputRef}
          value={draft}
          placeholder={t('event.namePlaceholder')}
          enterKeyHint="done"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitDraft();
          }}
          aria-label={t('timeline.addEvent')}
        />
        <button type="button" className="btn" onClick={() => void submitDraft()} disabled={draft.trim().length === 0}>
          {t('common.add')}
        </button>
      </div>

      {draft.trim().length > 0 && (
        <p
          className="guess"
          style={{
            position: 'fixed',
            left: '0.9rem',
            right: '0.9rem',
            bottom: 'calc(var(--safe-bottom) + 3.6rem)',
            textAlign: 'right',
          }}
        >
          {t('event.guessedCategory')}: {t(categoryLabelKey(guessCategory(draft)))} ・{' '}
          {t('event.nameHint')}
        </p>
      )}

      {undo && (
        <UndoBar result={undo.result} deltaMinutes={undo.delta} onDismiss={() => setUndo(null)} />
      )}

      {actionEvent && events && (
        <EventActions
          event={actionEvent}
          events={events}
          dayCount={total}
          onClose={() => setActionEventId(null)}
          onEdit={() => {
            setOpenEventId(actionEvent.id);
            setActionEventId(null);
          }}
          onReflowed={(result, delta) => setUndo({ result, delta })}
        />
      )}

      {openEvent && (
        <EventSheet
          event={openEvent}
          onClose={() => setOpenEventId(null)}
          onOpenMap={(e) => void handleOpenMap(e)}
        />
      )}

      {editingTrip && <TripForm trip={trip} onClose={() => setEditingTrip(false)} />}

      {pendingMapFor && (
        <MapProviderPrompt
          onClose={() => setPendingMapFor(null)}
          onPick={(provider: MapProvider) => {
            pickedMapProvider(provider);
            openMap(provider, {
              name: pendingMapFor.name,
              lat: pendingMapFor.lat,
              lng: pendingMapFor.lng,
            });
            setPendingMapFor(null);
          }}
        />
      )}
    </div>
  );
}
