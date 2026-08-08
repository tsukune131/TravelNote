import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { createTrip, updateTrip } from '../db/repo';
import { addDays, dayCount, isPlainDate, today } from '../lib/plainDate';
import type { PlainDate } from '../lib/plainDate';
import type { Trip } from '../db/types';

const MAX_DAYS = 60;

export function TripForm({
  trip,
  onClose,
  onCreated,
}: {
  trip?: Trip;
  onClose: () => void;
  onCreated?: (tripId: string) => void;
}) {
  const { t } = useI18n();
  const [title, setTitle] = useState(trip?.title ?? '');
  const [startDate, setStartDate] = useState<PlainDate>(trip?.startDate ?? today());
  const [endDate, setEndDate] = useState<PlainDate>(trip?.endDate ?? addDays(today(), 2));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (title.trim().length === 0) return setError(t('tripForm.nameError'));
    if (!isPlainDate(startDate) || !isPlainDate(endDate)) return setError(t('tripForm.rangeError'));
    if (endDate < startDate) return setError(t('tripForm.rangeError'));
    if (dayCount(startDate, endDate) > MAX_DAYS) return setError(t('tripForm.tooLong'));

    setBusy(true);
    if (trip) {
      await updateTrip(trip.id, { title: title.trim(), startDate, endDate });
      onClose();
    } else {
      const created = await createTrip({ title: title.trim(), startDate, endDate });
      onCreated?.(created.id);
    }
  }

  return (
    <Sheet title={trip ? t('tripForm.editTitle') : t('tripForm.newTitle')} onClose={onClose}>
      <div className="field">
        <label htmlFor="trip-name">{t('tripForm.name')}</label>
        <input
          id="trip-name"
          value={title}
          placeholder={t('tripForm.namePlaceholder')}
          onChange={(e) => {
            setTitle(e.target.value);
            setError(null);
          }}
          autoFocus={trip === undefined}
        />
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="trip-start">{t('tripForm.startDate')}</label>
          <input
            id="trip-start"
            type="date"
            value={startDate}
            onChange={(e) => {
              const next = e.target.value as PlainDate;
              setStartDate(next);
              // 出発日を後ろにずらしたら帰る日も連れていく(逆転を作らせない)
              if (next > endDate) setEndDate(next);
              setError(null);
            }}
          />
        </div>
        <div className="field">
          <label htmlFor="trip-end">{t('tripForm.endDate')}</label>
          <input
            id="trip-end"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => {
              setEndDate(e.target.value as PlainDate);
              setError(null);
            }}
          />
        </div>
      </div>

      {error && <p className="err">{error}</p>}

      <button type="button" className="btn wide" onClick={submit} disabled={busy}>
        {trip ? t('common.save') : t('tripForm.create')}
      </button>
    </Sheet>
  );
}
