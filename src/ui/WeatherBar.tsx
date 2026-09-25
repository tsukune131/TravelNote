import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { Paywall } from './Paywall';
import { Sheet } from './Sheet';
import { PlaceField } from './PlaceField';
import { updateTrip } from '../db/repo';
import { placeForDay, placeStartsOn, withPlaceFrom } from '../weather/places';
import { openLink } from '../lib/openExternal';
import { weatherEmoji } from '../weather/weather';
import type { Forecast } from '../weather/weather';
import type { PlainDate } from '../lib/plainDate';
import { today } from '../lib/plainDate';
import type { Trip } from '../db/types';

/**
 * その日の天気(Day の一番上)。**その日の場所が決まっているときだけ出る**
 * (場所は日ごとに切り替わる。weather/places.ts)。
 *
 * - Pro でない: 「天気予報を表示(Pro)」の控えめな1行。押した人にだけ購入画面
 * - Pro: その日の予報。10日より先は「予報は10日先まで」、過ぎた日は何も出さない。
 *   **場所の名前を押すと、この日からの場所を切り替えられる**(DayPlaceSheet)。
 *   場所がどこも決まっていなければ「天気の場所を決める」の1行だけ
 * - ⚠️ Apple Weather のロゴとデータソースへのリンクは**必ず添える**(WeatherKit の規約)
 */
export function WeatherBar({
  trip,
  dayIndex,
  day,
  unlocked,
  forecast,
  unavailable,
}: {
  trip: Trip;
  dayIndex: number;
  day: PlainDate;
  unlocked: boolean;
  forecast: Forecast | null;
  unavailable: boolean;
}) {
  const { t, time } = useI18n();
  const [paywall, setPaywall] = useState(false);
  const [choosing, setChoosing] = useState(false);

  if (day < today()) return null;
  const place = placeForDay(trip, dayIndex);

  const sheet = choosing && (
    <DayPlaceSheet trip={trip} dayIndex={dayIndex} onClose={() => setChoosing(false)} />
  );

  if (!place) {
    if (!unlocked) return null;
    return (
      <>
        <button type="button" className="weather-teaser" onClick={() => setChoosing(true)}>
          📍 {t('weather.setPlace')}
          <span className="sub">›</span>
        </button>
        {sheet}
      </>
    );
  }

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

  /** 場所の名前。押すとこの日からの場所を切り替える */
  const placeButton = (
    <button type="button" className="weather-place" onClick={() => setChoosing(true)}>
      📍 {place.name}
      <span className="sub" aria-hidden="true">›</span>
    </button>
  );

  const f = forecast?.days.find((d) => d.date === day);
  if (!forecast || !f) {
    // 予報が無くても場所は切り替えられるようにする(10日より先の日にこそ決めておきたい)
    const reason = unavailable
      ? t('weather.unavailable')
      : forecast
        ? `🗓 ${t('weather.tooFar')}`
        : null;
    return (
      <>
        <div className="weather-bar muted">
          <span className="weather-main">
            {placeButton}
            {reason && <span>{reason}</span>}
          </span>
        </div>
        {sheet}
      </>
    );
  }

  const stale = Date.now() - forecast.fetchedAt > 6 * 60 * 60 * 1000;

  return (
    <>
      <div className="weather-bar">
        <span className="weather-main">
          <span className="weather-icon" aria-hidden="true">
            {weatherEmoji(f.symbol)}
          </span>
          {placeButton}
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
      {sheet}
    </>
  );
}

/**
 * 「Day N からの天気の場所」。場所は次に切り替える日まで続く。
 *
 * - Day 1 は旅先そのもの(外すと旅先なし)
 * - それ以外: この日から切り替えているなら「切り替えをやめる」(前の日の場所に戻る)。
 *   前から続いている場所なら外すボタンは出さない ── 外す先が無い
 */
function DayPlaceSheet({
  trip,
  dayIndex,
  onClose,
}: {
  trip: Trip;
  dayIndex: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const n = dayIndex + 1;
  const from = placeStartsOn(trip, dayIndex);
  const current = placeForDay(trip, dayIndex);

  return (
    <Sheet title={t('weather.dayPlaceTitle', { n })} onClose={onClose}>
      <PlaceField
        value={current}
        label={t('weather.dayPlaceLabel', { n })}
        hint={t('weather.dayPlaceHint')}
        note={from < dayIndex ? t('weather.continuedFrom', { n: from + 1 }) : undefined}
        clearLabel={dayIndex === 0 ? undefined : from === dayIndex ? t('weather.stopChange') : null}
        onChange={(next) => {
          void updateTrip(trip.id, withPlaceFrom(trip, dayIndex, next));
          if (next) onClose();
        }}
      />
    </Sheet>
  );
}

/** `time()` は 0:00 からの分を受け取る */
function minutesOf(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}
