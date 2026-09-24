import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { updateTrip } from '../db/repo';
import { searchPlace } from '../weather/weather';
import type { Trip, TripPlace } from '../db/types';

/**
 * 旅先(天気予報を出す場所)。旅の設定の中。
 *
 * 地名で探して、候補から1つ選ぶ。座標を手で入れさせない。
 * 探すのは Apple の地名検索なので、**入れた名前は Apple に送られる**
 * (プライバシーポリシーに書く。ROADMAP E-8)。
 *
 * 旅先は無料で決められる。予報を見るのが Pro(WeatherBar)。
 */
export function PlaceField({ trip }: { trip: Trip }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TripPlace[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    const q = query.trim();
    if (q.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const found = await searchPlace(q);
      setResults(found);
      if (found.length === 0) setError(t('weather.notFound'));
    } catch {
      setResults(null);
      setError(t('weather.notFound'));
    } finally {
      setBusy(false);
    }
  }

  async function pick(place: TripPlace) {
    await updateTrip(trip.id, { place });
    setResults(null);
    setQuery('');
  }

  return (
    <div className="field">
      <label htmlFor="trip-place">{t('weather.place')}</label>
      {trip.place && (
        <div className="linkrow">
          <span className="lbl">📍</span>
          <span className="url">{trip.place.name}</span>
          <button
            type="button"
            className="linklike"
            onClick={() => void updateTrip(trip.id, { place: undefined })}
          >
            {t('weather.clear')}
          </button>
        </div>
      )}
      <div className="row">
        <input
          id="trip-place"
          value={query}
          placeholder={t('weather.placePlaceholder')}
          enterKeyHint="search"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search();
          }}
        />
        <button type="button" className="btn" disabled={busy || query.trim().length === 0} onClick={() => void search()}>
          {t('weather.search')}
        </button>
      </div>
      {results?.map((p) => (
        <button key={`${p.lat},${p.lng}`} type="button" className="menu-item" onClick={() => void pick(p)}>
          📍 {p.name}
          <span className="sub">›</span>
        </button>
      ))}
      {error && <p className="err">{error}</p>}
      <p className="guess">{t('weather.placeHint')}</p>
    </div>
  );
}
