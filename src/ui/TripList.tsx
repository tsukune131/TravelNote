import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '../i18n/context';
import { listTrips } from '../db/repo';
import { dayCount, diffDays, toDate, today } from '../lib/plainDate';
import type { Trip } from '../db/types';
import { TripForm } from './TripForm';
import { Settings } from './Settings';

export function TripList({ onOpen }: { onOpen: (tripId: string, dayIndex: number) => void }) {
  const { t, date } = useI18n();
  const trips = useLiveQuery(() => listTrips(), []);
  const [creating, setCreating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const now = today();

  return (
    <div className="screen">
      <header className="topbar">
        <div className="topbar-row">
          <h1>{t('tripList.title')}</h1>
          <button
            type="button"
            className="iconbtn plain"
            onClick={() => setShowSettings(true)}
            aria-label={t('settings.title')}
          >
            ⚙
          </button>
        </div>
      </header>

      <div className="scroller">
        <div className="pad">
          {trips !== undefined && trips.length === 0 && (
            <div className="empty">
              <b>{t('tripList.empty')}</b>
              <p>{t('tripList.emptyHint')}</p>
            </div>
          )}

          {trips?.map((trip) => (
            <button
              key={trip.id}
              type="button"
              className="trip-card"
              onClick={() => onOpen(trip.id, currentDayIndex(trip, now))}
            >
              <h2>{trip.title}</h2>
              <div className="trip-meta">
                <span>
                  {date(toDate(trip.startDate), { month: 'numeric', day: 'numeric' })}
                  {' – '}
                  {date(toDate(trip.endDate), { month: 'numeric', day: 'numeric' })}
                </span>
                <span>{lengthLabel(trip, t)}</span>
                <Status trip={trip} now={now} />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="addbar">
        <button type="button" className="btn wide" onClick={() => setCreating(true)}>
          + {t('tripList.create')}
        </button>
      </div>

      {creating && (
        <TripForm
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onOpen(id, 0);
          }}
        />
      )}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function Status({ trip, now }: { trip: Trip; now: string }) {
  const { t } = useI18n();
  if (trip.startDate <= now && now <= trip.endDate) {
    return <span className="chip now">{t('tripList.ongoing')}</span>;
  }
  if (trip.endDate < now) {
    return <span className="chip">{t('tripList.past')}</span>;
  }
  const days = diffDays(now, trip.startDate);
  if (days <= 30) {
    return <span className="chip soon">{t('tripList.upcomingIn', { n: days })}</span>;
  }
  return null;
}

function lengthLabel(trip: Trip, t: ReturnType<typeof useI18n>['t']): string {
  const days = dayCount(trip.startDate, trip.endDate);
  if (days <= 1) return t('tripList.dayTrip');
  return t('tripList.nights', { n: days - 1, m: days });
}

/** 旅行中ならその日、そうでなければ Day 1 を開く */
function currentDayIndex(trip: Trip, now: string): number {
  if (trip.startDate <= now && now <= trip.endDate) return diffDays(trip.startDate, now);
  return 0;
}
