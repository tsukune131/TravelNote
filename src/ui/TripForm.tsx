import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { Sheet } from './Sheet';
import { createTrip, updateTrip } from '../db/repo';
import { addDays, dayCount, isPlainDate, toDate, today } from '../lib/plainDate';
import type { PlainDate } from '../lib/plainDate';
import type { Trip } from '../db/types';

const MAX_DAYS = 60;

/** 'YYYY-MM-DD' の頭4桁 */
function yearOf(date: PlainDate): string {
  return date.slice(0, 4);
}

export function TripForm({
  trip,
  onClose,
  onCreated,
}: {
  trip?: Trip;
  onClose: () => void;
  onCreated?: (tripId: string) => void;
}) {
  const { t, date } = useI18n();
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

  const range = describeRange();

  /** 「2026年8月8日(土) 〜 8月11日(火)・3泊4日」。日付が壊れているときは出さない */
  function describeRange(): string | null {
    if (!isPlainDate(startDate) || !isPlainDate(endDate) || endDate < startDate) return null;
    const days = dayCount(startDate, endDate);
    if (days > MAX_DAYS) return null;
    const withYear = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' } as const;
    const sameYear = yearOf(startDate) === yearOf(endDate);
    return t('tripForm.range', {
      start: date(toDate(startDate), withYear),
      end: date(
        toDate(endDate),
        sameYear ? { month: 'long', day: 'numeric', weekday: 'short' } : withYear,
      ),
      length: days <= 1 ? t('tripList.dayTrip') : t('tripList.nights', { n: days - 1, m: days }),
    });
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

      <div className="row pair">
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

      {/*
        決めた日付を**年つきの言葉で**返す。
        日付欄は OS の表記なので月日しか目に入らず、来年の旅を今年で作ってしまう。
        泊数も一緒に出す ── 数え間違いはここで気づけたほうがいい。
        年が変わる旅(年末年始)は、終わりの日にも年を出す。
      */}
      {range !== null && <p className="guess">{range}</p>}

      {error && <p className="err">{error}</p>}

      <button type="button" className="btn wide" onClick={submit} disabled={busy}>
        {trip ? t('common.save') : t('tripForm.create')}
      </button>
    </Sheet>
  );
}
