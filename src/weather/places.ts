import type { Trip, TripPlace, TripPlaceChange } from '../db/types';

/**
 * 日ごとの天気の場所。
 *
 * 旅先(`trip.place`)が Day 1 から。`trip.placeChanges` の「Day N から◯◯」で
 * 切り替わり、**次に切り替える日まで続く**。京都 → 大阪 → 神戸の旅なら
 * 切り替えは2回で済む(「その日だけ」だと泊まる日の数だけ入れることになる)。
 *
 * 日は**何日目か**(0 始まり)で持つ。予定と同じで、日程をずらしても一緒に動く。
 */

/** 同じ場所か。名前ではなく座標で見る(同じ町を別の名前で探すことがある) */
export const placeKey = (p: TripPlace) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;

function samePlace(a: TripPlace | undefined, b: TripPlace | undefined): boolean {
  if (!a || !b) return a === b;
  return placeKey(a) === placeKey(b);
}

function sorted(changes: TripPlaceChange[] | undefined): TripPlaceChange[] {
  return [...(changes ?? [])].sort((a, b) => a.fromDay - b.fromDay);
}

/** その日の天気の場所。どこも決まっていなければ undefined */
export function placeForDay(trip: Trip, dayIndex: number): TripPlace | undefined {
  let place = trip.place;
  for (const c of sorted(trip.placeChanges)) {
    if (c.fromDay > dayIndex) break;
    place = c.place;
  }
  return place;
}

/** その日に切り替えが始まるか(Day 1 は旅先そのものなので含めない) */
export function changesOnDay(trip: Trip, dayIndex: number): boolean {
  return (trip.placeChanges ?? []).some((c) => c.fromDay === dayIndex);
}

/** 旅の日数のうちで使われている場所。予報はこの数だけ取りに行く */
export function placesInUse(trip: Trip, days: number): TripPlace[] {
  const seen = new Map<string, TripPlace>();
  for (let i = 0; i < days; i++) {
    const p = placeForDay(trip, i);
    if (p) seen.set(placeKey(p), p);
  }
  return [...seen.values()];
}

/**
 * 「Day N から この場所」にする差分。`place` が undefined なら、
 * Day 1 は旅先を外し、それ以外はその日の切り替えをやめる(前の日の場所が続く)。
 *
 * **意味の無い切り替えは残さない。** 前の日と同じ場所への切り替えは消す ──
 * 残すと、あとで前の日を変えたときにそこだけ取り残される。
 */
export function withPlaceFrom(
  trip: Trip,
  dayIndex: number,
  place: TripPlace | undefined,
): Pick<Trip, 'place' | 'placeChanges'> {
  let base = trip.place;
  let changes = sorted(trip.placeChanges).filter((c) => c.fromDay !== dayIndex);
  if (dayIndex === 0) base = place;
  else if (place) changes = sorted([...changes, { fromDay: dayIndex, place }]);

  const kept: TripPlaceChange[] = [];
  let current = base;
  for (const c of changes) {
    if (c.fromDay <= 0 || samePlace(c.place, current)) continue;
    kept.push(c);
    current = c.place;
  }
  return { place: base, placeChanges: kept };
}

/** その日の場所が何日目から続いているか(0 始まり)。「Day 1 から」と添えるのに使う */
export function placeStartsOn(trip: Trip, dayIndex: number): number {
  let from = 0;
  for (const c of sorted(trip.placeChanges)) {
    if (c.fromDay > dayIndex) break;
    from = c.fromDay;
  }
  return from;
}
