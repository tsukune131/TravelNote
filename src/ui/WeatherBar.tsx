import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { Paywall } from './Paywall';
import { openLink } from '../lib/openExternal';
import { weatherEmoji } from '../weather/weather';
import type { Forecast } from '../weather/weather';
import type { PlainDate } from '../lib/plainDate';
import { today } from '../lib/plainDate';
import type { Trip } from '../db/types';

/**
 * その日の天気(Day の一番上)。**旅先が決まっているときだけ出る。**
 *
 * - Pro でない: 「天気予報を表示(Pro)」の控えめな1行。押した人にだけ購入画面
 * - Pro: その日の予報。10日より先は「予報は10日先まで」、過ぎた日は何も出さない
 * - ⚠️ Apple Weather のロゴとデータソースへのリンクは**必ず添える**(WeatherKit の規約)
 */
export function WeatherBar({
  trip,
  day,
  unlocked,
  forecast,
  unavailable,
}: {
  trip: Trip;
  day: PlainDate;
  unlocked: boolean;
  forecast: Forecast | null;
  unavailable: boolean;
}) {
  const { t, time } = useI18n();
  const [paywall, setPaywall] = useState(false);

  if (!trip.place || day < today()) return null;

  if (!unlocked) {
    return (
      <>
        <button type="button" className="weather-teaser" onClick={() => setPaywall(true)}>
          ⛅ {t('weather.teaser')}
          <span className="sub">›</span>
        </button>
        {paywall && <Paywall reason="weather" onClose={() => setPaywall(false)} />}
      </>
    );
  }

  if (unavailable) return <p className="weather-bar muted">{t('weather.unavailable')}</p>;
  if (!forecast) return null;

  const f = forecast.days.find((d) => d.date === day);
  if (!f) return <p className="weather-bar muted">🗓 {t('weather.tooFar')}</p>;

  const stale = Date.now() - forecast.fetchedAt > 6 * 60 * 60 * 1000;

  return (
    <div className="weather-bar">
      <span className="weather-main">
        <span className="weather-icon" aria-hidden="true">
          {weatherEmoji(f.symbol)}
        </span>
        <b>{trip.place.name}</b>
        <span>
          {t('weather.high')} {Math.round(f.high)}° / {t('weather.low')} {Math.round(f.low)}°
        </span>
        <span>{t('weather.rain', { p: Math.round(f.precip * 100) })}</span>
      </span>
      <span className="weather-attr">
        {stale && <small>{t('weather.fetchedAt', { when: time(minutesOf(forecast.fetchedAt)) })}</small>}
        {forecast.attribution.logoLight ? (
          <picture>
            <source srcSet={forecast.attribution.logoDark} media="(prefers-color-scheme: dark)" />
            <img src={forecast.attribution.logoLight} alt="Apple Weather" height={12} />
          </picture>
        ) : (
          <small> Weather</small>
        )}
        <button type="button" className="linklike" onClick={() => void openLink(forecast.attribution.legalUrl)}>
          {t('weather.source')}
        </button>
      </span>
    </div>
  );
}

/** `time()` は 0:00 からの分を受け取る */
function minutesOf(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}
