/**
 * 外部の地図アプリへ渡す URL を組み立てる。
 *
 * 方針(docs/ux-design.md §5.1):
 * 地図はアプリ内に埋め込まない。APIキー・利用規約・プライバシー申告のコストを
 * 招くうえ、旅行者は結局慣れたナビを使う。**既定のアプリをユーザーに選ばせて投げる。**
 *
 * 実装上の落とし穴:
 * `comgooglemaps` を Info.plist の `LSApplicationQueriesSchemes` に登録しないと、
 * Google マップが入っていても `canOpenURL` が false を返し、常に Web に落ちる。
 */
export type MapProvider = 'apple' | 'google';

export type TravelMode = 'walk' | 'transit' | 'drive';

export type MapPlace = {
  name?: string;
  lat?: number;
  lng?: number;
};

/** 座標があれば座標を優先する(同名の店が各地にあるため) */
function query(place: MapPlace): string {
  if (place.lat !== undefined && place.lng !== undefined) {
    return `${place.lat},${place.lng}`;
  }
  return place.name?.trim() ?? '';
}

const APPLE_MODE: Record<TravelMode, string> = { walk: 'w', transit: 'r', drive: 'd' };
const GOOGLE_MODE: Record<TravelMode, string> = {
  walk: 'walking',
  transit: 'transit',
  drive: 'driving',
};

/** 1地点を開く URL。`app` は端末にアプリが入っている前提の URL スキーム */
export function placeUrl(provider: MapProvider, place: MapPlace): { app: string; web: string } {
  const q = encodeURIComponent(query(place));
  const label = place.name ? encodeURIComponent(place.name) : '';

  if (provider === 'apple') {
    // Apple マップは https でもアプリが開く。web/app を分ける必要がない
    const url =
      place.lat !== undefined && place.lng !== undefined
        ? `https://maps.apple.com/?ll=${place.lat},${place.lng}${label ? `&q=${label}` : ''}`
        : `https://maps.apple.com/?q=${q}`;
    return { app: url, web: url };
  }

  return {
    app: `comgooglemaps://?q=${q}`,
    web: `https://www.google.com/maps/search/?api=1&query=${q}`,
  };
}

/** 2地点の経路。移動コネクタのタップで使う */
export function directionsUrl(
  provider: MapProvider,
  from: MapPlace,
  to: MapPlace,
  mode: TravelMode,
): { app: string; web: string } {
  const origin = encodeURIComponent(query(from));
  const destination = encodeURIComponent(query(to));

  if (provider === 'apple') {
    const url = `https://maps.apple.com/?saddr=${origin}&daddr=${destination}&dirflg=${APPLE_MODE[mode]}`;
    return { app: url, web: url };
  }

  const m = GOOGLE_MODE[mode];
  return {
    app: `comgooglemaps://?saddr=${origin}&daddr=${destination}&directionsmode=${m}`,
    web: `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${m}`,
  };
}

/** `canOpenURL` に渡すスキーム。Info.plist の LSApplicationQueriesSchemes と揃える */
export const APP_SCHEMES: Record<MapProvider, string | null> = {
  apple: null, // 標準アプリなので問い合わせ不要
  google: 'comgooglemaps',
};

/* ────────── 移動時間の概算 ────────── */

/**
 * 直線距離(km)から移動手段を推定する。
 * **経路探索APIは使わない**(課金とプライバシー申告が増える)。
 * あくまで概算で、UI 側では必ず「約」を付けて出す。
 */
export function guessTravelMode(km: number): TravelMode {
  if (km <= 1.2) return 'walk';
  if (km <= 30) return 'transit';
  return 'drive';
}

/** 手段ごとの実効速度(km/h)。直線距離を道なりに換算する係数を織り込んである */
const SPEED_KMH: Record<TravelMode, number> = { walk: 3.6, transit: 22, drive: 30 };

export function estimateTravelMinutes(km: number, mode: TravelMode): number {
  const minutes = (km / SPEED_KMH[mode]) * 60;
  // 乗り換えや駐車の固定コスト
  const overhead = mode === 'walk' ? 0 : mode === 'transit' ? 8 : 5;
  return Math.max(1, Math.round(minutes + overhead));
}

/** 2地点の直線距離(km)。Haversine */
export function distanceKm(a: Required<Pick<MapPlace, 'lat' | 'lng'>>, b: Required<Pick<MapPlace, 'lat' | 'lng'>>): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* ────────── リンクのラベル自動判定 ────────── */

export type LinkLabelId = 'tabelog' | 'booking' | 'official' | 'photo' | 'map' | 'other';

const LINK_RULES: ReadonlyArray<{ test: RegExp; id: LinkLabelId }> = [
  { test: /(^|\.)tabelog\.com$/i, id: 'tabelog' },
  {
    test: /(^|\.)(jalan\.net|travel\.rakuten\.co\.jp|booking\.com|expedia\.|agoda\.com|ikyu\.com|jtb\.co\.jp|hotels\.com)$/i,
    id: 'booking',
  },
  { test: /(^|\.)(instagram\.com|flickr\.com|pinterest\.)/i, id: 'photo' },
  { test: /(^|\.)(google\.[a-z.]+|maps\.apple\.com|goo\.gl)$/i, id: 'map' },
];

/** URL からリンクの種別を推定する。UI 側で i18n の `linkLabel.*` に引く */
export function guessLinkLabel(url: string): LinkLabelId {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return 'other';
  }
  for (const rule of LINK_RULES) {
    if (rule.test.test(host)) return rule.id;
  }
  return 'official';
}
