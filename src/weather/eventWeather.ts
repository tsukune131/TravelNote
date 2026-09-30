import { useEffect, useState } from 'react';
import { getSetting, setSetting } from '../db/db';
import { coordsFromMapUrl, distanceKm, mapLinkOf } from '../lib/maps';
import { dateOfDay, diffDays, today } from '../lib/plainDate';
import type { Trip, TripEvent, TripPlace } from '../db/types';
import { placeForDay, placeKey } from './places';
import { FORECAST_DAYS, FRESH_MS, Weather, native } from './weather';
import type { HourForecast } from './weather';

/**
 * **予定の時刻の天気**(地図アイコンの横の絵文字)。Pro の機能。
 *
 * 予定の場所は次の順で決める。
 *
 * 1. 予定の座標(あれば)
 * 2. **貼られた地図リンク** ── ユーザーが選んだ場所なので、どれだけ遠くても信じる。
 *    座標が URL に無い短縮リンク(`maps.app.goo.gl`)はリダイレクトをたどって探し、
 *    それでも無ければリンクの中の場所名・住所で検索する
 * 3. **予定の名前をその日の天気の場所の近くで検索**(Apple に送られる)。
 *    同名の別の店に当たることがあるので、**その日の場所から30kmより遠ければ捨てる**
 * 4. どれもだめなら、その日の天気の場所
 *
 * 出すのは、時刻のある予定・その日の天気の場所が決まっている日・
 * 今日から10日のあいだ・まだ来ていない時刻だけ。
 *
 * - 見つけた場所は**予定には書き込まない**(同期されて地図ボタンの行き先まで変わる)。
 *   端末の設定に覚えておくだけ
 * - 予報は約10kmの格子ごとに1回取る。同じ町の予定が10件あっても通信は1回
 */

/** 名前の検索で、その日の場所からこれより遠い結果は同名の別の場所とみなす */
const MAX_KM = 30;

type LatLng = { lat: number; lng: number };

/* ────────── 予定の場所 ────────── */

/** 探した結果。`none` は「探したが無い」── 通信の失敗とは分けて、覚えておく */
type SpotRecord = LatLng | { none: true };

const spotKey = (s: string) => `weather.spot.${s}`;

async function remembered(key: string, find: () => Promise<LatLng | null>): Promise<LatLng | null> {
  const raw = await getSetting(spotKey(key));
  if (raw) {
    try {
      const r = JSON.parse(raw) as SpotRecord;
      return 'none' in r ? null : r;
    } catch {
      // 壊れていたら探し直す
    }
  }
  // 通信の失敗は投げたまま(覚えない。次に開いたときに探し直す)
  const found = await find();
  await setSetting(spotKey(key), JSON.stringify(found ?? { none: true }));
  return found;
}

async function searchNear(query: string, near: TripPlace): Promise<LatLng | null> {
  if (!native) {
    if (!import.meta.env.DEV) return null;
    // ブラウザ: 名前ごとに少しずらす(予定ごとに別の格子になるのを確かめられるように)
    const n = [...query].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 100, 0);
    return { lat: near.lat + n / 400, lng: near.lng };
  }
  const r = await Weather.searchNear({ query, lat: near.lat, lng: near.lng });
  return r.lat !== undefined && r.lng !== undefined ? { lat: r.lat, lng: r.lng } : null;
}

/**
 * 地図リンクの中の場所名・住所(`?q=一蘭 本店, 京都市…`、`/maps/place/清水寺/`)。
 * 座標が取れないリンクで、検索の手がかりにする
 */
export function textFromMapUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  for (const key of ['q', 'query', 'daddr', 'address', 'name']) {
    const value = parsed.searchParams.get(key)?.trim();
    if (value && !/^-?\d/.test(value)) return value;
  }
  const place = /\/maps\/place\/([^/]+)/.exec(parsed.pathname);
  if (place) return decodeURIComponent(place[1].replace(/\+/g, ' '));
  return null;
}

/** 短縮リンクか(開かないと行き先が分からない) */
function isShortLink(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return /(^|\.)goo\.gl$/i.test(host) || host === 'maps.apple';
  } catch {
    return false;
  }
}

async function spotFromLink(url: string, near: TripPlace): Promise<LatLng | null> {
  const direct = coordsFromMapUrl(url);
  if (direct) return direct;
  return remembered(`link.${url}`, async () => {
    let urls = [url];
    if (isShortLink(url) && native) {
      urls = [url, ...(await Weather.expandLink({ url })).urls];
    }
    for (const u of urls) {
      const c = coordsFromMapUrl(u);
      if (c) return c;
    }
    // 住所まで入っていることが多いので、遠くても捨てない(ユーザーが選んだ場所)
    for (const u of urls) {
      const text = textFromMapUrl(u);
      if (text) return searchNear(text, near);
    }
    return null;
  });
}

async function spotFromName(name: string, near: TripPlace): Promise<LatLng | null> {
  const query = name.trim();
  if (!query) return null;
  return remembered(`name.${placeKey(near)}.${query}`, async () => {
    const found = await searchNear(query, near);
    return found && distanceKm(near, found) <= MAX_KM ? found : null;
  });
}

async function spotOf(event: TripEvent, dayPlace: TripPlace): Promise<LatLng> {
  if (event.lat !== undefined && event.lng !== undefined) return { lat: event.lat, lng: event.lng };
  try {
    const link = mapLinkOf(event.links);
    const found = link
      ? await spotFromLink(link, dayPlace)
      : await spotFromName(event.name, dayPlace);
    return found ?? dayPlace;
  } catch {
    // 圏外など。その日の場所で代わりにする
    return dayPlace;
  }
}

/* ────────── 1時間ごとの予報 ────────── */

type Hourly = { hours: HourForecast[]; fetchedAt: number };

/** 約10km の格子。予報はこの単位で取って使い回す */
function grid({ lat, lng }: LatLng): LatLng {
  return { lat: Math.round(lat * 10) / 10, lng: Math.round(lng * 10) / 10 };
}
const gridKey = (g: LatLng) => `${g.lat.toFixed(1)},${g.lng.toFixed(1)}`;
const hourlyKey = (g: LatLng) => `weather.hourly.${gridKey(g)}`;

function devHourly(g: LatLng): Hourly {
  const symbols = ['sun.max', 'cloud.sun', 'cloud', 'cloud.rain', 'moon.stars', 'cloud.drizzle'];
  const shift = Math.round(g.lat * 10) % symbols.length;
  const hours: HourForecast[] = [];
  for (let d = 0; d < FORECAST_DAYS; d++) {
    for (let h = 0; h < 24; h++) {
      const night = h < 6 || h >= 19;
      hours.push({
        date: dateOfDay(today(), d),
        hour: h,
        symbol: night ? 'moon.stars' : symbols[(d + Math.floor(h / 4) + shift) % symbols.length],
        temp: 15 + Math.round(6 * Math.sin(((h - 8) / 24) * Math.PI * 2)),
        precip: ((h + d) % 5) / 5,
      });
    }
  }
  return { hours, fetchedAt: Date.now() };
}

async function readHourly(g: LatLng): Promise<Hourly | null> {
  const raw = await getSetting(hourlyKey(g));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Hourly;
  } catch {
    return null;
  }
}

/** 手元の記録が新しければそれ。古ければ取り直し、**失敗したら古い記録のまま** */
async function hourlyAt(g: LatLng, timeZone: string | undefined): Promise<Hourly | null> {
  const cached = await readHourly(g);
  if (cached && Date.now() - cached.fetchedAt < FRESH_MS) return cached;
  try {
    let fresh: Hourly;
    if (native) {
      const r = await Weather.hourly({ lat: g.lat, lng: g.lng, timeZone });
      fresh = { hours: r.hours, fetchedAt: Date.now() };
    } else if (import.meta.env.DEV) {
      fresh = devHourly(g);
    } else {
      return cached;
    }
    await setSetting(hourlyKey(g), JSON.stringify(fresh));
    return fresh;
  } catch {
    return cached;
  }
}

/* ────────── 画面から ────────── */

/** 予定の開始時刻の、旅先の暦での日付と時(0:00 を越えて入った予定は翌日へ) */
function slotOf(dayDate: string, startMinutes: number): { date: string; hour: number } {
  const days = Math.floor(startMinutes / 1440);
  return {
    date: dateOfDay(dayDate, days),
    hour: Math.floor((startMinutes - days * 1440) / 60),
  };
}

/**
 * その日の予定ごとの天気。返すのは「予定 → その時刻の予報(無ければ undefined)」。
 * 予定の時刻を動かしても**取り直さない**(10日ぶんを持っているので引き直すだけ)。
 */
export function useEventWeather(
  trip: Trip | undefined,
  dayIndex: number,
  events: readonly TripEvent[] | undefined,
  enabled: boolean,
): (event: TripEvent) => HourForecast | undefined {
  /** 予定 → 格子 と、格子 → 予報 */
  const [spots, setSpots] = useState<ReadonlyMap<string, string>>(new Map());
  const [byGrid, setByGrid] = useState<ReadonlyMap<string, Hourly>>(new Map());

  const dayPlace = trip && dayIndex >= 0 ? placeForDay(trip, dayIndex) : undefined;
  const dayDate = trip && dayIndex >= 0 ? dateOfDay(trip.startDate, dayIndex) : undefined;
  const ahead = dayDate ? diffDays(today(), dayDate) : -1;
  const active = enabled && !!dayPlace && ahead >= 0 && ahead < FORECAST_DAYS;

  const timed = (events ?? []).filter((e) => e.startMinutes !== null);
  // 場所が変わりうるものだけで作る(時刻は入れない。動かすたびに探し直さない)
  const key = timed.map((e) => `${e.id}\u0000${e.name}\u0000${mapLinkOf(e.links) ?? ''}\u0000${e.lat},${e.lng}`).join('\u0001');
  const placeId = dayPlace ? `${placeKey(dayPlace)}|${dayPlace.timeZone ?? ''}` : '';

  useEffect(() => {
    if (!active || !dayPlace) return;
    let alive = true;
    const fetching = new Map<string, Promise<void>>();

    void (async () => {
      // 1件ずつ。MapKit の検索は短時間に叩くと断られる
      for (const event of timed) {
        const spot = await spotOf(event, dayPlace);
        if (!alive) return;
        const g = grid(spot);
        const gk = gridKey(g);
        setSpots((prev) => new Map(prev).set(event.id, gk));
        if (!fetching.has(gk)) {
          fetching.set(
            gk,
            hourlyAt(g, dayPlace.timeZone).then((h) => {
              if (alive && h) setByGrid((prev) => new Map(prev).set(gk, h));
            }),
          );
        }
      }
    })();
    return () => {
      alive = false;
    };
    // key と placeId が timed と dayPlace をまとめて表している
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, key, placeId]);

  return (event) => {
    if (!active || !dayDate || event.startMinutes === null) return undefined;
    const gk = spots.get(event.id);
    const hourly = gk ? byGrid.get(gk) : undefined;
    if (!hourly) return undefined;
    const { date, hour } = slotOf(dayDate, event.startMinutes);
    // 過ぎた時刻は出さない(記録が古いと、過ぎた時間ぶんも残っている)
    const now = new Date();
    if (date < today() || (date === today() && hour < now.getHours())) return undefined;
    return hourly.hours.find((h) => h.date === date && h.hour === hour);
  };
}
