import { useEffect, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { getSetting, setSetting } from '../db/db';
import { addDays, today } from '../lib/plainDate';
import type { PlainDate } from '../lib/plainDate';
import type { Trip, TripPlace } from '../db/types';
import { placeForDay, placeKey, placesInUse } from './places';

/**
 * 天気予報(Apple の WeatherKit)。**Pro の機能。**
 *
 * 取りに行くのはネイティブ(`ios/App/App/WeatherPlugin.swift`)。
 * WeatherKit は iOS 16 から。それより古い端末では「取得できません」と出す。
 *
 * - **予報は10日先まで。** それより先の日には出さない
 * - **圏外では最後に取れた予報を、取得時刻つきで出す**(旅先の日常)
 * - ⚠️ **Apple Weather の表示(ロゴとデータソースへのリンク)が必須**(WeatherKit の規約)
 *
 * 地名から座標を引くのも同じプラグイン(CLGeocoder)。場所の名前は Apple に送られる。
 */

export type DayForecast = {
  /** 旅先の暦での日付 */
  date: PlainDate;
  /** SF Symbols の名前(`sun.max` など)。絵文字に置き換えて出す */
  symbol: string;
  high: number;
  low: number;
  /** 降水確率 0〜1 */
  precip: number;
};

export type Attribution = {
  logoLight: string;
  logoDark: string;
  legalUrl: string;
};

export type Forecast = {
  days: DayForecast[];
  attribution: Attribution;
  fetchedAt: number;
};

type WeatherPlugin = {
  geocode(options: { query: string }): Promise<{ places: TripPlace[] }>;
  forecast(options: {
    lat: number;
    lng: number;
    timeZone?: string;
  }): Promise<{ days: DayForecast[]; attribution: Attribution }>;
};

const Weather = registerPlugin<WeatherPlugin>('TravelNoteWeather');

const native = Capacitor.isNativePlatform();

/** WeatherKit が 10 日先まで返す。11 日目以降は出さない */
export const FORECAST_DAYS = 10;

/** これより新しい予報は取り直さない。開くたびに通信しない */
const FRESH_MS = 3 * 60 * 60 * 1000;

export class WeatherUnavailable extends Error {}

/* ────────── 開発用 ────────── */

/** ブラウザでは WeatherKit が無い。画面を確かめられるよう、それらしい予報を返す */
function devForecast(place: TripPlace): Forecast {
  const symbols = ['sun.max', 'cloud.sun', 'cloud', 'cloud.rain', 'sun.max', 'cloud.drizzle'];
  // 場所で少しずらす。日ごとに場所を切り替えたのが見てわかるように
  const shift = Math.round(place.lat * 10) % symbols.length;
  return {
    days: Array.from({ length: FORECAST_DAYS }, (_, i) => ({
      date: addDays(today(), i),
      symbol: symbols[(i + shift) % symbols.length],
      high: 24 - ((i + shift) % 4),
      low: 15 - (i % 3),
      precip: (i % 5) / 5,
    })),
    attribution: {
      logoLight: '',
      logoDark: '',
      legalUrl: 'https://weatherkit.apple.com/legal-attribution.html',
    },
    fetchedAt: Date.now(),
  };
}

/* ────────── 地名検索 ────────── */

export async function searchPlace(query: string): Promise<TripPlace[]> {
  if (!native) {
    // 名前ごとに座標を変える(同じ座標だと別の場所として扱えない)
    if (import.meta.env.DEV) {
      const n = [...query].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000, 0);
      return [{ name: query, lat: 33 + n / 500, lng: 135.7681, timeZone: 'Asia/Tokyo' }];
    }
    throw new WeatherUnavailable();
  }
  const { places } = await Weather.geocode({ query });
  return places;
}

/* ────────── 予報 ────────── */

/*
 * 予報は**場所ごと**に持つ(旅ごとではない)。日によって場所が変わる旅でも、
 * 取りに行くのは使っている場所の数だけ。別の旅と同じ町なら記録を使い回す。
 */
const cacheKey = (p: TripPlace) => `weather.at.${placeKey(p)}`;

async function readCache(place: TripPlace): Promise<Forecast | null> {
  const raw = await getSetting(cacheKey(place));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Forecast;
  } catch {
    return null;
  }
}

async function fetchForecast(place: TripPlace): Promise<Forecast> {
  if (!native) {
    if (import.meta.env.DEV) return devForecast(place);
    throw new WeatherUnavailable();
  }
  try {
    const r = await Weather.forecast({ lat: place.lat, lng: place.lng, timeZone: place.timeZone });
    return { ...r, fetchedAt: Date.now() };
  } catch (err) {
    // iOS 15 の端末(WeatherKit が無い)。通信の失敗とは分けて「取得できません」と出す
    if ((err as { code?: string }).code === 'unavailable') throw new WeatherUnavailable();
    throw err;
  }
}

/**
 * 旅の予報。日ごとの場所(weather/places.ts)ぶんを取り、**その日の場所の予報**を返す。
 * 手元の記録をまず返し、古ければ取り直す。
 * **取り直しに失敗しても手元の記録は捨てない**(圏外で予報が消えるのが一番困る)。
 */
export function useTripWeather(
  trip: Trip | undefined,
  days: number,
  enabled: boolean,
): { forecastFor: (dayIndex: number) => Forecast | null; unavailable: boolean } {
  const [byPlace, setByPlace] = useState<ReadonlyMap<string, Forecast>>(new Map());
  const [unavailable, setUnavailable] = useState(false);
  const places = trip ? placesInUse(trip, days) : [];
  const key = places.map(placeKey).sort().join('|');

  useEffect(() => {
    setByPlace(new Map());
    setUnavailable(false);
    if (!enabled || places.length === 0) return;
    let alive = true;
    const put = (p: TripPlace, f: Forecast) => {
      if (alive) setByPlace((prev) => new Map(prev).set(placeKey(p), f));
    };
    for (const place of places) {
      void (async () => {
        const cached = await readCache(place);
        if (cached) put(place, cached);
        if (cached && Date.now() - cached.fetchedAt < FRESH_MS) return;
        try {
          const fresh = await fetchForecast(place);
          await setSetting(cacheKey(place), JSON.stringify(fresh));
          put(place, fresh);
        } catch (err) {
          if (alive && !cached && err instanceof WeatherUnavailable) setUnavailable(true);
          // 圏外などは黙って手元の記録のまま
        }
      })();
    }
    return () => {
      alive = false;
    };
    // key が使っている場所をまとめて表している
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  function forecastFor(dayIndex: number): Forecast | null {
    const place = trip && placeForDay(trip, dayIndex);
    return (place && byPlace.get(placeKey(place))) ?? null;
  }

  return { forecastFor, unavailable };
}

/* ────────── 表示 ────────── */

/**
 * SF Symbols の名前を絵文字にする。**名前の中の語で判定する**
 * (`cloud.sun.rain.fill` のように組み合わさるので、強い順に見る)。
 */
export function weatherEmoji(symbol: string): string {
  const s = symbol.toLowerCase();
  if (s.includes('bolt')) return '⛈️';
  if (s.includes('snow') || s.includes('sleet')) return '🌨️';
  if (s.includes('rain') || s.includes('drizzle')) return s.includes('sun') ? '🌦️' : '🌧️';
  if (s.includes('fog') || s.includes('haze') || s.includes('smoke')) return '🌫️';
  if (s.includes('wind') || s.includes('tornado') || s.includes('hurricane')) return '🌬️';
  if (s.includes('cloud')) return s.includes('sun') || s.includes('moon') ? '⛅' : '☁️';
  if (s.includes('sun') || s.includes('moon')) return '☀️';
  return '🌡️';
}
